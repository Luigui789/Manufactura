import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProductType } from '../../generated/prisma/client.js';
import {
  BomGraphService,
  buildManufacturingGraph,
  findCycle,
  type GraphVersionRow,
} from './bom-graph.service.js';

const INT: ProductType = 'INTERMEDIATE';
const FIN: ProductType = 'FINISHED_GOOD';
const RAW: ProductType = 'RAW_MATERIAL';
const types: Record<string, ProductType> = {
  A: FIN,
  B: INT,
  C: INT,
  D: INT,
  RAW: RAW,
  CONS: 'CONSUMABLE',
};
function row(productId: string, components: string[], flags: Partial<GraphVersionRow> = {}) {
  return {
    productId,
    productType: types[productId],
    bomActive: true,
    versionActive: true,
    components: components.map((id) => ({ productId: id, type: types[id] })),
    ...flags,
  } satisfies GraphVersionRow;
}
const cycleOf = (rows: GraphVersionRow[], root = 'A') =>
  findCycle(buildManufacturingGraph(rows), [root]);

describe('buildManufacturingGraph y findCycle', () => {
  it('árbol simple: materias primas y consumibles son hojas', () => {
    const graph = buildManufacturingGraph([row('A', ['RAW', 'CONS'])]);
    expect(graph.get('A')).toEqual([]);
    expect(findCycle(graph, ['A'])).toBeNull();
  });

  it('dos niveles: terminado → intermedio → materia prima', () => {
    const graph = buildManufacturingGraph([row('A', ['B', 'RAW']), row('B', ['RAW'])]);
    expect(graph.get('A')).toEqual(['B']);
    expect(findCycle(graph, ['A'])).toBeNull();
  });

  it('tres niveles sin ciclo', () => {
    expect(cycleOf([row('A', ['B']), row('B', ['C']), row('C', ['RAW'])])).toBeNull();
  });

  it('DAG con dependencia compartida no es ciclo', () => {
    expect(
      cycleOf([row('A', ['B', 'C']), row('B', ['D']), row('C', ['D']), row('D', ['RAW'])]),
    ).toBeNull();
  });

  it('autorreferencia', () => {
    expect(cycleOf([row('B', ['B'])], 'B')).toEqual(['B', 'B']);
  });

  it('ciclo de dos nodos con camino', () => {
    expect(cycleOf([row('B', ['C']), row('C', ['B'])], 'B')).toEqual(['B', 'C', 'B']);
  });

  it('ciclo de tres nodos con camino cerrado', () => {
    expect(cycleOf([row('A', ['B']), row('B', ['C']), row('C', ['D']), row('D', ['B'])])).toEqual([
      'B',
      'C',
      'D',
      'B',
    ]);
  });

  it('ignora fórmulas inactivas', () => {
    expect(cycleOf([row('B', ['C']), row('C', ['B'], { bomActive: false })], 'B')).toBeNull();
  });

  it('ignora versiones inactivas', () => {
    expect(cycleOf([row('B', ['C']), row('C', ['B'], { versionActive: false })], 'B')).toBeNull();
  });

  it('la versión candidata reemplaza a la versión activa de su producto', () => {
    const rows = [row('B', ['RAW']), row('C', ['B'])];
    expect(findCycle(buildManufacturingGraph(rows), ['B'])).toBeNull();
    const candidate = { productId: 'B', components: [{ productId: 'C', type: INT }] };
    const graph = buildManufacturingGraph(rows, candidate);
    expect(graph.get('B')).toEqual(['C']);
    expect(findCycle(graph, ['B'])).toEqual(['B', 'C', 'B']);
  });

  it('la candidata sin intermedios elimina un ciclo previo del producto', () => {
    const candidate = { productId: 'B', components: [{ productId: 'RAW', type: RAW }] };
    const graph = buildManufacturingGraph([row('B', ['C']), row('C', ['B'])], candidate);
    expect(findCycle(graph, ['B', 'C'])).toBeNull();
  });

  it('una cadena profunda no desborda la pila', () => {
    const graph = new Map<string, string[]>();
    for (let i = 0; i < 20000; i++) graph.set('N' + i, ['N' + (i + 1)]);
    expect(findCycle(graph, ['N0'])).toBeNull();
    graph.set('N20000', ['N0']);
    expect(findCycle(graph, ['N0'])).toHaveLength(20002);
  });
});

describe('BomGraphService.assertAcyclic', () => {
  it('rechaza con 422 BOM_CYCLE_DETECTED y devuelve el camino por códigos', async () => {
    const tx = {
      bomVersion: {
        findMany: vi.fn().mockResolvedValue([
          {
            isActive: true,
            bom: { isActive: true, product: { id: 'b', type: INT } },
            items: [{ componentProduct: { id: 'a', type: INT } }],
          },
        ]),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', code: 'PRODUCT-A' },
          { id: 'b', code: 'PRODUCT-B' },
        ]),
      },
    };
    const service = new BomGraphService();
    const error = await service
      .assertAcyclic(tx as never, { productId: 'a', components: [{ productId: 'b', type: INT }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      statusCode: 422,
      code: 'BOM_CYCLE_DETECTED',
      message: 'La estructura de fabricación contiene un ciclo',
      path: ['PRODUCT-A', 'PRODUCT-B', 'PRODUCT-A'],
    });
  });

  it('acepta una configuración acíclica sin consultar códigos', async () => {
    const tx = {
      bomVersion: { findMany: vi.fn().mockResolvedValue([]) },
      product: { findMany: vi.fn() },
    };
    await new BomGraphService().assertAcyclic(tx as never, {
      productId: 'a',
      components: [{ productId: 'b', type: INT }],
    });
    expect(tx.product.findMany).not.toHaveBeenCalled();
  });
});
