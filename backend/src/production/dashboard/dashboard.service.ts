import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const ACTIVITY_AT = Prisma.sql`COALESCE(po.completed_at, po.started_at, po.planned_start_at, po.created_at)`;
const PLAN_AT = Prisma.sql`COALESCE(po.planned_start_at, po.created_at)`;

type StatusRow = { status: string; count: bigint };
type QuantityRow = { quantity: string | null };
type SeriesRow = { bucket: string; planned: string; produced: string };
type RecentRow = {
  id: string;
  number: string;
  status: string;
  quantityPlanned: string;
  quantityProduced: string;
  activityAt: Date;
  plannedStartAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
};

function localToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

function dateBounds(column: Prisma.Sql, from: string, to: string) {
  return Prisma.sql`
    ${column} >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
    AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})
  `;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DashboardQueryDto) {
    const to = query.to ?? localToday();
    const from =
      query.from ??
      new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
    if (from > to) throw new BadRequestException('from no puede ser posterior a to');
    const dayCount = daysBetween(from, to);
    if (dayCount > 366) {
      throw new BadRequestException('El rango del dashboard no puede superar 366 días');
    }
    const granularity = dayCount <= 31 ? 'day' : dayCount <= 180 ? 'week' : 'month';

    const selectedProduct = query.productId
      ? await this.prisma.product.findUnique({
          where: { id: query.productId },
          select: { id: true, code: true, name: true, unit: true },
        })
      : null;
    if (query.productId && !selectedProduct) {
      throw new NotFoundException('Producto no encontrado');
    }

    const productFilter = query.productId
      ? Prisma.sql`AND po.product_id = ${query.productId}::uuid`
      : Prisma.empty;
    // Historical membership is stable: advancing an order's status does not move it to a new period.
    const membershipBounds = dateBounds(PLAN_AT, from, to);
    const activityBounds = dateBounds(ACTIVITY_AT, from, to);
    const completionBounds = dateBounds(Prisma.sql`po.completed_at`, from, to);

    const statuses = await this.prisma.$queryRaw<StatusRow[]>(Prisma.sql`
      SELECT po.status::text AS status, COUNT(*) AS count
      FROM production_orders po
      WHERE ${membershipBounds} ${productFilter}
      GROUP BY po.status
    `);
    const byStatus = new Map(statuses.map((row) => [row.status, row]));
    const count = (status: string) => Number(byStatus.get(status)?.count ?? 0n);
    const orders = {
      draft: count('DRAFT'),
      inProgress: count('IN_PROGRESS'),
      completed: count('COMPLETED'),
      cancelled: count('CANCELLED'),
      total: statuses.reduce((sum, row) => sum + Number(row.count), 0),
    };

    const [plannedRows, producedRows, series, recent] = await Promise.all([
      query.productId
        ? this.prisma.$queryRaw<QuantityRow[]>(Prisma.sql`
            SELECT COALESCE(SUM(po.quantity_planned), 0)::text AS quantity
            FROM production_orders po
            WHERE ${membershipBounds} ${productFilter}
          `)
        : Promise.resolve([{ quantity: null }]),
      query.productId
        ? this.prisma.$queryRaw<QuantityRow[]>(Prisma.sql`
            SELECT COALESCE(SUM(po.quantity_produced), 0)::text AS quantity
            FROM production_orders po
            WHERE po.status = 'COMPLETED'::"ProductionOrderStatus"
              AND ${completionBounds} ${productFilter}
          `)
        : Promise.resolve([{ quantity: null }]),
      query.productId
        ? this.prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
            WITH buckets AS (
              SELECT generate_series(
                date_trunc(${granularity}, ${from}::date::timestamp),
                date_trunc(${granularity}, ${to}::date::timestamp),
                ('1 ' || ${granularity})::interval
              ) AS bucket
            ), planned AS (
              SELECT date_trunc(${granularity}, ${PLAN_AT} AT TIME ZONE ${TIME_ZONE}) AS bucket,
                SUM(po.quantity_planned)::text AS quantity
              FROM production_orders po
              WHERE ${membershipBounds} ${productFilter}
              GROUP BY 1
            ), produced AS (
              SELECT date_trunc(${granularity}, po.completed_at AT TIME ZONE ${TIME_ZONE}) AS bucket,
                SUM(po.quantity_produced)::text AS quantity
              FROM production_orders po
              WHERE po.status = 'COMPLETED'::"ProductionOrderStatus"
                AND ${completionBounds} ${productFilter}
              GROUP BY 1
            )
            SELECT to_char(buckets.bucket, 'YYYY-MM-DD') AS bucket,
              COALESCE(planned.quantity, '0.0000') AS planned,
              COALESCE(produced.quantity, '0.0000') AS produced
            FROM buckets
            LEFT JOIN planned USING (bucket)
            LEFT JOIN produced USING (bucket)
            ORDER BY buckets.bucket
          `)
        : Promise.resolve([]),
      this.prisma.$queryRaw<RecentRow[]>(Prisma.sql`
        SELECT po.id, po.number, po.status::text AS status,
          po.quantity_planned::text AS "quantityPlanned",
          po.quantity_produced::text AS "quantityProduced",
          ${ACTIVITY_AT} AS "activityAt",
          po.planned_start_at AS "plannedStartAt",
          po.started_at AS "startedAt",
          po.completed_at AS "completedAt",
          p.id AS "productId",
          p.code AS "productCode", p.name AS "productName", p.unit::text AS unit
        FROM production_orders po
        JOIN products p ON p.id = po.product_id
        WHERE ${activityBounds} ${productFilter}
        ORDER BY ${ACTIVITY_AT} DESC, po.created_at DESC, po.id DESC
        LIMIT 5
      `),
    ]);

    let quantity: {
      planned: string;
      produced: string;
      completionRate: string | null;
      unit: string;
    } | null = null;
    if (selectedProduct) {
      const planned = new Prisma.Decimal(plannedRows[0]?.quantity ?? '0');
      const produced = new Prisma.Decimal(producedRows[0]?.quantity ?? '0');
      const completionRate = planned.isZero()
        ? null
        : produced
            .div(planned)
            .mul(100)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            .toFixed(2);
      quantity = {
        planned: planned.toFixed(4),
        produced: produced.toFixed(4),
        completionRate,
        unit: selectedProduct.unit,
      };
    }

    return {
      period: { from, to, timeZone: TIME_ZONE, granularity },
      selectedProduct,
      orders,
      quantity,
      productionByPeriod: series.map((row) => ({
        period: row.bucket,
        planned: row.planned,
        produced: row.produced,
      })),
      recentOrders: recent.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        quantityPlanned: row.quantityPlanned,
        quantityProduced: row.quantityProduced,
        plannedStartAt: row.plannedStartAt?.toISOString() ?? null,
        startedAt: row.startedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        activityAt: row.activityAt.toISOString(),
        product: { id: row.productId, code: row.productCode, name: row.productName },
        unit: row.unit,
      })),
    };
  }
}
