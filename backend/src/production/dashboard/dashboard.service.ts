import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const ACTIVITY_AT = Prisma.sql`COALESCE(po.completed_at, po.started_at, po.planned_start_at, po.created_at)`;

type StatusRow = {
  status: string;
  count: bigint;
  planned: string | null;
  produced: string | null;
};
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

    const bounds = Prisma.sql`
      ${ACTIVITY_AT} >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
      AND ${ACTIVITY_AT} < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})
    `;
    const [statuses, series, recent] = await Promise.all([
      this.prisma.$queryRaw<StatusRow[]>(Prisma.sql`
        SELECT po.status::text AS status, COUNT(*) AS count,
          SUM(po.quantity_planned)::text AS planned,
          SUM(po.quantity_produced)::text AS produced
        FROM production_orders po
        WHERE ${bounds}
        GROUP BY po.status
      `),
      this.prisma.$queryRaw<SeriesRow[]>(Prisma.sql`
        WITH buckets AS (
          SELECT generate_series(
            date_trunc(${granularity}, ${from}::date::timestamp),
            date_trunc(${granularity}, ${to}::date::timestamp),
            ('1 ' || ${granularity})::interval
          ) AS bucket
        ), totals AS (
          SELECT date_trunc(${granularity}, ${ACTIVITY_AT} AT TIME ZONE ${TIME_ZONE}) AS bucket,
            SUM(po.quantity_planned)::text AS planned,
            SUM(po.quantity_produced)::text AS produced
          FROM production_orders po
          WHERE ${bounds}
          GROUP BY 1
        )
        SELECT to_char(buckets.bucket, 'YYYY-MM-DD') AS bucket,
          COALESCE(totals.planned, '0.0000') AS planned,
          COALESCE(totals.produced, '0.0000') AS produced
        FROM buckets LEFT JOIN totals USING (bucket)
        ORDER BY buckets.bucket
      `),
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
        WHERE ${bounds}
        ORDER BY ${ACTIVITY_AT} DESC, po.created_at DESC, po.id DESC
        LIMIT 5
      `),
    ]);

    const byStatus = new Map(statuses.map((row) => [row.status, row]));
    const count = (status: string) => Number(byStatus.get(status)?.count ?? 0n);
    const planned = statuses.reduce(
      (sum, row) => sum.plus(row.planned ?? '0'),
      new Prisma.Decimal(0),
    );
    const produced = statuses.reduce(
      (sum, row) => sum.plus(row.produced ?? '0'),
      new Prisma.Decimal(0),
    );
    const completionPercentage = planned.isZero()
      ? null
      : produced.div(planned).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

    return {
      period: { from, to, timeZone: TIME_ZONE, granularity },
      orders: {
        draft: count('DRAFT'),
        inProgress: count('IN_PROGRESS'),
        completed: count('COMPLETED'),
        cancelled: count('CANCELLED'),
        total: statuses.reduce((sum, row) => sum + Number(row.count), 0),
      },
      quantity: {
        planned: planned.toFixed(4),
        produced: produced.toFixed(4),
        completionRate: completionPercentage,
      },
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
