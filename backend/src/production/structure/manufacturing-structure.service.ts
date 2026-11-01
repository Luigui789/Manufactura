import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  buildManufacturingGraph,
  codePath,
  findCycle,
  isManufactured,
} from '../boms/bom-graph.service.js';

type Tx = Prisma.TransactionClient;

const productSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  unit: true,
  isActive: true,
} satisfies Prisma.ProductSelect;
const bomSelect = {
  id: true,
  productId: true,
  name: true,
  isActive: true,
  versions: {
    where: { isActive: true },
    select: {
      id: true,
      version: true,
      outputQuantity: true,
      items: {
        orderBy: { componentProductId: 'asc' },
        select: { quantity: true, componentProduct: { select: productSelect } },
      },
    },
  },
} satisfies Prisma.BillOfMaterialSelect;
const routeSelect = {
  id: true,
  productId: true,
  code: true,
  name: true,
  isActive: true,
  operations: {
    orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
    select: { id: true, sequence: true, name: true, description: true, standardMinutes: true },
  },
} satisfies Prisma.ProductionRouteSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
type BomRow = Prisma.BillOfMaterialGetPayload<{ select: typeof bomSelect }>;
type RouteRow = Prisma.ProductionRouteGetPayload<{ select: typeof routeSelect }>;

export type StructureIssueCode =
  | 'PRODUCT_INACTIVE'
  | 'MISSING_BOM'
  | 'BOM_INACTIVE'
  | 'MISSING_ACTIVE_BOM_VERSION'
  | 'EMPTY_BOM_VERSION'
  | 'MISSING_ROUTE'
  | 'ROUTE_INACTIVE'
  | 'NO_ROUTE_OPERATIONS';

const issueMessages: Record<StructureIssueCode, string> = {
  PRODUCT_INACTIVE: 'El producto está inactivo',
  MISSING_BOM: 'El producto no tiene fórmula de producción',
  BOM_INACTIVE: 'La fórmula de producción está inactiva',
  MISSING_ACTIVE_BOM_VERSION: 'La fórmula no tiene versión activa',
  EMPTY_BOM_VERSION: 'La versión activa no tiene componentes',
  MISSING_ROUTE: 'El producto no tiene ruta de producción',
  ROUTE_INACTIVE: 'La ruta de producción está inactiva',
  NO_ROUTE_OPERATIONS: 'La ruta de producción no tiene operaciones',
};

type Loaded = {
  products: Map<string, ProductRow>;
  boms: Map<string, BomRow>;
  routes: Map<string, RouteRow>;
};

/**
 * Estructura de manufactura: configuración vigente (fórmula activa + versión activa + ruta) de un
 * producto fabricado y de sus intermedios. Es solo lectura y no es trazabilidad histórica: la
 * ejecución real vive en lotes y movimientos de inventario.
 */
@Injectable()
export class ManufacturingStructureService {
  constructor(private readonly prisma: PrismaService) {}

  async get(productId: string) {
    const rootId = productId.toLowerCase();
    // Una instantánea consistente sin bloqueos: no compite con producción ni con el catálogo.
    return this.prisma.$transaction(
      async (tx) => {
        const root = await tx.product.findUnique({ where: { id: rootId }, select: productSelect });
        if (!root) throw new NotFoundException('Producto no encontrado');
        if (!isManufactured(root.type))
          throw new UnprocessableEntityException({
            statusCode: 422,
            code: 'INVALID_MANUFACTURING_STRUCTURE_ROOT',
            message: 'La estructura solo existe para productos intermedios o terminados',
          });
        const loaded = await this.load(tx, root);
        await assertNotCorrupted(tx, loaded, rootId);
        const structure = buildNode(loaded, rootId);
        return { ...structure, maxDepth: depthOf(structure) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Carga por niveles: dos consultas por nivel en lugar de varias por nodo. */
  private async load(tx: Tx, root: ProductRow): Promise<Loaded> {
    const loaded: Loaded = {
      products: new Map([[root.id, root]]),
      boms: new Map(),
      routes: new Map(),
    };
    const expanded = new Set<string>();
    let level = [root.id];
    while (level.length) {
      level.forEach((id) => expanded.add(id));
      const boms = await tx.billOfMaterial.findMany({
        where: { productId: { in: level } },
        select: bomSelect,
      });
      const routes = await tx.productionRoute.findMany({
        where: { productId: { in: level } },
        select: routeSelect,
      });
      boms.forEach((bom) => loaded.boms.set(bom.productId, bom));
      routes.forEach((route) => loaded.routes.set(route.productId, route));
      const next = new Set<string>();
      for (const bom of boms) {
        for (const item of expandedItems(bom)) {
          loaded.products.set(item.componentProduct.id, item.componentProduct);
          if (isManufactured(item.componentProduct.type) && !expanded.has(item.componentProduct.id))
            next.add(item.componentProduct.id);
        }
      }
      // El conjunto `expanded` corta la carga aunque existan ciclos en datos corruptos.
      level = [...next].sort();
    }
    return loaded;
  }
}

/** Solo una fórmula activa con versión activa aporta componentes, igual que en la validación. */
function expandedItems(bom: BomRow | undefined) {
  if (!bom?.isActive) return [];
  return bom.versions[0]?.items ?? [];
}

async function assertNotCorrupted(tx: Tx, loaded: Loaded, rootId: string) {
  const graph = buildManufacturingGraph(
    [...loaded.boms.values()].map((bom) => ({
      productId: bom.productId,
      productType: loaded.products.get(bom.productId)!.type,
      bomActive: bom.isActive,
      versionActive: bom.versions.length > 0,
      components: expandedItems(bom).map((item) => ({
        productId: item.componentProduct.id,
        type: item.componentProduct.type,
      })),
    })),
  );
  const cycle = findCycle(graph, [rootId]);
  if (!cycle) return;
  throw new ConflictException({
    statusCode: 409,
    code: 'BOM_GRAPH_CORRUPTED',
    message: 'La estructura de fabricación almacenada contiene un ciclo',
    path: await codePath(tx, cycle),
  });
}

type ComponentNode = {
  product: ProductRow;
  quantity: string;
  unit: ProductRow['unit'];
  type: ProductRow['type'];
  isManufactured: boolean;
  child: StructureNode | null;
};
export type StructureNode = {
  product: ProductRow;
  bom: {
    id: string;
    name: string;
    isActive: boolean;
    activeVersion: { id: string; version: number; outputQuantity: string } | null;
  } | null;
  route: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    operationCount: number;
    totalStandardMinutes: string;
    operations: Array<{
      id: string;
      sequence: number;
      name: string;
      description: string | null;
      standardMinutes: string;
    }>;
  } | null;
  routeStatus: 'ACTIVE' | 'INACTIVE' | 'MISSING';
  components: ComponentNode[];
  issues: Array<{ code: StructureIssueCode; message: string }>;
  readiness: 'READY' | 'INCOMPLETE';
};

// El grafo ya se verificó acíclico, así que la recursión termina; los nodos compartidos se
// memorizan para no reconstruir subárboles repetidos.
function buildNode(loaded: Loaded, productId: string, memo = new Map<string, StructureNode>()) {
  const cached = memo.get(productId);
  if (cached) return cached;
  const product = loaded.products.get(productId)!;
  const bom = loaded.boms.get(productId);
  const version = bom?.versions[0];
  const route = loaded.routes.get(productId);
  const issueCodes: StructureIssueCode[] = [];
  if (!product.isActive) issueCodes.push('PRODUCT_INACTIVE');
  if (!bom) issueCodes.push('MISSING_BOM');
  else {
    if (!bom.isActive) issueCodes.push('BOM_INACTIVE');
    if (!version) issueCodes.push('MISSING_ACTIVE_BOM_VERSION');
    else if (version.items.length === 0) issueCodes.push('EMPTY_BOM_VERSION');
  }
  if (!route) issueCodes.push('MISSING_ROUTE');
  else {
    if (!route.isActive) issueCodes.push('ROUTE_INACTIVE');
    if (route.operations.length === 0) issueCodes.push('NO_ROUTE_OPERATIONS');
  }
  const components = expandedItems(bom).map((item): ComponentNode => {
    const manufactured = isManufactured(item.componentProduct.type);
    return {
      product: item.componentProduct,
      quantity: item.quantity.toFixed(4),
      unit: item.componentProduct.unit,
      type: item.componentProduct.type,
      isManufactured: manufactured,
      child: manufactured ? buildNode(loaded, item.componentProduct.id, memo) : null,
    };
  });
  const node: StructureNode = {
    product,
    bom: bom
      ? {
          id: bom.id,
          name: bom.name,
          isActive: bom.isActive,
          activeVersion: version
            ? {
                id: version.id,
                version: version.version,
                outputQuantity: version.outputQuantity.toFixed(4),
              }
            : null,
        }
      : null,
    route: route
      ? {
          id: route.id,
          code: route.code,
          name: route.name,
          isActive: route.isActive,
          operationCount: route.operations.length,
          totalStandardMinutes: route.operations
            .reduce((sum, op) => sum.plus(op.standardMinutes), new Prisma.Decimal(0))
            .toFixed(2),
          operations: route.operations.map((op) => ({
            ...op,
            standardMinutes: op.standardMinutes.toFixed(2),
          })),
        }
      : null,
    routeStatus: !route ? 'MISSING' : route.isActive ? 'ACTIVE' : 'INACTIVE',
    components,
    issues: issueCodes.map((code) => ({ code, message: issueMessages[code] })),
    readiness:
      issueCodes.length === 0 && components.every((c) => c.child?.readiness !== 'INCOMPLETE')
        ? 'READY'
        : 'INCOMPLETE',
  };
  memo.set(productId, node);
  return node;
}

function depthOf(node: StructureNode): number {
  return node.components.reduce(
    (max, component) => Math.max(max, 1 + (component.child ? depthOf(component.child) : 0)),
    0,
  );
}
