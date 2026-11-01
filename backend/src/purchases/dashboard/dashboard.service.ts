import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const DAY = 86_400_000;
const supplierSelect = { id: true, code: true, name: true } as const;
const awaiting = ['CONFIRMED', 'PARTIALLY_RECEIVED'] as const;
const committed = [...awaiting, 'RECEIVED'] as const;
type SupplierRow = { id: string; code: string; name: string; orders: bigint; amount: string };
type RecentRow = {
  id: string;
  number: string;
  status: string;
  orderedAt: Date;
  expectedDate: string | null;
  total: string;
  itemsCount: bigint;
  receiptsCount: bigint;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DashboardQueryDto) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const today = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const currentDate = `${today.year}-${today.month}-${today.day}`;
    const to = query.to ?? currentDate;
    const from =
      query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
    if (from < '0001-01-01')
      throw new BadRequestException('El rango requiere fechas desde 0001-01-01');
    if (from > to) throw new BadRequestException('from no puede ser posterior a to');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
    if (days > 366)
      throw new BadRequestException('El rango del dashboard no puede superar 366 días');
    const granularity = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';

    const selectedSupplier = query.supplierId
      ? await this.prisma.supplier.findUnique({
          where: { id: query.supplierId },
          select: supplierSelect,
        })
      : null;
    if (query.supplierId && !selectedSupplier)
      throw new NotFoundException('Proveedor no encontrado');
    const filter = query.supplierId
      ? Prisma.sql`AND po.supplier_id = ${query.supplierId}::uuid`
      : Prisma.empty;
    const bounds = (column: Prisma.Sql) => Prisma.sql`
      ${column} >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
      AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    const orderBounds = bounds(Prisma.sql`po.ordered_at`);
    const receiptBounds = bounds(Prisma.sql`r.received_at`);
    // A repeatable read keeps independently aggregated sections reconcilable during live receipts.
    return this.prisma.$transaction(
      async (tx) => {
        const [active, pipelineRows, statuses, amountRows, receiptRows, series, top, recent] =
          await Promise.all([
            tx.supplier.count({ where: { isActive: true } }),
            tx.$queryRaw<{ awaitingReceipt: bigint; overdue: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS "awaitingReceipt", COUNT(*) FILTER (WHERE po.expected_date < ${currentDate}::date) AS overdue
          FROM purchase_orders po WHERE po.status IN (${Prisma.join(awaiting)}) ${filter}
        `),
            tx.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
          SELECT po.status::text AS status, COUNT(*) AS count
          FROM purchase_orders po WHERE ${orderBounds} ${filter} GROUP BY po.status
        `),
            tx.$queryRaw<{ amount: string; suppliers: bigint }[]>(Prisma.sql`
          SELECT COALESCE((SELECT SUM(i.line_total) FROM purchase_order_items i
            JOIN purchase_orders po ON po.id = i.purchase_order_id
            WHERE ${orderBounds} ${filter} AND po.status IN (${Prisma.join(committed)})), 0)::text AS amount,
            (SELECT COUNT(DISTINCT po.supplier_id) FROM purchase_orders po WHERE ${orderBounds} ${filter}) AS suppliers
        `),
            tx.$queryRaw<{ total: bigint; lines: bigint }[]>(Prisma.sql`
          SELECT COUNT(DISTINCT r.id) AS total, COUNT(i.id) AS lines FROM purchase_receipts r
          JOIN purchase_orders po ON po.id = r.purchase_order_id
          LEFT JOIN purchase_receipt_items i ON i.purchase_receipt_id = r.id
          WHERE ${receiptBounds} ${filter}
        `),
            tx.$queryRaw<{ period: string; orders: bigint; receipts: bigint }[]>(Prisma.sql`
          WITH buckets AS (
            SELECT generate_series(date_trunc(${granularity}, ${from}::date::timestamp),
              date_trunc(${granularity}, ${to}::date::timestamp), ('1 ' || ${granularity})::interval) AS bucket
          ), orders AS (
            SELECT date_trunc(${granularity}, po.ordered_at AT TIME ZONE ${TIME_ZONE}) AS bucket, COUNT(*) AS count
            FROM purchase_orders po WHERE ${orderBounds} ${filter} GROUP BY 1
          ), receipts AS (
            SELECT date_trunc(${granularity}, r.received_at AT TIME ZONE ${TIME_ZONE}) AS bucket, COUNT(*) AS count
            FROM purchase_receipts r JOIN purchase_orders po ON po.id = r.purchase_order_id
            WHERE ${receiptBounds} ${filter} GROUP BY 1
          )
          SELECT to_char(b.bucket, 'YYYY-MM-DD') AS period,
            COALESCE(o.count, 0) AS orders, COALESCE(r.count, 0) AS receipts
          FROM buckets b LEFT JOIN orders o USING (bucket) LEFT JOIN receipts r USING (bucket) ORDER BY b.bucket
        `),
            tx.$queryRaw<SupplierRow[]>(Prisma.sql`
          WITH orders AS (
            SELECT po.supplier_id, COUNT(*) AS orders FROM purchase_orders po
            WHERE ${orderBounds} ${filter} GROUP BY po.supplier_id
          ), amounts AS (
            SELECT po.supplier_id, SUM(i.line_total) AS amount FROM purchase_orders po
            JOIN purchase_order_items i ON i.purchase_order_id = po.id
            WHERE ${orderBounds} ${filter} AND po.status IN (${Prisma.join(committed)}) GROUP BY po.supplier_id
          )
          SELECT s.id, s.code, s.name, o.orders, COALESCE(a.amount, 0)::text AS amount
          FROM orders o JOIN suppliers s ON s.id = o.supplier_id LEFT JOIN amounts a USING (supplier_id)
          ORDER BY COALESCE(a.amount, 0) DESC, o.orders DESC, s.code, s.id LIMIT 5
        `),
            tx.$queryRaw<RecentRow[]>(Prisma.sql`
          WITH recent AS (
            SELECT po.* FROM purchase_orders po WHERE ${orderBounds} ${filter}
            ORDER BY po.ordered_at DESC, po.created_at DESC, po.id DESC LIMIT 5
          )
          SELECT po.id, po.number, po.status::text AS status, po.ordered_at AS "orderedAt",
            to_char(po.expected_date, 'YYYY-MM-DD') AS "expectedDate",
            COALESCE(items.total, 0)::text AS total, items.count AS "itemsCount",
            (SELECT COUNT(*) FROM purchase_receipts r WHERE r.purchase_order_id = po.id) AS "receiptsCount",
            s.id AS "supplierId", s.code AS "supplierCode", s.name AS "supplierName"
          FROM recent po JOIN suppliers s ON s.id = po.supplier_id
          CROSS JOIN LATERAL (SELECT SUM(i.line_total) AS total, COUNT(*) AS count
            FROM purchase_order_items i WHERE i.purchase_order_id = po.id) items
          ORDER BY po.ordered_at DESC, po.created_at DESC, po.id DESC
        `),
          ]);
        const counts = new Map(statuses.map((r) => [r.status, Number(r.count)]));
        const decimal = (value: string) => new Prisma.Decimal(value).toFixed(2);
        return {
          period: { from, to, timeZone: TIME_ZONE, granularity },
          selectedSupplier,
          suppliers: { active, usedInPeriod: Number(amountRows[0].suppliers) },
          pipeline: {
            awaitingReceipt: Number(pipelineRows[0].awaitingReceipt),
            overdue: Number(pipelineRows[0].overdue),
          },
          orders: {
            total: statuses.reduce((sum, r) => sum + Number(r.count), 0),
            draft: counts.get('DRAFT') ?? 0,
            confirmed: counts.get('CONFIRMED') ?? 0,
            partiallyReceived: counts.get('PARTIALLY_RECEIVED') ?? 0,
            received: counts.get('RECEIVED') ?? 0,
            cancelled: counts.get('CANCELLED') ?? 0,
          },
          amounts: { committed: decimal(amountRows[0].amount) },
          receipts: { total: Number(receiptRows[0].total), lines: Number(receiptRows[0].lines) },
          activityByPeriod: series.map((r) => ({
            period: r.period,
            orders: Number(r.orders),
            receipts: Number(r.receipts),
          })),
          topSuppliers: top.map((r) => ({
            supplier: { id: r.id, code: r.code, name: r.name },
            orders: Number(r.orders),
            committedAmount: decimal(r.amount),
          })),
          recentOrders: recent.map((r) => ({
            id: r.id,
            number: r.number,
            status: r.status,
            orderedAt: r.orderedAt.toISOString(),
            expectedDate: r.expectedDate,
            total: decimal(r.total),
            itemsCount: Number(r.itemsCount),
            receiptsCount: Number(r.receiptsCount),
            supplier: { id: r.supplierId, code: r.supplierCode, name: r.supplierName },
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
