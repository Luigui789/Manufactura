import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { Prisma, type ProductType } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Llave del advisory lock que serializa los cambios estructurales del catálogo de fórmulas.
 *
 * Dos activaciones concurrentes (A → B y B → A) pueden ser válidas por separado y formar un ciclo
 * juntas. Los bloqueos de fila no lo impiden porque cada una toca una fórmula distinta. Con este
 * lock, la segunda transacción espera al commit de la primera y valida el grafo ya actualizado.
 * Solo lo toman createVersion, activateVersion y la reactivación de una fórmula; lecturas,
 * cálculos y órdenes de producción no lo usan.
 */
export const BOM_GRAPH_LOCK_KEY = 'ecosoap:bom-manufacturing-graph';

export type GraphComponent = { productId: string; type: ProductType };
export type GraphVersionRow = {
  productId: string;
  productType: ProductType;
  bomActive: boolean;
  versionActive: boolean;
  components: readonly GraphComponent[];
};
export type GraphCandidate = { productId: string; components: readonly GraphComponent[] };
/** Producto fabricado → componentes fabricados de su configuración vigente. */
export type ManufacturingGraph = Map<string, string[]>;

export function isManufactured(type: ProductType) {
  return type === 'INTERMEDIATE' || type === 'FINISHED_GOOD';
}

/**
 * Construye el grafo vigente: fórmula activa + versión activa. Materias primas y consumibles son
 * hojas y no se agregan como aristas. La versión candidata reemplaza a la activa de su producto
 * como si ya estuviese activa.
 */
export function buildManufacturingGraph(
  rows: readonly GraphVersionRow[],
  candidate?: GraphCandidate,
): ManufacturingGraph {
  const graph: ManufacturingGraph = new Map();
  for (const row of rows) {
    if (!row.bomActive || !row.versionActive || !isManufactured(row.productType)) continue;
    graph.set(row.productId, manufacturedIds(row.components));
  }
  if (candidate) graph.set(candidate.productId, manufacturedIds(candidate.components));
  return graph;
}

function manufacturedIds(components: readonly GraphComponent[]) {
  return [
    ...new Set(components.filter((c) => isManufactured(c.type)).map((c) => c.productId)),
  ].sort();
}

/**
 * DFS iterativo con conjunto de visitados y camino de ancestros. Un nodo compartido por dos ramas
 * (DAG) no es ciclo: solo lo es el nodo que reaparece en su propio camino actual. Devuelve el
 * camino cerrado (`[A, B, A]`) o `null`.
 */
export function findCycle(graph: ManufacturingGraph, roots: Iterable<string>): string[] | null {
  const visited = new Set<string>();
  const onPath = new Set<string>();
  const path: string[] = [];
  for (const root of roots) {
    const stack: Array<{ id: string; exit: boolean }> = [{ id: root, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        path.pop();
        onPath.delete(frame.id);
        visited.add(frame.id);
        continue;
      }
      if (onPath.has(frame.id)) return [...path.slice(path.indexOf(frame.id)), frame.id];
      if (visited.has(frame.id)) continue;
      path.push(frame.id);
      onPath.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      for (const child of [...(graph.get(frame.id) ?? [])].reverse())
        stack.push({ id: child, exit: false });
    }
  }
  return null;
}

@Injectable()
export class BomGraphService {
  private readonly logger = new Logger(BomGraphService.name);

  /** Primer paso obligatorio de toda mutación que pueda agregar aristas al grafo. */
  async lock(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BOM_GRAPH_LOCK_KEY}))`;
  }

  async loadActiveRows(tx: Tx): Promise<GraphVersionRow[]> {
    const versions = await tx.bomVersion.findMany({
      where: { isActive: true, bom: { isActive: true } },
      select: {
        isActive: true,
        bom: { select: { isActive: true, product: { select: { id: true, type: true } } } },
        items: { select: { componentProduct: { select: { id: true, type: true } } } },
      },
    });
    return versions.map((version) => ({
      productId: version.bom.product.id,
      productType: version.bom.product.type,
      bomActive: version.bom.isActive,
      versionActive: version.isActive,
      components: version.items.map((item) => ({
        productId: item.componentProduct.id,
        type: item.componentProduct.type,
      })),
    }));
  }

  /** Valida la configuración candidata contra el grafo vigente; debe llamarse con el lock tomado. */
  async assertAcyclic(tx: Tx, candidate: GraphCandidate) {
    const graph = buildManufacturingGraph(await this.loadActiveRows(tx), candidate);
    const cycle = findCycle(graph, [candidate.productId]);
    if (!cycle) return;
    const path = await codePath(tx, cycle);
    this.logger.warn(`BOM_CYCLE_DETECTED: ${path.join(' -> ')}`);
    throw new UnprocessableEntityException({
      statusCode: 422,
      code: 'BOM_CYCLE_DETECTED',
      message: 'La estructura de fabricación contiene un ciclo',
      path,
    });
  }
}

export async function codePath(tx: Pick<Tx, 'product'>, ids: readonly string[]) {
  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, code: true },
  });
  const codes = new Map(products.map((product) => [product.id, product.code]));
  return ids.map((id) => codes.get(id) ?? id);
}
