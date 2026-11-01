import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const DAY = 86_400_000;
const productSelect = { id: true, code: true, name: true } as const;
type EventRow = {
  period: string;
  approved: bigint;
  rejected: bigint;
  release: bigint;
  rework: bigint;
  scrap: bigint;
};
type AttentionRow = {
  kind: 'REJECTED_AWAITING_DISPOSITION' | 'PENDING_INSPECTION';
  id: string;
  code: string;
  productId: string;
  productCode: string;
  productName: string;
  orderId: string;
  orderNumber: string;
  since: Date;
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

    const filter = query.productId
      ? Prisma.sql`AND l.product_id = ${query.productId}::uuid`
      : Prisma.empty;
    const bounds = (column: Prisma.Sql) => Prisma.sql`
      ${column} >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
      AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    const inspectionBounds = bounds(Prisma.sql`i.inspected_at`);
    const dispositionBounds = bounds(Prisma.sql`d.decided_at`);
    const pending = Prisma.sql`l.production_order_id IS NOT NULL AND l.status = 'QUARANTINED'
      AND p.requires_quality_inspection = true
      AND NOT EXISTS (SELECT 1 FROM quality_inspections i WHERE i.lot_id = l.id)`;
    const rejected = Prisma.sql`l.status = 'REJECTED' AND i.result = 'REJECTED'
      AND NOT EXISTS (SELECT 1 FROM quality_dispositions d WHERE d.lot_id = l.id)`;
    return this.prisma.$transaction(
      async (tx) => {
        const selectedProduct = query.productId
          ? await tx.product.findUnique({ where: { id: query.productId }, select: productSelect })
          : null;
        if (query.productId && !selectedProduct)
          throw new NotFoundException('Producto no encontrado');
        const [currentRows, inspectionCounts, dispositionCounts, series, attention, recent] =
          await Promise.all([
            tx.$queryRaw<
              { pendingInspection: bigint; rejectedAwaitingDisposition: bigint; rework: bigint }[]
            >(Prisma.sql`
          SELECT COUNT(*) FILTER (WHERE ${pending}) AS "pendingInspection",
            COUNT(*) FILTER (WHERE ${rejected}) AS "rejectedAwaitingDisposition",
            COUNT(*) FILTER (WHERE l.production_order_id IS NOT NULL AND l.status = 'REWORK') AS rework
          FROM lots l JOIN products p ON p.id = l.product_id
          LEFT JOIN quality_inspections i ON i.lot_id = l.id WHERE true ${filter}`),
            tx.$queryRaw<{ result: string; count: bigint }[]>(Prisma.sql`
          SELECT i.result::text AS result, COUNT(*) AS count FROM quality_inspections i
          JOIN lots l ON l.id = i.lot_id WHERE ${inspectionBounds} ${filter} GROUP BY i.result`),
            tx.$queryRaw<{ type: string; count: bigint }[]>(Prisma.sql`
          SELECT d.type::text AS type, COUNT(*) AS count FROM quality_dispositions d
          JOIN lots l ON l.id = d.lot_id WHERE ${dispositionBounds} ${filter} GROUP BY d.type`),
            tx.$queryRaw<EventRow[]>(Prisma.sql`
          WITH buckets AS (
            SELECT generate_series(date_trunc(${granularity}, ${from}::date::timestamp),
              date_trunc(${granularity}, ${to}::date::timestamp), ('1 ' || ${granularity})::interval) AS bucket
          ), inspections AS (
            SELECT date_trunc(${granularity}, i.inspected_at AT TIME ZONE ${TIME_ZONE}) AS bucket,
              COUNT(*) FILTER (WHERE i.result = 'APPROVED') AS approved,
              COUNT(*) FILTER (WHERE i.result = 'REJECTED') AS rejected
            FROM quality_inspections i JOIN lots l ON l.id = i.lot_id
            WHERE ${inspectionBounds} ${filter} GROUP BY 1
          ), dispositions AS (
            SELECT date_trunc(${granularity}, d.decided_at AT TIME ZONE ${TIME_ZONE}) AS bucket,
              COUNT(*) FILTER (WHERE d.type = 'RELEASE') AS release,
              COUNT(*) FILTER (WHERE d.type = 'REWORK') AS rework,
              COUNT(*) FILTER (WHERE d.type = 'SCRAP') AS scrap
            FROM quality_dispositions d JOIN lots l ON l.id = d.lot_id
            WHERE ${dispositionBounds} ${filter} GROUP BY 1
          )
          SELECT to_char(b.bucket, 'YYYY-MM-DD') AS period,
            COALESCE(i.approved, 0) AS approved, COALESCE(i.rejected, 0) AS rejected,
            COALESCE(d.release, 0) AS release, COALESCE(d.rework, 0) AS rework, COALESCE(d.scrap, 0) AS scrap
          FROM buckets b LEFT JOIN inspections i USING (bucket) LEFT JOIN dispositions d USING (bucket)
          ORDER BY b.bucket`),
            tx.$queryRaw<AttentionRow[]>(Prisma.sql`
          WITH queue AS (
            (SELECT l.id, 'REJECTED_AWAITING_DISPOSITION' AS kind, 1 AS priority, i.inspected_at AS since
              FROM lots l JOIN quality_inspections i ON i.lot_id = l.id
              WHERE ${rejected} ${filter} ORDER BY i.inspected_at, l.id LIMIT 5)
            UNION ALL
            (SELECT l.id, 'PENDING_INSPECTION' AS kind, 2 AS priority, l.originated_at AS since
              FROM lots l JOIN products p ON p.id = l.product_id
              WHERE ${pending} ${filter} ORDER BY l.originated_at, l.id LIMIT 5)
          )
          SELECT q.kind, l.id, l.code, p.id AS "productId", p.code AS "productCode", p.name AS "productName",
            o.id AS "orderId", o.number AS "orderNumber", q.since
          FROM queue q JOIN lots l ON l.id = q.id JOIN products p ON p.id = l.product_id
          JOIN production_orders o ON o.id = l.production_order_id
          ORDER BY q.priority, q.since, l.id LIMIT 5`),
            tx.qualityInspection.findMany({
              where: {
                inspectedAt: {
                  gte: new Date(`${from}T00:00:00-06:00`),
                  lt: new Date(Date.parse(`${to}T00:00:00-06:00`) + DAY),
                },
                ...(query.productId ? { lot: { productId: query.productId } } : {}),
              },
              orderBy: [{ inspectedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 5,
              select: {
                id: true,
                result: true,
                inspectedAt: true,
                inspectedBy: { select: { id: true, fullName: true } },
                disposition: { select: { type: true, decidedAt: true } },
                lot: {
                  select: {
                    id: true,
                    code: true,
                    status: true,
                    product: { select: productSelect },
                    productionOrder: { select: { id: true, number: true } },
                  },
                },
              },
            }),
          ]);
        const approved = Number(inspectionCounts.find((r) => r.result === 'APPROVED')?.count ?? 0);
        const rejectedCount = Number(
          inspectionCounts.find((r) => r.result === 'REJECTED')?.count ?? 0,
        );
        const total = approved + rejectedCount;
        const release = Number(dispositionCounts.find((r) => r.type === 'RELEASE')?.count ?? 0);
        const rework = Number(dispositionCounts.find((r) => r.type === 'REWORK')?.count ?? 0);
        const scrap = Number(dispositionCounts.find((r) => r.type === 'SCRAP')?.count ?? 0);
        return {
          period: { from, to, timeZone: TIME_ZONE, granularity },
          selectedProduct,
          current: {
            pendingInspection: Number(currentRows[0].pendingInspection),
            rejectedAwaitingDisposition: Number(currentRows[0].rejectedAwaitingDisposition),
            rework: Number(currentRows[0].rework),
          },
          inspections: {
            total,
            approved,
            rejected: rejectedCount,
            approvalRatePct: total
              ? new Prisma.Decimal(approved).div(total).mul(100).toFixed(2)
              : null,
          },
          dispositions: { total: release + rework + scrap, release, rework, scrap },
          inspectionsByPeriod: series.map((r) => ({
            period: r.period,
            approved: Number(r.approved),
            rejected: Number(r.rejected),
          })),
          dispositionsByPeriod: series.map((r) => ({
            period: r.period,
            release: Number(r.release),
            rework: Number(r.rework),
            scrap: Number(r.scrap),
          })),
          attention: attention.map((r) => ({
            kind: r.kind,
            lot: { id: r.id, code: r.code },
            product: { id: r.productId, code: r.productCode, name: r.productName },
            productionOrder: { id: r.orderId, number: r.orderNumber },
            since: r.since.toISOString(),
          })),
          recentInspections: recent.map((r) => ({
            id: r.id,
            result: r.result,
            inspectedAt: r.inspectedAt.toISOString(),
            lot: { id: r.lot.id, code: r.lot.code, status: r.lot.status },
            product: r.lot.product,
            productionOrder: r.lot.productionOrder,
            inspectedBy: r.inspectedBy,
            disposition: r.disposition
              ? { type: r.disposition.type, decidedAt: r.disposition.decidedAt.toISOString() }
              : null,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
