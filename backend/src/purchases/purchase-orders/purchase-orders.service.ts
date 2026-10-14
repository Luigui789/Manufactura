import {
  BadRequestException,
  ConflictException,
  Injectable,
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
  Prisma,
  PurchaseOrderStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
} from './dto/create-purchase-order.dto.js';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import type { PurchaseOrdersQueryDto } from './dto/purchase-orders-query.dto.js';
import { PurchaseOrderErrors } from './purchase-order-errors.js';
import { PurchaseOrderRules } from './purchase-order-rules.js';
import { lockOrder, readOrder, serializeOrder } from './purchase-order-mapping.js';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: DocumentSequenceService,
  ) {}

  async list(query: PurchaseOrdersQueryDto) {
    const { page, limit } = query;
    const where: Prisma.PurchaseOrderWhereInput = {
      status: query.status,
      supplierId: query.supplierId,
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          items: { select: { lineTotal: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return {
      data: orders.map((order) => ({
        id: order.id,
        number: order.number,
        supplier: order.supplier,
        status: order.status,
        orderedAt: order.orderedAt,
        expectedDate: order.expectedDate?.toISOString().slice(0, 10) ?? null,
        total: order.items
          .reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0))
          .toFixed(2),
        itemsCount: order.items.length,
      })),
      meta: { page, limit, total },
    };
  }

  async get(id: string) {
    return serializeOrder(await readOrder(this.prisma, id));
  }

  async receipts(id: string) {
    return (await this.get(id)).receipts;
  }

  async create(actor: AuthenticatedUser, dto: CreatePurchaseOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSupplier(tx, dto.supplierId);
      const now = new Date();
      const number = await this.sequence.nextCode(tx, DocumentType.PURCHASE_ORDER, now);
      await this.validateCatalog(tx, dto.supplierId, dto.items);
      const order = await tx.purchaseOrder.create({
        data: {
          number,
          supplierId: dto.supplierId.toLowerCase(),
          orderedAt: now,
          createdByUserId: actor.id,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          items: { create: this.itemData(dto.items) },
        },
      });
      const result = serializeOrder(await readOrder(tx, order.id));
      await this.record(tx, actor, AuditAction.CREATE, result);
      return result;
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdatePurchaseOrderDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Indica campos para actualizar');
    return this.prisma.$transaction(async (tx) => {
      const before = await lockOrder(tx, id);
      if (!PurchaseOrderRules.canEdit(before.status)) throw PurchaseOrderErrors.notEditable();
      const items =
        dto.items ??
        before.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantityOrdered.toFixed(4),
          unitPrice: i.unitPrice.toFixed(4),
        }));
      const supplierId = dto.supplierId ?? before.supplierId;
      await this.validateCatalog(tx, supplierId, items);
      if (dto.items) await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplierId.toLowerCase(),
          expectedDate:
            dto.expectedDate === undefined
              ? undefined
              : dto.expectedDate
                ? new Date(dto.expectedDate)
                : null,
          ...(dto.items ? { items: { create: this.itemData(dto.items) } } : {}),
        },
      });
      const result = serializeOrder(await readOrder(tx, id));
      await this.record(tx, actor, AuditAction.UPDATE, result, serializeOrder(before));
      return result;
    });
  }

  async confirm(actor: AuthenticatedUser, id: string) {
    return this.transition(actor, id, AuditAction.CONFIRM);
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    return this.transition(actor, id, AuditAction.CANCEL);
  }

  private async transition(actor: AuthenticatedUser, id: string, action: 'CONFIRM' | 'CANCEL') {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockOrder(tx, id);
      if (action === AuditAction.CONFIRM) {
        if (!PurchaseOrderRules.canConfirm(before.status))
          throw new ConflictException('Solo se confirma un borrador');
        await this.validateCatalog(tx, before.supplierId, before.items);
      } else if (!PurchaseOrderRules.canCancel(before.status, before.receipts.length > 0)) {
        throw new ConflictException('La orden no puede cancelarse en su estado actual');
      }
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status:
            action === AuditAction.CONFIRM
              ? PurchaseOrderStatus.CONFIRMED
              : PurchaseOrderStatus.CANCELLED,
        },
      });
      const result = serializeOrder(await readOrder(tx, id));
      await this.record(tx, actor, action, result, serializeOrder(before));
      return result;
    });
  }

  private itemData(items: PurchaseOrderItemDto[]) {
    return items.map((item) => {
      const quantityOrdered = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      const lineTotal = PurchaseOrderRules.calculateLineTotal(quantityOrdered, unitPrice);
      if (lineTotal.gte('1000000000000'))
        throw new UnprocessableEntityException('El total de línea excede Decimal(14,2)');
      return { productId: item.productId.toLowerCase(), quantityOrdered, unitPrice, lineTotal };
    });
  }

  private async validateCatalog(
    tx: Prisma.TransactionClient,
    supplierId: string,
    items: { productId: string }[],
  ) {
    await this.lockSupplier(tx, supplierId);
    for (const productId of [...new Set(items.map((i) => i.productId.toLowerCase()))].sort()) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`;
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw PurchaseOrderErrors.referenceNotFound('Producto');
      if (!product.isActive) throw PurchaseOrderErrors.inactiveCatalog(product.name);
      if (!PurchaseOrderRules.isProductTypeAllowed(product.type))
        throw new UnprocessableEntityException('Solo se compran materias primas y consumibles');
    }
  }

  private async lockSupplier(tx: Prisma.TransactionClient, supplierId: string) {
    await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${supplierId}::uuid FOR SHARE`;
    const supplier = await tx.supplier.findUnique({ where: { id: supplierId.toLowerCase() } });
    if (!supplier) throw PurchaseOrderErrors.referenceNotFound('Proveedor');
    if (!supplier.isActive) throw PurchaseOrderErrors.inactiveCatalog('Proveedor');
  }

  private async record(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    action: AuditAction,
    order: ReturnType<typeof serializeOrder>,
    before?: ReturnType<typeof serializeOrder>,
  ) {
    const snapshot = (value: ReturnType<typeof serializeOrder>) => ({
      number: value.number,
      supplierId: value.supplier.id,
      status: value.status,
      expectedDate: value.expectedDate,
      total: value.total,
      items: value.items.map(({ id, productId, quantityOrdered, unitPrice, lineTotal }) => ({
        id,
        productId,
        quantityOrdered,
        unitPrice,
        lineTotal,
      })),
    });
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.PURCHASE_ORDER, id: order.id },
      previousValues: before ? snapshot(before) : undefined,
      newValues: snapshot(order),
    });
  }
}
