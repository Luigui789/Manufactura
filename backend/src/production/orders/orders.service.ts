import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/access-policy.js';
import { DocumentSequenceService } from '../../common/document-sequence/document-sequence.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  DocumentType,
  InventoryMovementType,
  LotStatus,
  Prisma,
  ProductionOrderStatus,
  type ProductionOrder,
} from '../../generated/prisma/client.js';
import { StockQueryService } from '../../inventory/stock/stock-query.service.js';
import {
  InventoryService,
  type MovementLine,
} from '../../inventory/movements/inventory.service.js';
import { currentRequestContext } from '../../common/request-context/request-context.js';
import type { CompleteOrderDto } from './dto/complete-order.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BomCalculatorService, bomQuantity } from '../boms/bom-calculator.service.js';
import type {
  CreateProductionOrderDto,
  OrdersQueryDto,
  UpdateProductionOrderDto,
} from './dto/orders.dto.js';

const productSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit: true,
  isActive: true,
  isLotTracked: true,
  requiresQualityInspection: true,
} satisfies Prisma.ProductSelect;
const orderInclude = {
  lot: { select: { id: true, code: true, status: true } },
  product: { select: productSelect },
  warehouse: { select: { id: true, code: true, name: true, isActive: true } },
  bomVersion: {
    include: {
      bom: { include: { product: { select: productSelect } } },
      items: {
        orderBy: { componentProductId: 'asc' },
        include: { componentProduct: { select: productSelect } },
      },
    },
  },
} satisfies Prisma.ProductionOrderInclude;
type OrderDetail = Prisma.ProductionOrderGetPayload<{ include: typeof orderInclude }>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: DocumentSequenceService,
    private readonly stock: StockQueryService,
    private readonly calculator: BomCalculatorService,
    private readonly inventory: InventoryService,
  ) {}

  async list(query: OrdersQueryDto) {
    const { page, limit, status, productId, warehouseId, search } = query;
    const where: Prisma.ProductionOrderWhereInput = {
      status,
      productId,
      warehouseId,
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { code: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    return { data: orders.map(serialize), meta: { page, limit, total } };
  }

  async get(id: string) {
    return serialize(await this.read(this.prisma, id));
  }

  async create(actor: AuthenticatedUser, dto: CreateProductionOrderDto) {
    const plannedStartAt = dateValue(dto.plannedStartAt);
    const plannedEndAt = dateValue(dto.plannedEndAt);
    assertWindow(plannedStartAt, plannedEndAt);
    const quantityPlanned = bomQuantity(dto.quantityPlanned);
    return this.prisma.$transaction(async (tx) => {
      const version = await this.lockVersion(
        tx,
        dto.productId.toLowerCase(),
        dto.bomVersionId.toLowerCase(),
        true,
      );
      const createdAt = new Date();
      // Root BOM → sequence → sorted products → warehouse; never acquire a sequence after catalog locks.
      const number = await this.sequence.nextCode(tx, DocumentType.OP, createdAt);
      await this.validateCatalog(tx, version, dto.warehouseId.toLowerCase());
      this.calculate(version, quantityPlanned);
      const order = await tx.productionOrder.create({
        data: {
          number,
          productId: version.bom.productId,
          bomVersionId: version.id,
          warehouseId: dto.warehouseId.toLowerCase(),
          quantityPlanned,
          plannedStartAt,
          plannedEndAt,
          createdByUserId: actor.id,
          createdAt,
        },
      });
      await this.record(tx, actor, AuditAction.CREATE, order);
      return serialize(await this.read(tx, order.id));
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateProductionOrderDto) {
    if (Object.keys(dto).length === 0)
      throw new BadRequestException('Indica campos para actualizar');
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockOrder(tx, id);
      assertDraft(before);
      const productId = dto.productId?.toLowerCase() ?? before.productId;
      const bomVersionId = dto.bomVersionId?.toLowerCase() ?? before.bomVersionId;
      const warehouseId = dto.warehouseId?.toLowerCase() ?? before.warehouseId;
      const quantityPlanned =
        dto.quantityPlanned === undefined
          ? before.quantityPlanned
          : bomQuantity(dto.quantityPlanned);
      const plannedStartAt =
        dto.plannedStartAt === undefined ? before.plannedStartAt : dateValue(dto.plannedStartAt);
      const plannedEndAt =
        dto.plannedEndAt === undefined ? before.plannedEndAt : dateValue(dto.plannedEndAt);
      assertWindow(plannedStartAt, plannedEndAt);
      // Activation only governs selection. An existing draft retains its historical version.
      const version = await this.lockVersion(
        tx,
        productId,
        bomVersionId,
        bomVersionId !== before.bomVersionId,
      );
      await this.validateCatalog(tx, version, warehouseId);
      this.calculate(version, quantityPlanned);
      const after = await tx.productionOrder.update({
        where: { id },
        data: {
          productId,
          bomVersionId,
          warehouseId,
          quantityPlanned,
          plannedStartAt,
          plannedEndAt,
        },
      });
      await this.record(tx, actor, AuditAction.UPDATE, after, before);
      return serialize(await this.read(tx, id));
    });
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockOrder(tx, id);
      assertDraft(before);
      const after = await tx.productionOrder.update({
        where: { id },
        data: { status: ProductionOrderStatus.CANCELLED },
      });
      await this.record(tx, actor, AuditAction.CANCEL_PRODUCTION, after, before);
      return serialize(await this.read(tx, id));
    });
  }

  async start(actor: AuthenticatedUser, id: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const before = await this.lockOrder(tx, id);
          assertDraft(before);
          const version = await this.lockVersion(tx, before.productId, before.bomVersionId, false);
          await this.validateCatalog(tx, version, before.warehouseId);
          const required = this.calculate(version, before.quantityPlanned);
          for (const item of required) {
            const available = await this.stock.getConsumableQuantity(
              item.productId,
              before.warehouseId,
              tx,
            );
            if (available.lt(item.required))
              throw new ConflictException(
                'Existencia consumible insuficiente para iniciar la orden',
              );
          }
          const after = await tx.productionOrder.update({
            where: { id },
            data: { status: ProductionOrderStatus.IN_PROGRESS, startedAt: new Date() },
          });
          await this.record(tx, actor, AuditAction.START, after, before);
          return serialize(await this.read(tx, id));
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const adapter = error.meta?.driverAdapterError as
          { cause?: { originalCode?: string } } | undefined;
        if (
          error.code === 'P2034' ||
          (error.code === 'P2010' &&
            (adapter?.cause?.originalCode === '40001' || error.meta?.code === '40001'))
        )
          throw new ConflictException(
            'La orden o su disponibilidad cambió; actualizá e intentá de nuevo',
          );
      }
      throw error;
    }
  }

  async complete(actor: AuthenticatedUser, id: string, dto: CompleteOrderDto) {
    const produced = bomQuantity(dto.quantityProduced);
    return this.prisma.$transaction(
      async (tx) => {
        const before = await this.lockOrder(tx, id);
        if (before.status !== ProductionOrderStatus.IN_PROGRESS)
          throw new ConflictException('Solo se puede completar una orden en proceso');
        if (produced.gt(before.quantityPlanned))
          throw new UnprocessableEntityException(
            'La cantidad producida no puede superar la planificada',
          );
        const version = await this.lockVersion(tx, before.productId, before.bomVersionId, false);
        const completedAt = new Date();
        const code = await this.sequence.nextCode(tx, DocumentType.LOT, completedAt);
        await this.validateCatalog(tx, version, before.warehouseId);
        const order = await this.read(tx, id);
        const calculated = this.calculate(order.bomVersion, before.quantityPlanned);
        const assigned = new Map<string, CompleteOrderDto['allocations'][number]>();
        for (const allocation of dto.allocations) {
          const productId = allocation.productId.toLowerCase();
          if (
            assigned.has(productId) ||
            !order.bomVersion.items.some(
              (item) => item.componentProductId === productId && item.componentProduct.isLotTracked,
            )
          )
            throw new UnprocessableEntityException(
              'Asignación duplicada o componente no trazable de esta orden',
            );
          assigned.set(productId, allocation);
        }
        const origin = { kind: 'PRODUCTION_ORDER' as const, productionOrderId: before.id };
        const lines: MovementLine[] = [];
        for (const [index, component] of order.bomVersion.items.entries()) {
          const required = bomQuantity(calculated[index].required);
          const base = {
            type: InventoryMovementType.PRODUCTION_CONSUMPTION,
            productId: component.componentProductId,
            warehouseId: before.warehouseId,
            origin,
          };
          if (!component.componentProduct.isLotTracked) {
            lines.push({ ...base, quantity: required });
            continue;
          }
          const allocation = assigned.get(component.componentProductId);
          if (!allocation)
            throw new UnprocessableEntityException(
              'Se requieren lotes para cada componente trazable',
            );
          const lotIds = new Set<string>();
          let total = new Prisma.Decimal(0);
          for (const item of allocation.lots) {
            const lotId = item.lotId.toLowerCase();
            if (lotIds.has(lotId))
              throw new UnprocessableEntityException('Lote duplicado en la asignación');
            lotIds.add(lotId);
            const quantity = bomQuantity(item.quantity);
            total = total.add(quantity);
            lines.push({ ...base, lotId, quantity });
          }
          if (!total.eq(required))
            throw new UnprocessableEntityException(
              'La suma de lotes debe coincidir exactamente con el consumo planificado',
            );
        }
        lines.push({
          type: InventoryMovementType.PRODUCTION_OUTPUT,
          productId: before.productId,
          warehouseId: before.warehouseId,
          quantity: produced,
          origin,
          newLot: {
            code,
            productionOrderId: before.id,
            status: order.product.requiresQualityInspection
              ? LotStatus.QUARANTINED
              : LotStatus.RELEASED,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt + 'T00:00:00Z') : null,
          },
        });
        await this.inventory.applyMovements(tx, {
          performedByUserId: actor.id,
          occurredAt: completedAt,
          requestId: currentRequestContext()?.requestId,
          lines,
        });
        const after = await tx.productionOrder.update({
          where: { id },
          data: {
            status: ProductionOrderStatus.COMPLETED,
            quantityProduced: produced,
            completedAt,
          },
        });
        await this.record(tx, actor, AuditAction.COMPLETE, after, before);
        return serialize(await this.read(tx, id));
      },
      { timeout: 15000 },
    );
  }

  async requirements(id: string) {
    const order = await this.read(this.prisma, id);
    const calculated = this.calculate(order.bomVersion, order.quantityPlanned);
    const items = await Promise.all(
      order.bomVersion.items.map(async (item, index) => {
        const required = bomQuantity(calculated[index].required);
        const available = await this.stock.getConsumableQuantity(
          item.componentProductId,
          order.warehouseId,
        );
        const shortage = required.greaterThan(available)
          ? required.minus(available)
          : new Prisma.Decimal(0);
        return {
          product: item.componentProduct,
          required: required.toFixed(4),
          available: available.toFixed(4),
          shortage: shortage.toFixed(4),
        };
      }),
    );
    const eligibilityIssues = catalogIssues(order.bomVersion, order.warehouse);
    if (order.status !== ProductionOrderStatus.DRAFT)
      eligibilityIssues.push('La orden no está en borrador');
    return {
      orderId: order.id,
      bomVersionId: order.bomVersionId,
      version: order.bomVersion.version,
      quantityPlanned: order.quantityPlanned.toFixed(4),
      warehouseId: order.warehouseId,
      updatedAt: order.updatedAt,
      canStart: eligibilityIssues.length === 0 && items.every((item) => item.shortage === '0.0000'),
      eligibilityIssues,
      items,
    };
  }

  private calculate(version: OrderDetail['bomVersion'], planned: Prisma.Decimal) {
    return this.calculator.calculate(
      version.outputQuantity,
      planned,
      version.items.map((item) => ({
        productId: item.componentProductId,
        quantity: item.quantity,
      })),
    );
  }

  private async read(tx: Pick<Tx, 'productionOrder'>, id: string) {
    const order = await tx.productionOrder.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  private async lockOrder(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM production_orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Orden de producción no encontrada');
    return tx.productionOrder.findUniqueOrThrow({ where: { id } });
  }

  private async lockVersion(tx: Tx, productId: string, versionId: string, requireActive: boolean) {
    // Version content cannot change; the BOM mutex serializes activation/deactivation.
    const found = await tx.bomVersion.findUnique({
      where: { id: versionId },
      select: { bomId: true },
    });
    if (!found) throw new NotFoundException('Versión de fórmula no encontrada');
    await tx.$queryRaw`SELECT id FROM bills_of_material WHERE id = ${found.bomId}::uuid FOR UPDATE`;
    const version = await tx.bomVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: orderInclude.bomVersion.include,
    });
    if (version.bom.productId !== productId)
      throw new UnprocessableEntityException('La versión no pertenece al producto de la orden');
    if (!version.bom.isActive || (requireActive && !version.isActive))
      throw new ConflictException('Selecciona una fórmula y versión activas');
    return version;
  }

  private async validateCatalog(tx: Tx, version: OrderDetail['bomVersion'], warehouseId: string) {
    for (const productId of [
      ...new Set([version.bom.productId, ...version.items.map((item) => item.componentProductId)]),
    ].sort()) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`;
    }
    await tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${warehouseId}::uuid FOR SHARE`;
    const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException('Almacén no encontrado');
    // Re-read catalog after obtaining locks: it may have changed while we waited.
    const current = await tx.bomVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: {
        ...orderInclude.bomVersion.include,
        bom: { include: { product: { select: productSelect } } },
      },
    });
    const issues = catalogIssues(current, warehouse);
    if (issues.length) throw new UnprocessableEntityException(issues.join('; '));
  }

  private async record(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    order: ProductionOrder,
    before?: ProductionOrder,
  ) {
    const execution = action === AuditAction.START || action === AuditAction.COMPLETE;
    const current = snapshot(order, execution);
    const previous = before ? snapshot(before, execution) : undefined;
    const keys = Object.keys(current) as Array<keyof typeof current>;
    const changed = previous ? keys.filter((key) => previous[key] !== current[key]) : keys;
    if (changed.length === 0) return;
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.PRODUCTION_ORDER, id: order.id },
      previousValues: previous
        ? Object.fromEntries(changed.map((key) => [key, previous[key]]))
        : undefined,
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }
}

function catalogIssues(version: OrderDetail['bomVersion'], warehouse: { isActive: boolean }) {
  const issues: string[] = [];
  if (!version.bom.isActive) issues.push('La fórmula está inactiva');
  if (!warehouse.isActive) issues.push('El almacén está inactivo');
  const output = version.bom.product;
  if (
    !output.isActive ||
    !output.isLotTracked ||
    !['INTERMEDIATE', 'FINISHED_GOOD'].includes(output.type)
  )
    issues.push('El producto de salida debe estar activo y ser trazable, intermedio o terminado');
  if (
    version.items.some(
      (item) =>
        !item.componentProduct.isActive ||
        !['RAW_MATERIAL', 'CONSUMABLE', 'INTERMEDIATE'].includes(item.componentProduct.type),
    )
  )
    issues.push('Los componentes deben estar activos y ser materia prima, consumible o intermedio');
  return issues;
}

function assertDraft(order: ProductionOrder) {
  if (order.status !== ProductionOrderStatus.DRAFT)
    throw new ConflictException('Solo se puede modificar o cancelar una orden en borrador');
}
function dateValue(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException('Fecha de planificación inválida');
  return date;
}
function assertWindow(start: Date | null, end: Date | null) {
  if (start && end && end < start)
    throw new UnprocessableEntityException(
      'El fin planificado debe ser igual o posterior al inicio',
    );
}
function snapshot(order: ProductionOrder, execution = false) {
  return {
    number: order.number,
    productId: order.productId,
    bomVersionId: order.bomVersionId,
    warehouseId: order.warehouseId,
    quantityPlanned: order.quantityPlanned.toFixed(4),
    ...(execution
      ? {
          quantityProduced: order.quantityProduced.toFixed(4),
          startedAt: order.startedAt?.toISOString() ?? null,
          completedAt: order.completedAt?.toISOString() ?? null,
        }
      : {}),
    status: order.status,
    plannedStartAt: order.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: order.plannedEndAt?.toISOString() ?? null,
    createdByUserId: order.createdByUserId,
  };
}
function serialize(order: OrderDetail) {
  return {
    ...order,
    quantityPlanned: order.quantityPlanned.toFixed(4),
    quantityProduced: order.quantityProduced.toFixed(4),
    bomVersion: {
      ...order.bomVersion,
      outputQuantity: order.bomVersion.outputQuantity.toFixed(4),
      items: order.bomVersion.items.map((item) => ({
        ...item,
        quantity: item.quantity.toFixed(4),
      })),
    },
  };
}
