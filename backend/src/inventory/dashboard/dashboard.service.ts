import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MovementQueryService } from '../movements/movement-query.service.js';
import type { DashboardQueryDto } from './dashboard-query.dto.js';

const TIME_ZONE = 'America/Managua';
const DAY = 86_400_000;
const productTypes = {
  RAW_MATERIAL: 'rawMaterial',
  INTERMEDIATE: 'intermediate',
  FINISHED_GOOD: 'finishedGood',
  CONSUMABLE: 'consumable',
} as const;
const lotStates = {
  QUARANTINED: 'quarantined',
  RELEASED: 'released',
  REJECTED: 'rejected',
  REWORK: 'rework',
  SCRAPPED: 'scrapped',
} as const;
const movementTypes = {
  ADJUSTMENT_IN: 'adjustmentIn',
  ADJUSTMENT_OUT: 'adjustmentOut',
  PURCHASE_RECEIPT: 'purchaseReceipt',
  PRODUCTION_CONSUMPTION: 'productionConsumption',
  PRODUCTION_OUTPUT: 'productionOutput',
  SALE_DISPATCH: 'saleDispatch',
  QUALITY_SCRAP: 'qualityScrap',
} as const;
type LotRow = { status: keyof typeof lotStates; count: bigint };
type StockRow = { id: string; code: string; name: string; onHand: string; consumable: string };
type FlowRow = { in: string; out: string; net: string };

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: MovementQueryService,
  ) {}

  async get(query: DashboardQueryDto) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const today = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const to = query.to ?? `${today.year}-${today.month}-${today.day}`;
    const from =
      query.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10);
    if (from < '0001-01-01')
      throw new BadRequestException('El rango requiere fechas desde 0001-01-01');
    if (from > to) throw new BadRequestException('from no puede ser posterior a to');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
    if (days > 366)
      throw new BadRequestException('El rango del dashboard no puede superar 366 días');
    const granularity = days <= 31 ? 'day' : days <= 180 ? 'week' : 'month';
    const [selectedProduct, dateRange, selectedWarehouse] = await Promise.all([
      query.productId
        ? this.prisma.product.findUnique({
            where: { id: query.productId },
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              isLotTracked: true,
            },
          })
        : null,
      this.prisma.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
        SELECT (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE}) AS start,
          ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE}) AS "end"
      `),
      query.warehouseId
        ? this.prisma.warehouse.findUnique({
            where: { id: query.warehouseId },
            select: {
              id: true,
              code: true,
              name: true,
            },
          })
        : null,
    ]);
    if (query.productId && !selectedProduct) throw new NotFoundException('Producto no encontrado');
    if (query.warehouseId && !selectedWarehouse)
      throw new NotFoundException('Almacén no encontrado');
    const scope = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    };
    const filter = Prisma.sql`${query.productId ? Prisma.sql`AND m.product_id = ${query.productId}::uuid` : Prisma.empty}
      ${query.warehouseId ? Prisma.sql`AND m.warehouse_id = ${query.warehouseId}::uuid` : Prisma.empty}`;
    const bounds = Prisma.sql`m.occurred_at >= (${from}::date::timestamp AT TIME ZONE ${TIME_ZONE})
      AND m.occurred_at < ((${to}::date + 1)::timestamp AT TIME ZONE ${TIME_ZONE})`;
    // PostgreSQL resolves calendar boundaries consistently with the series, including historical offsets.
    const { start, end } = dateRange[0];
    const where = { ...scope, occurredAt: { gte: start, lt: end } };
    const [products, activeWarehouses, withOnHand, lots, byType, series, recent, stockRows, flow] =
      await Promise.all([
        this.prisma.product.groupBy({
          by: ['type'],
          where: { isActive: true },
          _count: { _all: true },
        }),
        this.prisma.warehouse.count({ where: { isActive: true } }),
        this.prisma.stockBalance.count({ where: { ...scope, quantity: { gt: 0 } } }),
        this.prisma.$queryRaw<LotRow[]>(Prisma.sql`
        WITH positive AS (
          SELECT m.lot_id FROM inventory_movements m
          WHERE m.lot_id IS NOT NULL ${filter}
          GROUP BY m.lot_id, m.warehouse_id HAVING SUM(m.quantity) > 0
        )
        SELECT l.status::text AS status, COUNT(DISTINCT l.id) AS count
        FROM positive p JOIN lots l ON l.id = p.lot_id GROUP BY l.status
      `),
        this.prisma.inventoryMovement.groupBy({ by: ['type'], where, _count: { _all: true } }),
        this.prisma.$queryRaw<{ period: string; count: bigint }[]>(Prisma.sql`
        WITH buckets AS (
          SELECT generate_series(date_trunc(${granularity}, ${from}::date::timestamp),
            date_trunc(${granularity}, ${to}::date::timestamp), ('1 ' || ${granularity})::interval) AS bucket
        ), activity AS (
          SELECT date_trunc(${granularity}, m.occurred_at AT TIME ZONE ${TIME_ZONE}) AS bucket, COUNT(*) AS count
          FROM inventory_movements m WHERE ${bounds} ${filter} GROUP BY 1
        )
        SELECT to_char(b.bucket, 'YYYY-MM-DD') AS period, COALESCE(a.count, 0) AS count
        FROM buckets b LEFT JOIN activity a USING (bucket) ORDER BY b.bucket
      `),
        this.movements.list({ ...scope, from: start.toISOString(), page: 1, limit: 5 }, end),
        selectedProduct
          ? this.prisma.$queryRaw<StockRow[]>(Prisma.sql`
        WITH physical AS (
          SELECT warehouse_id, quantity FROM stock_balances
          WHERE product_id = ${selectedProduct.id}::uuid
        ), released AS (
          SELECT m.warehouse_id, SUM(m.quantity) AS quantity FROM inventory_movements m
          JOIN lots l ON l.id = m.lot_id
          WHERE m.product_id = ${selectedProduct.id}::uuid AND l.status = 'RELEASED'::"LotStatus"
          GROUP BY m.warehouse_id
        )
        SELECT w.id, w.code, w.name, COALESCE(p.quantity, 0)::text AS "onHand",
          (CASE WHEN ${selectedProduct.isLotTracked} THEN COALESCE(r.quantity, 0) ELSE COALESCE(p.quantity, 0) END)::text AS consumable
        FROM physical p FULL JOIN released r USING (warehouse_id)
        JOIN warehouses w ON w.id = COALESCE(p.warehouse_id, r.warehouse_id)
        WHERE TRUE ${query.warehouseId ? Prisma.sql`AND w.id = ${query.warehouseId}::uuid` : Prisma.empty}
        ORDER BY w.code, w.id
      `)
          : [],
        selectedProduct
          ? this.prisma.$queryRaw<FlowRow[]>(Prisma.sql`
        SELECT COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity > 0), 0)::text AS "in",
          ABS(COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity < 0), 0))::text AS "out",
          COALESCE(SUM(m.quantity), 0)::text AS net
        FROM inventory_movements m WHERE ${bounds} ${filter}
      `)
          : [],
      ]);
    const productsByType = { rawMaterial: 0, intermediate: 0, finishedGood: 0, consumable: 0 };
    for (const row of products) productsByType[productTypes[row.type]] = row._count._all;
    const lotsOnHand = {
      total: 0,
      quarantined: 0,
      released: 0,
      rejected: 0,
      rework: 0,
      scrapped: 0,
    };
    for (const row of lots) {
      lotsOnHand[lotStates[row.status]] = Number(row.count);
      lotsOnHand.total += Number(row.count);
    }
    const counts = {
      adjustmentIn: 0,
      adjustmentOut: 0,
      purchaseReceipt: 0,
      productionConsumption: 0,
      productionOutput: 0,
      saleDispatch: 0,
      qualityScrap: 0,
    };
    for (const row of byType) counts[movementTypes[row.type]] = row._count._all;
    const decimal = (value: string) => new Prisma.Decimal(value).toFixed(4);
    const sum = (key: 'onHand' | 'consumable') =>
      stockRows.reduce((total, row) => total.add(row[key]), new Prisma.Decimal(0)).toFixed(4);
    return {
      period: { from, to, timeZone: TIME_ZONE, granularity },
      selectedProduct,
      selectedWarehouse,
      catalog: {
        activeProducts: products.reduce((total, row) => total + row._count._all, 0),
        activeWarehouses,
        productsByType,
      },
      stockPositions: { withOnHand },
      lotsOnHand,
      stock: selectedProduct
        ? {
            onHand: sum('onHand'),
            consumable: sum('consumable'),
            unit: selectedProduct.unit,
            byWarehouse: stockRows.map(({ id, code, name, onHand, consumable }) => ({
              warehouse: { id, code, name },
              onHand: decimal(onHand),
              consumable: decimal(consumable),
            })),
          }
        : null,
      movements: {
        total: byType.reduce((total, row) => total + row._count._all, 0),
        byType: counts,
      },
      movementQuantity: selectedProduct
        ? {
            in: decimal(flow[0].in),
            out: decimal(flow[0].out),
            net: decimal(flow[0].net),
            unit: selectedProduct.unit,
          }
        : null,
      movementsByPeriod: series.map((row) => ({ ...row, count: Number(row.count) })),
      recentMovements: recent.data,
    };
  }
}
