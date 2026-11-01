import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const DAY = 86_400_000;
const customerSelect = { id: true, code: true, name: true } as const;
const awaiting = ['CONFIRMED', 'PARTIALLY_DISPATCHED'] as const;
const confirmed = [...awaiting, 'DISPATCHED'] as const;
type CustomerRow = { id: string; code: string; name: string; orders: bigint; amount: string };
type RecentRow = {
  id: string;
  number: string;
  status: string;
  orderedAt: Date;
  total: string;
  itemsCount: bigint;
  dispatchesCount: bigint;
  customerId: string;
  customerCode: string;
  customerName: string;
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

    const selectedCustomer = query.customerId
      ? await this.prisma.customer.findUnique({
          where: { id: query.customerId },
          select: customerSelect,
        })
      : null;
    if (query.customerId && !selectedCustomer) throw new NotFoundException('Cliente no encontrado');
    const filter = query.customerId
      ? Prisma.sql`AND po.customer_id = ${query.customerId}::uuid`
      : Prisma.empty;
    const bounds = (column: Prisma.Sql) => Prisma.sql`
      ${column} >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
      AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    const orderBounds = bounds(Prisma.sql`po.ordered_at`);
    const dispatchBounds = bounds(Prisma.sql`r.dispatched_at`);
    // A repeatable read keeps independently aggregated sections reconcilable during live dispatches.
    return this.prisma.$transaction(
      async (tx) => {
        const [active, pipelineRows, statuses, amountRows, dispatchRows, series, top, recent] =
          await Promise.all([
            tx.customer.count({ where: { isActive: true } }),
            tx.$queryRaw<{ awaitingDispatch: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS "awaitingDispatch"
          FROM sale_orders po WHERE po.status IN (${Prisma.join(awaiting)}) ${filter}
        `),
            tx.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
          SELECT po.status::text AS status, COUNT(*) AS count
          FROM sale_orders po WHERE ${orderBounds} ${filter} GROUP BY po.status
        `),
            tx.$queryRaw<{ amount: string; customers: bigint }[]>(Prisma.sql`
          SELECT COALESCE((SELECT SUM(i.line_total) FROM sale_order_items i
            JOIN sale_orders po ON po.id = i.sale_order_id
            WHERE ${orderBounds} ${filter} AND po.status IN (${Prisma.join(confirmed)})), 0)::text AS amount,
            (SELECT COUNT(DISTINCT po.customer_id) FROM sale_orders po WHERE ${orderBounds} ${filter}) AS customers
        `),
            tx.$queryRaw<{ total: bigint; lines: bigint }[]>(Prisma.sql`
          SELECT COUNT(DISTINCT r.id) AS total, COUNT(i.id) AS lines FROM sale_dispatches r
          JOIN sale_orders po ON po.id = r.sale_order_id
          LEFT JOIN sale_dispatch_items i ON i.sale_dispatch_id = r.id
          WHERE ${dispatchBounds} ${filter}
        `),
            tx.$queryRaw<{ period: string; orders: bigint; dispatches: bigint }[]>(Prisma.sql`
          WITH buckets AS (
            SELECT generate_series(date_trunc(${granularity}, ${from}::date::timestamp),
              date_trunc(${granularity}, ${to}::date::timestamp), ('1 ' || ${granularity})::interval) AS bucket
          ), orders AS (
            SELECT date_trunc(${granularity}, po.ordered_at AT TIME ZONE ${TIME_ZONE}) AS bucket, COUNT(*) AS count
            FROM sale_orders po WHERE ${orderBounds} ${filter} GROUP BY 1
          ), dispatches AS (
            SELECT date_trunc(${granularity}, r.dispatched_at AT TIME ZONE ${TIME_ZONE}) AS bucket, COUNT(*) AS count
            FROM sale_dispatches r JOIN sale_orders po ON po.id = r.sale_order_id
            WHERE ${dispatchBounds} ${filter} GROUP BY 1
          )
          SELECT to_char(b.bucket, 'YYYY-MM-DD') AS period,
            COALESCE(o.count, 0) AS orders, COALESCE(r.count, 0) AS dispatches
          FROM buckets b LEFT JOIN orders o USING (bucket) LEFT JOIN dispatches r USING (bucket) ORDER BY b.bucket
        `),
            tx.$queryRaw<CustomerRow[]>(Prisma.sql`
          WITH orders AS (
            SELECT po.customer_id, COUNT(*) AS orders FROM sale_orders po
            WHERE ${orderBounds} ${filter} GROUP BY po.customer_id
          ), amounts AS (
            SELECT po.customer_id, SUM(i.line_total) AS amount FROM sale_orders po
            JOIN sale_order_items i ON i.sale_order_id = po.id
            WHERE ${orderBounds} ${filter} AND po.status IN (${Prisma.join(confirmed)}) GROUP BY po.customer_id
          )
          SELECT s.id, s.code, s.name, o.orders, COALESCE(a.amount, 0)::text AS amount
          FROM orders o JOIN customers s ON s.id = o.customer_id LEFT JOIN amounts a USING (customer_id)
          ORDER BY COALESCE(a.amount, 0) DESC, o.orders DESC, s.code, s.id LIMIT 5
        `),
            tx.$queryRaw<RecentRow[]>(Prisma.sql`
          WITH recent AS (
            SELECT po.* FROM sale_orders po WHERE ${orderBounds} ${filter}
            ORDER BY po.ordered_at DESC, po.created_at DESC, po.id DESC LIMIT 5
          )
          SELECT po.id, po.number, po.status::text AS status, po.ordered_at AS "orderedAt",
            COALESCE(items.total, 0)::text AS total, items.count AS "itemsCount",
            (SELECT COUNT(*) FROM sale_dispatches r WHERE r.sale_order_id = po.id) AS "dispatchesCount",
            s.id AS "customerId", s.code AS "customerCode", s.name AS "customerName"
          FROM recent po JOIN customers s ON s.id = po.customer_id
          CROSS JOIN LATERAL (SELECT SUM(i.line_total) AS total, COUNT(*) AS count
            FROM sale_order_items i WHERE i.sale_order_id = po.id) items
          ORDER BY po.ordered_at DESC, po.created_at DESC, po.id DESC
        `),
          ]);
        const counts = new Map(statuses.map((r) => [r.status, Number(r.count)]));
        const decimal = (value: string) => new Prisma.Decimal(value).toFixed(2);
        return {
          period: { from, to, timeZone: TIME_ZONE, granularity },
          selectedCustomer,
          customers: { active, usedInPeriod: Number(amountRows[0].customers) },
          pipeline: {
            awaitingDispatch: Number(pipelineRows[0].awaitingDispatch),
          },
          orders: {
            total: statuses.reduce((sum, r) => sum + Number(r.count), 0),
            draft: counts.get('DRAFT') ?? 0,
            confirmed: counts.get('CONFIRMED') ?? 0,
            partiallyDispatched: counts.get('PARTIALLY_DISPATCHED') ?? 0,
            dispatched: counts.get('DISPATCHED') ?? 0,
            cancelled: counts.get('CANCELLED') ?? 0,
          },
          amounts: { confirmed: decimal(amountRows[0].amount) },
          dispatches: {
            total: Number(dispatchRows[0].total),
            lines: Number(dispatchRows[0].lines),
          },
          activityByPeriod: series.map((r) => ({
            period: r.period,
            orders: Number(r.orders),
            dispatches: Number(r.dispatches),
          })),
          topCustomers: top.map((r) => ({
            customer: { id: r.id, code: r.code, name: r.name },
            orders: Number(r.orders),
            confirmedAmount: decimal(r.amount),
          })),
          recentOrders: recent.map((r) => ({
            id: r.id,
            number: r.number,
            status: r.status,
            orderedAt: r.orderedAt.toISOString(),
            total: decimal(r.total),
            itemsCount: Number(r.itemsCount),
            dispatchesCount: Number(r.dispatchesCount),
            customer: { id: r.customerId, code: r.customerCode, name: r.customerName },
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
