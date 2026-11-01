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
import { StockQueryService } from '../../inventory/stock/stock-query.service.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  DocumentType,
  Prisma,
  ProductType,
  SaleOrderStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateSaleOrderDto,
  SaleOrderItemDto,
  UpdateSaleOrderDto,
} from './dto/sale-orders.dto.js';
import type { SaleOrdersQueryDto } from './dto/sale-orders-query.dto.js';

type Tx = Prisma.TransactionClient;
type LoadedOrder = Prisma.SaleOrderGetPayload<{ include: typeof orderInclude }>;
const orderInclude = {
  customer: { select: { id: true, code: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, code: true, name: true, unit: true, isLotTracked: true } },
    },
    orderBy: { id: 'asc' as const },
  },
  dispatches: {
    include: {
      createdBy: { select: { id: true, fullName: true } },
      items: {
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          lot: { select: { id: true, code: true, status: true } },
        },
        orderBy: { id: 'asc' as const },
      },
    },
    orderBy: [{ dispatchedAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.SaleOrderInclude;

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequence: DocumentSequenceService,
    private readonly stock: StockQueryService,
  ) {}

  async list(query: SaleOrdersQueryDto) {
    const where: Prisma.SaleOrderWhereInput = {
      status: query.status,
      customerId: query.customerId?.toLowerCase(),
      ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.saleOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.saleOrder.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.serialize(row)),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async get(id: string) {
    const row = await this.prisma.saleOrder.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw new NotFoundException('Orden de venta no encontrada');
    return this.withAvailability(this.prisma, this.serialize(row));
  }

  async create(actor: AuthenticatedUser, dto: CreateSaleOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockAndValidateCustomer(tx, dto.customerId);
      const now = new Date();
      const number = await this.sequence.nextCode(tx, DocumentType.SALE_ORDER, now);
      await this.lockAndValidateProducts(tx, dto.items);
      const created = await tx.saleOrder.create({
        data: {
          number,
          customerId: dto.customerId.toLowerCase(),
          orderedAt: now,
          createdByUserId: actor.id,
          items: { create: this.itemData(dto.items) },
        },
      });
      const row = await this.read(tx, created.id);
      await this.record(tx, actor, AuditAction.CREATE, row);
      return this.serialize(row);
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateSaleOrderDto) {
    if (!Object.keys(dto).length) throw new BadRequestException('Indica campos para actualizar');
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== SaleOrderStatus.DRAFT)
        throw new ConflictException('Solo se puede editar un borrador');
      const customerId = dto.customerId ?? before.customerId;
      const items =
        dto.items ??
        before.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity.toFixed(4),
          unitPrice: i.unitPrice.toFixed(4),
        }));
      await this.lockAndValidateCustomer(tx, customerId);
      await this.lockAndValidateProducts(tx, items);
      if (dto.items) await tx.saleOrderItem.deleteMany({ where: { saleOrderId: id } });
      await tx.saleOrder.update({
        where: { id },
        data: {
          customerId: customerId.toLowerCase(),
          ...(dto.items ? { items: { create: this.itemData(dto.items) } } : {}),
        },
      });
      const after = await this.read(tx, id);
      await this.record(tx, actor, AuditAction.UPDATE, after, before);
      return this.serialize(after);
    });
  }

  async confirm(actor: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== SaleOrderStatus.DRAFT)
        throw new ConflictException('Solo se puede confirmar un borrador');
      await this.lockAndValidateCustomer(tx, before.customerId);
      await this.lockAndValidateProducts(
        tx,
        before.items.map((i) => ({ productId: i.productId })),
      );
      const availability = await this.availabilityByProduct(
        tx,
        before.items.map((item) => item.productId),
      );
      const required = new Map<string, Prisma.Decimal>();
      for (const item of before.items)
        required.set(
          item.productId,
          (required.get(item.productId) ?? new Prisma.Decimal(0)).plus(item.quantity),
        );
      for (const [productId, quantity] of required) {
        if ((availability.get(productId) ?? new Prisma.Decimal(0)).lt(quantity)) {
          throw new ConflictException(
            `Existencia disponible insuficiente para ${before.items.find((i) => i.productId === productId)?.product.name ?? 'un producto'}`,
          );
        }
      }
      await tx.saleOrder.update({ where: { id }, data: { status: SaleOrderStatus.CONFIRMED } });
      const after = await this.read(tx, id);
      await this.record(tx, actor, AuditAction.CONFIRM, after, before);
      return this.serialize(after);
    });
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== SaleOrderStatus.DRAFT && before.status !== SaleOrderStatus.CONFIRMED) {
        throw new ConflictException('La orden de venta no puede cancelarse en su estado actual');
      }
      await tx.saleOrder.update({ where: { id }, data: { status: SaleOrderStatus.CANCELLED } });
      const after = await this.read(tx, id);
      await this.record(tx, actor, AuditAction.CANCEL, after, before);
      return this.serialize(after);
    });
  }

  private async lockAndValidateCustomer(tx: Tx, customerId: string) {
    const id = customerId.toLowerCase();
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${id}::uuid FOR SHARE`;
    const customer = await tx.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    if (!customer.isActive) throw new UnprocessableEntityException('El cliente está inactivo');
  }

  private async lockAndValidateProducts(tx: Tx, items: { productId: string }[]) {
    for (const productId of [...new Set(items.map((i) => i.productId.toLowerCase()))].sort()) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR SHARE`;
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Producto no encontrado');
      if (!product.isActive)
        throw new UnprocessableEntityException(`El producto ${product.name} está inactivo`);
      if (product.type !== ProductType.FINISHED_GOOD)
        throw new UnprocessableEntityException('Solo se pueden vender productos terminados');
    }
  }

  private itemData(items: SaleOrderItemDto[]) {
    return items.map((item) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      const lineTotal = quantity.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (lineTotal.gte('1000000000000'))
        throw new UnprocessableEntityException('El total de línea excede Decimal(14,2)');
      return { productId: item.productId.toLowerCase(), quantity, unitPrice, lineTotal };
    });
  }

  private async availabilityByProduct(tx: Tx, productIds: string[]) {
    const result = new Map<string, Prisma.Decimal>();
    for (const productId of [...new Set(productIds)].sort()) {
      const balances = await tx.stockBalance.findMany({
        where: { productId },
        select: { warehouseId: true },
      });
      let available = new Prisma.Decimal(0);
      for (const { warehouseId } of balances)
        available = available.plus(
          await this.stock.getConsumableQuantity(productId, warehouseId, tx),
        );
      result.set(productId, available);
    }
    return result;
  }

  private async withAvailability(
    tx: PrismaService | Tx,
    order: ReturnType<SalesOrdersService['serialize']>,
  ) {
    const availability = await this.availabilityByProduct(
      tx,
      order.items.map((item) => item.productId),
    );
    return {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        availableQuantity: (availability.get(item.productId) ?? new Prisma.Decimal(0)).toFixed(4),
      })),
    };
  }

  private async read(tx: Tx, id: string): Promise<LoadedOrder> {
    const row = await tx.saleOrder.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw new NotFoundException('Orden de venta no encontrada');
    return row;
  }

  private async lock(tx: Tx, id: string): Promise<LoadedOrder> {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM sale_orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Orden de venta no encontrada');
    return this.read(tx, id);
  }

  private serialize(row: LoadedOrder) {
    const dispatchedByItem = new Map<string, Prisma.Decimal>();
    for (const dispatch of row.dispatches)
      for (const dispatchItem of dispatch.items)
        dispatchedByItem.set(
          dispatchItem.saleOrderItemId,
          (dispatchedByItem.get(dispatchItem.saleOrderItemId) ?? new Prisma.Decimal(0)).plus(
            dispatchItem.quantity,
          ),
        );
    const items = row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      productUnit: item.product.unit,
      isLotTracked: item.product.isLotTracked,
      quantity: item.quantity.toFixed(4),
      quantityDispatched: (dispatchedByItem.get(item.id) ?? new Prisma.Decimal(0)).toFixed(4),
      quantityPending: item.quantity
        .minus(dispatchedByItem.get(item.id) ?? new Prisma.Decimal(0))
        .toFixed(4),
      unitPrice: item.unitPrice.toFixed(4),
      lineTotal: item.lineTotal.toFixed(2),
    }));
    return {
      id: row.id,
      number: row.number,
      customer: row.customer,
      status: row.status,
      orderedAt: row.orderedAt,
      total: items
        .reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0))
        .toFixed(2),
      itemsCount: items.length,
      items,
      dispatches: row.dispatches.map((dispatch) => ({
        id: dispatch.id,
        number: dispatch.number,
        dispatchedAt: dispatch.dispatchedAt,
        createdBy: dispatch.createdBy,
        items: dispatch.items.map((item) => ({
          id: item.id,
          saleOrderItemId: item.saleOrderItemId,
          productId: item.productId,
          warehouse: item.warehouse,
          lot: item.lot,
          quantity: item.quantity.toFixed(4),
        })),
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async record(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    after: LoadedOrder,
    before?: LoadedOrder,
  ) {
    const snapshot = (order: LoadedOrder) => ({
      number: order.number,
      customerId: order.customerId,
      status: order.status,
      items: order.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity.toFixed(4),
        unitPrice: i.unitPrice.toFixed(4),
        lineTotal: i.lineTotal.toFixed(2),
      })),
    });
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.SALES_ORDER, id: after.id },
      previousValues: before ? snapshot(before) : undefined,
      newValues: snapshot(after),
    });
  }
}
