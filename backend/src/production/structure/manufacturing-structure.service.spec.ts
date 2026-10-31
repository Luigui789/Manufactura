import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ManufacturingStructureService } from './manufacturing-structure.service.js';

type P = { id: string; code: string; name: string; type: string; unit: string; isActive: boolean };
const p = (id: string, type: string, isActive = true): P => ({
  id,
  code: id.toUpperCase(),
  name: 'Producto ' + id,
  type,
  unit: 'GRAM',
  isActive,
});
const products: Record<string, P> = {
  a: p('a', 'FINISHED_GOOD'),
  b: p('b', 'INTERMEDIATE'),
  raw: p('raw', 'RAW_MATERIAL'),
  cons: p('cons', 'CONSUMABLE'),
};
const dec = (value: string) => new Prisma.Decimal(value);
function bom(productId: string, components: string[], flags: { isActive?: boolean } = {}) {
  return {
    id: 'bom-' + productId,
    productId,
    name: 'BOM ' + productId,
    isActive: flags.isActive ?? true,
    versions: [
      {
        id: 'v-' + productId,
        version: 1,
        outputQuantity: dec('1'),
        items: components.map((id) => ({ quantity: dec('2.5'), componentProduct: products[id] })),
      },
    ],
  };
}
function route(productId: string, operations = [{ sequence: 10, minutes: '15' }], isActive = true) {
  return {
    id: 'route-' + productId,
    productId,
    code: 'RT-' + productId,
    name: 'Ruta ' + productId,
    isActive,
    operations: operations.map((op, index) => ({
      id: 'op-' + productId + index,
      sequence: op.sequence,
      name: 'Operación ' + op.sequence,
      description: null,
      standardMinutes: dec(op.minutes),
    })),
  };
}
function service(boms: ReturnType<typeof bom>[], routes: ReturnType<typeof route>[]) {
  const byIds =
    <T extends { productId: string }>(rows: T[]) =>
    ({ where }: { where: { productId: { in: string[] } } }) =>
      Promise.resolve(rows.filter((row) => where.productId.in.includes(row.productId)));
  const tx = {
    product: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(products[where.id] ?? null),
      ),
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => products[id])),
      ),
    },
    billOfMaterial: { findMany: vi.fn(byIds(boms)) },
    productionRoute: { findMany: vi.fn(byIds(routes)) },
  };
  const prisma = { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) };
  return { structure: new ManufacturingStructureService(prisma as unknown as PrismaService), tx };
}

describe('ManufacturingStructureService', () => {
  it('404 si el producto raíz no existe', async () => {
    await expect(service([], []).structure.get('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('422 INVALID_MANUFACTURING_STRUCTURE_ROOT para materia prima o consumible', async () => {
    for (const id of ['raw', 'cons']) {
      const error = await service([], [])
        .structure.get(id)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'INVALID_MANUFACTURING_STRUCTURE_ROOT',
      });
    }
  });

  it('construye dos niveles READY con hojas, decimales como string y tiempo total', async () => {
    const { structure, tx } = service(
      [bom('a', ['b', 'raw']), bom('b', ['raw', 'cons'])],
      [
        route('a', [
          { sequence: 10, minutes: '15' },
          { sequence: 30, minutes: '21600' },
        ]),
        route('b'),
      ],
    );
    const result = await structure.get('a');
    expect(result).toMatchObject({
      readiness: 'READY',
      maxDepth: 2,
      issues: [],
      routeStatus: 'ACTIVE',
      bom: { activeVersion: { version: 1, outputQuantity: '1.0000' } },
      route: { operationCount: 2, totalStandardMinutes: '21615.00' },
    });
    expect(result.route!.operations.map((op) => op.standardMinutes)).toEqual(['15.00', '21600.00']);
    const [intermediate, raw] = result.components;
    expect(intermediate).toMatchObject({ quantity: '2.5000', isManufactured: true });
    expect(intermediate.child!.components.map((c) => [c.type, c.child])).toEqual([
      ['RAW_MATERIAL', null],
      ['CONSUMABLE', null],
    ]);
    expect(raw).toMatchObject({ type: 'RAW_MATERIAL', isManufactured: false, child: null });
    // Una consulta de fórmulas por nivel, no por nodo.
    expect(tx.billOfMaterial.findMany).toHaveBeenCalledTimes(2);
  });

  it('reporta issues sin bloquear y marca INCOMPLETE hacia arriba', async () => {
    const { structure } = service(
      [bom('a', ['b'])],
      [route('a', [{ sequence: 10, minutes: '5' }], false)],
    );
    const result = await structure.get('a');
    expect(result.readiness).toBe('INCOMPLETE');
    expect(result.issues.map((issue) => issue.code)).toEqual(['ROUTE_INACTIVE']);
    expect(result.routeStatus).toBe('INACTIVE');
    expect(result.components[0].child).toMatchObject({
      readiness: 'INCOMPLETE',
      bom: null,
      route: null,
      routeStatus: 'MISSING',
      issues: [
        { code: 'MISSING_BOM', message: 'El producto no tiene fórmula de producción' },
        { code: 'MISSING_ROUTE', message: 'El producto no tiene ruta de producción' },
      ],
    });
  });

  it('una fórmula inactiva no expande componentes y reporta BOM_INACTIVE', async () => {
    const { structure } = service([bom('a', ['b'], { isActive: false })], [route('a', [])]);
    const result = await structure.get('a');
    expect(result.components).toEqual([]);
    expect(result.maxDepth).toBe(0);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'BOM_INACTIVE',
      'NO_ROUTE_OPERATIONS',
    ]);
  });

  it('sin versión activa reporta MISSING_ACTIVE_BOM_VERSION', async () => {
    const { structure } = service([{ ...bom('a', []), versions: [] }], [route('a')]);
    const result = await structure.get('a');
    expect(result.bom!.activeVersion).toBeNull();
    expect(result.issues.map((issue) => issue.code)).toEqual(['MISSING_ACTIVE_BOM_VERSION']);
  });

  it('409 BOM_GRAPH_CORRUPTED ante un ciclo almacenado, sin recursión infinita', async () => {
    const { structure } = service([bom('a', ['b']), bom('b', ['a'])], []);
    const error = await structure.get('a').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      statusCode: 409,
      code: 'BOM_GRAPH_CORRUPTED',
      message: 'La estructura de fabricación almacenada contiene un ciclo',
      path: ['A', 'B', 'A'],
    });
  });
});
