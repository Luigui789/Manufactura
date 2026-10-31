import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  CarbonActivitySource,
  CarbonFootprintScope,
  CarbonFootprintStatus,
  InventoryMovementType,
  Prisma,
  ProductionOrderStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  activityEmissions,
  CARBON_SCALE,
  emissionIntensity,
  formatCarbon,
  totalEmissions,
  totalsByCategory,
} from '../carbon-math.js';
import {
  circularityMetrics,
  factorSnapshot,
  type ConsumptionMovement,
  type FactorSnapshotSource,
  type MissingFactor,
  planAutomaticActivities,
  type PlannedAutoActivity,
} from '../carbon-rules.js';
import { translateSustainabilityError } from '../sustainability-errors.js';
import { CARBON_DISCLAIMER, CIRCULARITY_NOTICE } from '../sustainability-text.js';
import type {
  CreateManualActivityDto,
  FinalizeFootprintDto,
  SustainabilityOrdersQueryDto,
  UpdateManualActivityDto,
} from './footprints.dto.js';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const productSelect = { id: true, code: true, name: true, unit: true } as const;

const orderInclude = {
  product: { select: productSelect },
  lot: { select: { id: true, code: true, status: true } },
} satisfies Prisma.ProductionOrderInclude;

const activityInclude = {
  createdBy: { select: { id: true, fullName: true } },
  inventoryMovement: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      occurredAt: true,
      product: { select: productSelect },
      lot: { select: { id: true, code: true } },
    },
  },
} satisfies Prisma.CarbonActivityInclude;

const footprintInclude = {
  finalizedBy: { select: { id: true, fullName: true } },
  activities: {
    include: activityInclude,
    orderBy: [{ source: 'asc' }, { category: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProductionFootprintInclude;

type Order = Prisma.ProductionOrderGetPayload<{ include: typeof orderInclude }>;
type Footprint = Prisma.ProductionFootprintGetPayload<{ include: typeof footprintInclude }>;
type Activity = Footprint['activities'][number];

const TX = { timeout: 15000 } as const;

function serializeActivity(activity: Activity) {
  const movement = activity.inventoryMovement;
  return {
    id: activity.id,
    category: activity.category,
    source: activity.source,
    description: activity.description,
    activityQuantity: formatCarbon(activity.activityQuantity),
    activityUnit: activity.activityUnit,
    originalQuantity: activity.originalQuantity?.toFixed(4) ?? null,
    originalUnit: activity.originalUnit,
    emissionFactorId: activity.emissionFactorId,
    factorCodeSnapshot: activity.factorCodeSnapshot,
    factorNameSnapshot: activity.factorNameSnapshot,
    factorValueSnapshot: formatCarbon(activity.factorValueSnapshot),
    factorSourceNameSnapshot: activity.factorSourceNameSnapshot,
    factorSourceReferenceSnapshot: activity.factorSourceReferenceSnapshot,
    factorSourceYearSnapshot: activity.factorSourceYearSnapshot,
    emissionsKgCo2e: formatCarbon(activity.emissionsKgCo2e),
    inventoryMovementId: activity.inventoryMovementId,
    inventoryMovement: movement
      ? {
          id: movement.id,
          quantity: movement.quantity.toFixed(4),
          occurredAt: movement.occurredAt,
          product: movement.product,
          lot: movement.lot,
        }
      : null,
    createdBy: activity.createdBy,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

function activityAudit(activity: Activity | Prisma.CarbonActivityGetPayload<object>) {
  return {
    footprintId: activity.footprintId,
    category: activity.category,
    source: activity.source,
    description: activity.description,
    activityQuantity: formatCarbon(activity.activityQuantity),
    activityUnit: activity.activityUnit,
    emissionFactorId: activity.emissionFactorId,
    factorCodeSnapshot: activity.factorCodeSnapshot,
    factorValueSnapshot: formatCarbon(activity.factorValueSnapshot),
    factorSourceNameSnapshot: activity.factorSourceNameSnapshot,
    factorSourceReferenceSnapshot: activity.factorSourceReferenceSnapshot,
    factorSourceYearSnapshot: activity.factorSourceYearSnapshot,
    emissionsKgCo2e: formatCarbon(activity.emissionsKgCo2e),
  };
}

/** Totales calculados desde las actividades persistidas (nunca desde la BOM). */
function preview(footprint: Footprint) {
  const total = totalEmissions(footprint.activities.map((a) => a.emissionsKgCo2e));
  return {
    totalsByCategory: totalsByCategory(footprint.activities),
    totalKgCo2ePreview: total.toFixed(CARBON_SCALE),
    kgCo2ePerOutputUnitPreview: emissionIntensity(
      total,
      footprint.quantityProducedSnapshot,
    ).toFixed(CARBON_SCALE),
  };
}

async function consumption(db: Db, orderId: string): Promise<ConsumptionMovement[]> {
  return db.inventoryMovement.findMany({
    where: { productionOrderId: orderId, type: InventoryMovementType.PRODUCTION_CONSUMPTION },
    select: { id: true, productId: true, quantity: true, product: { select: productSelect } },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
}

function sameActivity(existing: Activity, planned: PlannedAutoActivity) {
  return (
    existing.emissionFactorId === planned.emissionFactorId &&
    existing.category === planned.category &&
    existing.description === planned.description &&
    existing.activityUnit === planned.activityUnit &&
    existing.activityQuantity.eq(planned.activityQuantity) &&
    existing.originalUnit === planned.originalUnit &&
    existing.originalQuantity?.eq(planned.originalQuantity) === true &&
    existing.factorCodeSnapshot === planned.factorCodeSnapshot &&
    existing.factorNameSnapshot === planned.factorNameSnapshot &&
    existing.factorValueSnapshot.eq(planned.factorValueSnapshot) &&
    existing.factorSourceNameSnapshot === planned.factorSourceNameSnapshot &&
    existing.factorSourceReferenceSnapshot === planned.factorSourceReferenceSnapshot &&
    existing.factorSourceYearSnapshot === planned.factorSourceYearSnapshot &&
    existing.emissionsKgCo2e.eq(planned.emissionsKgCo2e)
  );
}

@Injectable()
export class FootprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Órdenes COMPLETED con el estado de su huella; no crea datos. */
  async listOrders(query: SustainabilityOrdersQueryDto) {
    const { page, limit, search, footprintStatus } = query;
    const where: Prisma.ProductionOrderWhereInput = {
      status: ProductionOrderStatus.COMPLETED,
      ...(footprintStatus === 'NONE'
        ? { footprint: { is: null } }
        : footprintStatus
          ? { footprint: { is: { status: footprintStatus } } }
          : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { product: { code: { contains: search, mode: 'insensitive' } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { lot: { is: { code: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          status: true,
          quantityProduced: true,
          completedAt: true,
          product: { select: productSelect },
          lot: { select: { id: true, code: true, status: true } },
          footprint: {
            select: {
              id: true,
              status: true,
              totalKgCo2e: true,
              kgCo2ePerOutputUnit: true,
              finalizedAt: true,
            },
          },
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return {
      data: orders.map(({ footprint, quantityProduced, ...order }) => ({
        ...order,
        quantityProduced: quantityProduced.toFixed(4),
        footprint: footprint
          ? {
              id: footprint.id,
              status: footprint.status,
              finalizedAt: footprint.finalizedAt,
              // Un borrador no tiene total oficial: solo la huella FINALIZED lo persiste.
              totalKgCo2e:
                footprint.status === CarbonFootprintStatus.FINALIZED
                  ? formatCarbon(footprint.totalKgCo2e)
                  : null,
              kgCo2ePerOutputUnit: footprint.kgCo2ePerOutputUnit
                ? formatCarbon(footprint.kgCo2ePerOutputUnit)
                : null,
            }
          : null,
      })),
      meta: { page, limit, total },
    };
  }

  /** Resumen de sostenibilidad de una OP, con circularidad aunque no exista huella. */
  async orderSummary(orderId: string) {
    const order = await this.readOrder(this.prisma, orderId);
    const footprint = await this.prisma.productionFootprint.findUnique({
      where: { productionOrderId: orderId },
      select: { id: true, status: true },
    });
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      quantityProduced: order.quantityProduced.toFixed(4),
      completedAt: order.completedAt,
      product: order.product,
      lot: order.lot,
      footprint,
      canCreateFootprint:
        !footprint &&
        order.status === ProductionOrderStatus.COMPLETED &&
        !!order.lot &&
        order.quantityProduced.gt(0),
      circularity: await this.circularity(this.prisma, orderId),
      circularityNotice: CIRCULARITY_NOTICE,
      disclaimer: CARBON_DISCLAIMER,
    };
  }

  async get(orderId: string) {
    await this.readOrder(this.prisma, orderId);
    const footprint = await this.prisma.productionFootprint.findUnique({
      where: { productionOrderId: orderId },
      select: { id: true },
    });
    return footprint ? this.detail(this.prisma, orderId) : null;
  }

  async create(actor: AuthenticatedUser, orderId: string) {
    return this.run(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== ProductionOrderStatus.COMPLETED)
        throw new UnprocessableEntityException({
          code: 'ORDER_NOT_COMPLETED',
          message: 'Solo una orden COMPLETED puede tener huella de carbono',
        });
      if (!order.lot || !order.quantityProduced.gt(0))
        throw new UnprocessableEntityException({
          code: 'ORDER_WITHOUT_OUTPUT',
          message: 'La orden necesita un lote y una cantidad producida mayor que cero',
        });
      if (await tx.productionFootprint.findUnique({ where: { productionOrderId: orderId } }))
        throw new ConflictException('La orden ya tiene una huella de carbono');
      const created = await tx.productionFootprint.create({
        data: {
          productionOrderId: orderId,
          lotId: order.lot.id,
          scope: CarbonFootprintScope.PARTIAL_CRADLE_TO_GATE,
          quantityProducedSnapshot: order.quantityProduced,
          outputUnitSnapshot: order.product.unit,
        },
      });
      const sync = await this.syncAutomatic(tx, created.id, orderId);
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.CREATE,
        entity: { type: AuditEntityType.PRODUCTION_FOOTPRINT, id: created.id },
        newValues: {
          productionOrderId: orderId,
          lotId: order.lot.id,
          scope: created.scope,
          status: created.status,
          quantityProduced: created.quantityProducedSnapshot.toFixed(4),
          outputUnit: created.outputUnitSnapshot,
          ...sync,
        },
      });
      return this.detail(tx, orderId);
    });
  }

  async sync(actor: AuthenticatedUser, orderId: string) {
    return this.run(async (tx) => {
      const footprint = await this.lockDraft(tx, orderId);
      const sync = await this.syncAutomatic(tx, footprint.id, orderId);
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.UPDATE,
        entity: { type: AuditEntityType.PRODUCTION_FOOTPRINT, id: footprint.id },
        newValues: { operation: 'SYNC_PRODUCTION_CONSUMPTION', ...sync },
      });
      return this.detail(tx, orderId);
    });
  }

  async addManual(actor: AuthenticatedUser, orderId: string, dto: CreateManualActivityDto) {
    return this.run(async (tx) => {
      const footprint = await this.lockDraft(tx, orderId);
      const factor = await this.manualFactor(tx, dto.emissionFactorId.toLowerCase());
      const quantity = new Prisma.Decimal(dto.quantity);
      const activity = await tx.carbonActivity.create({
        data: {
          footprintId: footprint.id,
          source: CarbonActivitySource.MANUAL,
          description: dto.description,
          activityQuantity: quantity,
          ...factorSnapshot(factor),
          emissionsKgCo2e: activityEmissions(quantity, factor.kgCo2ePerUnit),
          createdByUserId: actor.id,
        },
      });
      await this.recordActivity(tx, actor, AuditAction.CREATE, activity.id, null, activity);
      return this.detail(tx, orderId);
    });
  }

  async updateManual(
    actor: AuthenticatedUser,
    orderId: string,
    activityId: string,
    dto: UpdateManualActivityDto,
  ) {
    if (
      dto.emissionFactorId === undefined &&
      dto.description === undefined &&
      dto.quantity === undefined
    )
      throw new UnprocessableEntityException('Indica los datos para actualizar');
    return this.run(async (tx) => {
      const footprint = await this.lockDraft(tx, orderId);
      const before = await this.manualActivity(tx, footprint.id, activityId);
      // Sin emissionFactorId se conserva el snapshot: actualizar el factor global no
      // cambia la actividad. Indicarlo (aunque sea el mismo) toma un snapshot nuevo.
      const snapshot = dto.emissionFactorId
        ? factorSnapshot(await this.manualFactor(tx, dto.emissionFactorId.toLowerCase()))
        : null;
      const quantity = dto.quantity ? new Prisma.Decimal(dto.quantity) : before.activityQuantity;
      const value = snapshot?.factorValueSnapshot ?? before.factorValueSnapshot;
      const after = await tx.carbonActivity.update({
        where: { id: activityId },
        data: {
          description: dto.description,
          activityQuantity: quantity,
          ...(snapshot ?? {}),
          emissionsKgCo2e: activityEmissions(quantity, value),
        },
      });
      await this.recordActivity(tx, actor, AuditAction.UPDATE, activityId, before, after);
      return this.detail(tx, orderId);
    });
  }

  async removeManual(actor: AuthenticatedUser, orderId: string, activityId: string) {
    return this.run(async (tx) => {
      const footprint = await this.lockDraft(tx, orderId);
      const before = await this.manualActivity(tx, footprint.id, activityId);
      await tx.carbonActivity.delete({ where: { id: activityId } });
      await this.recordActivity(tx, actor, AuditAction.DELETE, activityId, before, null);
      return this.detail(tx, orderId);
    });
  }

  async finalize(actor: AuthenticatedUser, orderId: string, dto: FinalizeFootprintDto) {
    return this.run(async (tx) => {
      const footprint = await this.lockDraft(tx, orderId);
      // Nunca se confía en un preview anterior: se vuelve a leer el ledger actual.
      const sync = await this.syncAutomatic(tx, footprint.id, orderId);
      if (sync.missingFactors.length > 0)
        throw new UnprocessableEntityException({
          code: 'MISSING_EMISSION_FACTORS',
          message: 'Faltan factores de emisión para productos consumidos por la orden',
          missingFactors: sync.missingFactors,
        });
      const activities = await tx.carbonActivity.findMany({
        where: { footprintId: footprint.id },
        select: { category: true, emissionsKgCo2e: true },
      });
      if (activities.length === 0)
        throw new UnprocessableEntityException({
          code: 'EMPTY_FOOTPRINT',
          message: 'La huella no tiene actividades que finalizar',
        });
      const total = totalEmissions(activities.map((a) => a.emissionsKgCo2e));
      const intensity = emissionIntensity(total, footprint.quantityProducedSnapshot);
      const now = new Date();
      const finalized = await tx.productionFootprint.update({
        where: { id: footprint.id },
        data: {
          status: CarbonFootprintStatus.FINALIZED,
          totalKgCo2e: total,
          kgCo2ePerOutputUnit: intensity,
          boundaryNotes: dto.boundaryNotes,
          calculatedAt: now,
          finalizedAt: now,
          finalizedByUserId: actor.id,
        },
      });
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.FINALIZE_CARBON_FOOTPRINT,
        entity: { type: AuditEntityType.PRODUCTION_FOOTPRINT, id: footprint.id },
        previousValues: { status: CarbonFootprintStatus.DRAFT },
        newValues: {
          status: finalized.status,
          productionOrderId: finalized.productionOrderId,
          lotId: finalized.lotId,
          scope: finalized.scope,
          totalKgCo2e: total.toFixed(CARBON_SCALE),
          quantityProduced: finalized.quantityProducedSnapshot.toFixed(4),
          outputUnit: finalized.outputUnitSnapshot,
          kgCo2ePerOutputUnit: intensity.toFixed(CARBON_SCALE),
          boundaryNotes: dto.boundaryNotes,
          activityCount: activities.length,
          totalsByCategory: totalsByCategory(activities),
          missingFactors: [],
          finalizedAt: now.toISOString(),
          finalizedByUserId: actor.id,
        },
      });
      return this.detail(tx, orderId);
    });
  }

  // -------------------------------------------------------------------------

  private async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, TX);
    } catch (error) {
      translateSustainabilityError(error);
    }
  }

  private async readOrder(db: Db, id: string): Promise<Order> {
    const order = await db.productionOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  /**
   * Orden determinista de bloqueos: production_orders → production_footprints.
   * FOR NO KEY UPDATE serializa con Producción (FOR UPDATE) sin bloquear las FKs
   * de otros módulos que solo referencian la orden.
   */
  private async lockOrder(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM production_orders WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    if (!rows.length) throw new NotFoundException('Orden de producción no encontrada');
    return this.readOrder(tx, id);
  }

  private async lockDraft(tx: Tx, orderId: string) {
    await this.lockOrder(tx, orderId);
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM production_footprints WHERE production_order_id = ${orderId}::uuid FOR NO KEY UPDATE`;
    if (!rows.length) throw new NotFoundException('La orden no tiene huella de carbono');
    const footprint = await tx.productionFootprint.findUniqueOrThrow({
      where: { id: rows[0].id },
    });
    if (footprint.status !== CarbonFootprintStatus.DRAFT)
      throw new ConflictException('La huella finalizada es inmutable');
    return footprint;
  }

  private async manualFactor(tx: Tx, id: string): Promise<FactorSnapshotSource> {
    const factor = await tx.emissionFactor.findUnique({ where: { id } });
    if (!factor) throw new NotFoundException('Factor de emisión no encontrado');
    if (!factor.isActive)
      throw new UnprocessableEntityException({
        code: 'INACTIVE_EMISSION_FACTOR',
        message: 'El factor de emisión está inactivo',
      });
    if (factor.productId)
      throw new UnprocessableEntityException({
        code: 'PRODUCT_FACTOR_IS_AUTOMATIC',
        message:
          'Los factores asociados a un producto se aplican automáticamente desde el consumo real',
      });
    return factor;
  }

  private async manualActivity(tx: Tx, footprintId: string, activityId: string) {
    const activity = await tx.carbonActivity.findFirst({
      where: { id: activityId, footprintId },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada en esta huella');
    if (activity.source !== CarbonActivitySource.MANUAL)
      throw new UnprocessableEntityException({
        code: 'AUTOMATIC_ACTIVITY_READ_ONLY',
        message: 'Las actividades automáticas provienen del ledger y no se editan manualmente',
      });
    return activity;
  }

  /**
   * Reconciliación de actividades automáticas con el ledger: una por movimiento
   * PRODUCTION_CONSUMPTION de la OP. Las MANUAL se conservan intactas.
   */
  private async syncAutomatic(tx: Tx, footprintId: string, orderId: string) {
    const movements = await consumption(tx, orderId);
    const productIds = [...new Set(movements.map((m) => m.productId))];
    const factors = await tx.emissionFactor.findMany({
      where: { productId: { in: productIds }, isActive: true },
    });
    const byProduct = new Map(factors.map((f) => [f.productId!, f]));
    const plan = planAutomaticActivities(movements, byProduct);
    const existing = await tx.carbonActivity.findMany({
      where: { footprintId, source: CarbonActivitySource.PRODUCTION_CONSUMPTION },
      include: activityInclude,
    });
    const byMovement = new Map(existing.map((a) => [a.inventoryMovementId!, a]));
    const planned = new Set(plan.activities.map((a) => a.inventoryMovementId));
    let removed = 0;
    let created = 0;
    let updated = 0;
    for (const activity of existing)
      if (!planned.has(activity.inventoryMovementId!)) {
        await tx.carbonActivity.delete({ where: { id: activity.id } });
        removed += 1;
      }
    for (const activity of plan.activities) {
      const current = byMovement.get(activity.inventoryMovementId);
      if (current && sameActivity(current, activity)) continue;
      const data = { ...activity, source: CarbonActivitySource.PRODUCTION_CONSUMPTION };
      if (current) {
        await tx.carbonActivity.update({ where: { id: current.id }, data });
        updated += 1;
      } else {
        await tx.carbonActivity.create({ data: { ...data, footprintId } });
        created += 1;
      }
    }
    return {
      consumptionMovements: movements.length,
      automaticActivities: plan.activities.length,
      created,
      updated,
      removed,
      missingFactors: plan.missingFactors,
    };
  }

  private async circularity(db: Db, orderId: string) {
    const movements = await consumption(db, orderId);
    const productIds = [...new Set(movements.map((m) => m.productId))];
    const profiles = await db.circularMaterialProfile.findMany({
      where: { isActive: true, productId: { in: productIds } },
      include: { product: { select: productSelect } },
      orderBy: [{ metricCode: 'asc' }],
    });
    return circularityMetrics(profiles, movements);
  }

  private async detail(db: Db, orderId: string) {
    const order = await this.readOrder(db, orderId);
    const footprint = await db.productionFootprint.findUniqueOrThrow({
      where: { productionOrderId: orderId },
      include: footprintInclude,
    });
    const movements = await consumption(db, orderId);
    const covered = new Set(footprint.activities.map((a) => a.inventoryMovementId));
    // Faltante = consumo real sin actividad automática (no hay factor activo aplicado).
    const missingFactors: MissingFactor[] = planAutomaticActivities(
      movements.filter((m) => !covered.has(m.id)),
      new Map(),
    ).missingFactors;
    const finalized = footprint.status === CarbonFootprintStatus.FINALIZED;
    return {
      id: footprint.id,
      status: footprint.status,
      scope: footprint.scope,
      productionOrderId: footprint.productionOrderId,
      lotId: footprint.lotId,
      quantityProduced: footprint.quantityProducedSnapshot.toFixed(4),
      outputUnit: footprint.outputUnitSnapshot,
      totalKgCo2e: finalized ? formatCarbon(footprint.totalKgCo2e) : null,
      kgCo2ePerOutputUnit: footprint.kgCo2ePerOutputUnit
        ? formatCarbon(footprint.kgCo2ePerOutputUnit)
        : null,
      ...preview(footprint),
      missingFactors,
      boundaryNotes: footprint.boundaryNotes,
      calculatedAt: footprint.calculatedAt,
      finalizedAt: footprint.finalizedAt,
      finalizedBy: footprint.finalizedBy,
      createdAt: footprint.createdAt,
      updatedAt: footprint.updatedAt,
      productionOrder: {
        id: order.id,
        number: order.number,
        status: order.status,
        completedAt: order.completedAt,
        product: order.product,
      },
      lot: order.lot,
      activities: footprint.activities.map(serializeActivity),
      circularity: await this.circularity(db, orderId),
      circularityNotice: CIRCULARITY_NOTICE,
      disclaimer: CARBON_DISCLAIMER,
    };
  }

  private async recordActivity(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    id: string,
    before: Prisma.CarbonActivityGetPayload<object> | null,
    after: Prisma.CarbonActivityGetPayload<object> | null,
  ) {
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.CARBON_ACTIVITY, id },
      previousValues: before ? activityAudit(before) : undefined,
      newValues: after ? activityAudit(after) : undefined,
    });
  }
}
