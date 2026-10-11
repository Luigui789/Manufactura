import {
  BadRequestException,
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
  Prisma,
  type BillOfMaterial,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BomCalculatorService, bomQuantity } from './bom-calculator.service.js';
import type { CreateBomDto, CreateBomVersionDto, UpdateBomDto } from './dto/boms.dto.js';

const productSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit: true,
  isActive: true,
} satisfies Prisma.ProductSelect;
const catalogSelect = { ...productSelect, isLotTracked: true } satisfies Prisma.ProductSelect;
const versionInclude = {
  items: {
    orderBy: { componentProductId: 'asc' },
    include: { componentProduct: { select: productSelect } },
  },
} satisfies Prisma.BomVersionInclude;
const bomInclude = {
  product: { select: productSelect },
  versions: { orderBy: { version: 'desc' }, include: versionInclude },
} satisfies Prisma.BillOfMaterialInclude;

type Tx = Prisma.TransactionClient;
type BomDetail = Prisma.BillOfMaterialGetPayload<{ include: typeof bomInclude }>;
type VersionDetail = Prisma.BomVersionGetPayload<{ include: typeof versionInclude }>;
type CatalogProduct = Prisma.ProductGetPayload<{ select: typeof catalogSelect }>;
type BomQuery = { page: number; limit: number; search?: string; isActive?: boolean };

@Injectable()
export class BomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly calculator: BomCalculatorService,
  ) {}

  async list(query: BomQuery) {
    const { page, limit, search, isActive } = query;
    const where: Prisma.BillOfMaterialWhereInput = {
      isActive,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { product: { code: { contains: search, mode: 'insensitive' } } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [boms, total] = await this.prisma.$transaction([
      this.prisma.billOfMaterial.findMany({
        where,
        include: bomInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.billOfMaterial.count({ where }),
    ]);
    return { data: boms.map(serializeBom), meta: { page, limit, total } };
  }

  async get(id: string) {
    const bom = await this.prisma.billOfMaterial.findUnique({ where: { id }, include: bomInclude });
    if (!bom) throw new NotFoundException('Fórmula no encontrada');
    return serializeBom(bom);
  }

  async create(actor: AuthenticatedUser, dto: CreateBomDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // La cabecera nueva pertenece a esta transacción antes de validar el catálogo.
        const bom = await tx.billOfMaterial.create({
          data: { productId: dto.productId.toLowerCase(), name: dto.name },
        });
        const products = await lockProducts(tx, [bom.productId]);
        assertOutput(products, bom.productId);
        await this.audit.record(tx, {
          actor: { type: ActorType.USER, userId: actor.id },
          action: AuditAction.CREATE,
          entity: { type: AuditEntityType.BILL_OF_MATERIAL, id: bom.id },
          newValues: bomSnapshot(bom),
        });
        return readBom(tx, bom.id);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2003')) throw new NotFoundException('Producto no encontrado');
      throw translateUniqueBom(error);
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateBomDto) {
    if (dto.name === undefined) throw new BadRequestException('Indica un nombre para actualizar');
    return this.prisma.$transaction(async (tx) => {
      const before = await lockBom(tx, id);
      if (before.name !== dto.name) {
        const after = await tx.billOfMaterial.update({ where: { id }, data: { name: dto.name } });
        await this.recordBomChange(tx, actor, AuditAction.UPDATE, before, after);
      }
      return readBom(tx, id);
    });
  }

  async setStatus(actor: AuthenticatedUser, id: string, isActive: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockBom(tx, id);
      if (before.isActive === isActive)
        throw new ConflictException('La fórmula ya tiene ese estado');
      // Deshabilitar siempre es posible; habilitar exige un catálogo vigente.
      if (isActive) {
        const active = await tx.bomVersion.findFirst({
          where: { bomId: id, isActive: true },
          include: versionInclude,
        });
        const componentIds = active?.items.map((item) => item.componentProductId) ?? [];
        const products = await lockProducts(tx, [before.productId, ...componentIds]);
        assertOutput(products, before.productId);
        assertComponents(products, before.productId, componentIds);
      }
      const after = await tx.billOfMaterial.update({ where: { id }, data: { isActive } });
      await this.recordBomChange(
        tx,
        actor,
        isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
        before,
        after,
      );
      return readBom(tx, id);
    });
  }

  async createVersion(actor: AuthenticatedUser, bomId: string, dto: CreateBomVersionDto) {
    const outputQuantity = bomQuantity(dto.outputQuantity);
    const items = dto.items.map((item) => ({
      componentProductId: item.productId.toLowerCase(),
      quantity: bomQuantity(item.quantity),
    }));
    if (items.length === 0) {
      throw new UnprocessableEntityException({
        code: 'EMPTY_BOM',
        message: 'La fórmula necesita componentes',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const bom = await lockBom(tx, bomId);
      assertActiveBom(bom);
      const ids = items.map((item) => item.componentProductId);
      const products = await lockProducts(tx, [bom.productId, ...ids]);
      assertOutput(products, bom.productId);
      assertComponents(products, bom.productId, ids);
      const { _max } = await tx.bomVersion.aggregate({ where: { bomId }, _max: { version: true } });
      if (_max.version === 2147483647) {
        throw new ConflictException('Se alcanzó el límite de versiones de esta fórmula');
      }
      const version = (_max.version ?? 0) + 1;
      // La primera versión queda activa; las posteriores requieren activación explícita.
      const created = await tx.bomVersion.create({
        data: {
          bomId,
          version,
          outputQuantity,
          isActive: version === 1,
          createdByUserId: actor.id,
          items: { create: items },
        },
        include: versionInclude,
      });
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.CREATE,
        entity: { type: AuditEntityType.BOM_VERSION, id: created.id },
        newValues: versionSnapshot(created),
      });
      return serializeVersion(created);
    });
  }

  async activateVersion(actor: AuthenticatedUser, bomId: string, versionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const bom = await lockBom(tx, bomId);
      assertActiveBom(bom);
      const version = await readVersion(tx, bomId, versionId);
      if (version.isActive) throw new ConflictException('La versión ya está activa');
      const ids = version.items.map((item) => item.componentProductId);
      const products = await lockProducts(tx, [bom.productId, ...ids]);
      assertOutput(products, bom.productId);
      assertComponents(products, bom.productId, ids);
      const previous = await tx.bomVersion.findFirst({ where: { bomId, isActive: true } });
      if (previous) {
        await tx.bomVersion.update({ where: { id: previous.id }, data: { isActive: false } });
        await this.recordVersionStatus(tx, actor, previous.id, false);
      }
      const active = await tx.bomVersion.update({
        where: { id: versionId },
        data: { isActive: true },
        include: versionInclude,
      });
      await this.recordVersionStatus(tx, actor, active.id, true);
      return serializeVersion(active);
    });
  }

  async calculate(bomId: string, versionId: string, quantityPlanned: string) {
    const planned = bomQuantity(quantityPlanned);
    return this.prisma.$transaction(async (tx) => {
      const bom = await lockBom(tx, bomId);
      assertActiveBom(bom);
      const version = await readVersion(tx, bomId, versionId);
      const ids = version.items.map((item) => item.componentProductId);
      const products = await lockProducts(tx, [bom.productId, ...ids]);
      const product = assertOutput(products, bom.productId);
      assertComponents(products, bom.productId, ids);
      const requirements = this.calculator.calculate(
        version.outputQuantity,
        planned,
        version.items.map((item) => ({
          productId: item.componentProductId,
          quantity: item.quantity,
        })),
      );
      return {
        bomId: bom.id,
        bomVersionId: version.id,
        version: version.version,
        product: publicProduct(product),
        outputQuantity: version.outputQuantity.toFixed(4),
        quantityPlanned: planned.toFixed(4),
        items: version.items.map((item, index) => {
          const component = products.get(item.componentProductId)!;
          return {
            productId: component.id,
            code: component.code,
            name: component.name,
            unit: component.unit,
            quantity: item.quantity.toFixed(4),
            requiredQuantity: requirements[index].required,
          };
        }),
      };
    });
  }

  private async recordBomChange(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: BillOfMaterial,
    after: BillOfMaterial,
  ) {
    const previous = bomSnapshot(before);
    const current = bomSnapshot(after);
    const keys = Object.keys(current) as Array<keyof typeof current>;
    const changed = keys.filter((key) => previous[key] !== current[key]);
    if (changed.length === 0) return;
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.BILL_OF_MATERIAL, id: after.id },
      previousValues: Object.fromEntries(changed.map((key) => [key, previous[key]])),
      newValues: Object.fromEntries(changed.map((key) => [key, current[key]])),
    });
  }

  private async recordVersionStatus(
    tx: Tx,
    actor: AuthenticatedUser,
    versionId: string,
    isActive: boolean,
  ) {
    await this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action: isActive ? AuditAction.ENABLE : AuditAction.DISABLE,
      entity: { type: AuditEntityType.BOM_VERSION, id: versionId },
      previousValues: { isActive: !isActive },
      newValues: { isActive },
    });
  }
}

async function lockBom(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM bills_of_material WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException('Fórmula no encontrada');
  return tx.billOfMaterial.findUniqueOrThrow({ where: { id } });
}

async function lockProducts(tx: Tx, ids: readonly string[]) {
  const ordered = [...new Set(ids.map((id) => id.toLowerCase()))].sort();
  for (const id of ordered) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR SHARE`;
  }
  const products = await tx.product.findMany({
    where: { id: { in: ordered } },
    select: catalogSelect,
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const id of ordered) {
    if (!byId.has(id)) throw new NotFoundException('Producto no encontrado');
  }
  return byId;
}

function assertActiveBom(bom: BillOfMaterial) {
  if (!bom.isActive) throw new ConflictException('La fórmula está inactiva');
}

function assertOutput(products: Map<string, CatalogProduct>, productId: string) {
  const product = products.get(productId)!;
  if (
    !product.isActive ||
    !product.isLotTracked ||
    (product.type !== 'INTERMEDIATE' && product.type !== 'FINISHED_GOOD')
  ) {
    throw new UnprocessableEntityException({
      code: 'INVALID_BOM_OUTPUT',
      message: 'La salida debe ser un producto activo, trazable e intermedio o terminado',
    });
  }
  return product;
}

function assertComponents(
  products: Map<string, CatalogProduct>,
  outputId: string,
  ids: readonly string[],
) {
  if (new Set(ids).size !== ids.length) {
    throw new UnprocessableEntityException({
      code: 'DUPLICATE_BOM_COMPONENT',
      message: 'No se puede repetir un componente',
    });
  }
  for (const id of ids) {
    if (id === outputId) {
      throw new UnprocessableEntityException({
        code: 'BOM_SELF_REFERENCE',
        message: 'La salida no puede ser componente de su propia fórmula',
      });
    }
    const product = products.get(id)!;
    if (
      !product.isActive ||
      (product.type !== 'RAW_MATERIAL' &&
        product.type !== 'CONSUMABLE' &&
        product.type !== 'INTERMEDIATE')
    ) {
      throw new UnprocessableEntityException({
        code: 'INVALID_BOM_COMPONENT',
        message: 'Los componentes deben estar activos y ser materia prima, consumible o intermedio',
      });
    }
  }
}

async function readBom(tx: Tx, id: string) {
  return serializeBom(
    await tx.billOfMaterial.findUniqueOrThrow({ where: { id }, include: bomInclude }),
  );
}

async function readVersion(tx: Tx, bomId: string, id: string) {
  const version = await tx.bomVersion.findFirst({ where: { id, bomId }, include: versionInclude });
  if (!version) throw new NotFoundException('Versión de fórmula no encontrada');
  return version;
}

function serializeVersion(version: VersionDetail) {
  return {
    ...version,
    outputQuantity: version.outputQuantity.toFixed(4),
    items: version.items.map((item) => ({ ...item, quantity: item.quantity.toFixed(4) })),
  };
}

function serializeBom(bom: BomDetail) {
  return { ...bom, versions: bom.versions.map(serializeVersion) };
}

function publicProduct(product: CatalogProduct) {
  const { id, code, name, type, unit, isActive } = product;
  return { id, code, name, type, unit, isActive };
}

function bomSnapshot(bom: BillOfMaterial) {
  return { productId: bom.productId, name: bom.name, isActive: bom.isActive };
}

function versionSnapshot(version: VersionDetail) {
  return {
    bomId: version.bomId,
    version: version.version,
    outputQuantity: version.outputQuantity.toFixed(4),
    isActive: version.isActive,
    createdByUserId: version.createdByUserId,
    items: version.items.map((item) => ({
      componentProductId: item.componentProductId,
      quantity: item.quantity.toFixed(4),
    })),
  };
}

function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function translateUniqueBom(error: unknown): unknown {
  return isPrismaError(error, 'P2002')
    ? new ConflictException('Ya existe una fórmula para ese producto')
    : error;
}
