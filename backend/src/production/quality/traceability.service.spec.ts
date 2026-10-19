import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { TraceabilityService } from './traceability.service.js';

function service(edges: Record<string, string[]>) {
  const product = { id: 'product', code: 'P', name: 'Producto', unit: 'UNIT' };
  const tx = {
    lot: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          code: where.id,
          status: 'RELEASED',
          product,
          purchaseReceiptItemId: null,
          purchaseReceiptItem: null,
          productionOrderId: where.id,
          productionOrder: {
            id: where.id,
            number: where.id,
            bomVersion: { id: 'version', version: 1 },
          },
        }),
      ),
    },
    inventoryMovement: {
      findMany: vi.fn(({ where }: { where: { productionOrderId: string } }) =>
        Promise.resolve(
          (edges[where.productionOrderId] ?? []).map((id, index) => ({
            id: `${where.productionOrderId}-${index}`,
            lotId: id,
            product,
            quantity: { abs: () => ({ toFixed: () => '1.0000' }) },
          })),
        ),
      ),
    },
  };
  const prisma = {
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  } as unknown as PrismaService;
  return { trace: new TraceabilityService(prisma), tx };
}
describe('Iterative lot traceability', () => {
  it('handles a long valid chain without a depth cutoff', async () => {
    const edges: Record<string, string[]> = {};
    for (let index = 0; index < 250; index++)
      edges[String(index)] = index < 249 ? [String(index + 1)] : [];
    expect((await service(edges).trace.get('0')).lots).toHaveLength(250);
  });
  it('resolves a shared ancestor once without falsely reporting a cycle', async () => {
    const { trace, tx } = service({
      root: ['left', 'right'],
      left: ['ancestor'],
      right: ['ancestor'],
    });
    expect((await trace.get('root')).lots.map((lot) => lot.id).sort()).toEqual([
      'ancestor',
      'left',
      'right',
      'root',
    ]);
    expect(tx.lot.findUnique).toHaveBeenCalledTimes(4);
  });
  it('fails explicitly on corrupted cycles', async () => {
    await expect(service({ root: ['child'], child: ['root'] }).trace.get('root')).rejects.toThrow(
      'Cycle detected',
    );
  });
});
