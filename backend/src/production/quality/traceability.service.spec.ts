import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { TraceabilityService } from './traceability.service.js';

const product = { id: 'product', code: 'P', name: 'Producto', unit: 'UNIT' };

function service(edges: Record<string, string[]>) {
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
      findMany: vi.fn((args: { where: { productionOrderId?: string; type?: string } }) => {
        if (args.where.type === 'SALE_DISPATCH') return Promise.resolve([]);
        const orderId = args.where.productionOrderId!;
        return Promise.resolve(
          (edges[orderId] ?? []).map((id, index) => ({
            id: `${orderId}-${index}`,
            lotId: id,
            product,
            quantity: { abs: () => ({ toFixed: () => '1.0000' }) },
          })),
        );
      }),
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
  it('loads outbound dispatches for every visited lot in one batch', async () => {
    const { trace, tx } = service({ root: ['child'], child: [] });
    const movements = tx.inventoryMovement.findMany;
    movements.mockImplementation(
      (args: { where: { productionOrderId?: string; type?: string } }) => {
        if (args.where.type === 'SALE_DISPATCH')
          return Promise.resolve([
            ...['root', 'child'].map((lotId, index) => ({
              id: `movement-${index + 1}`,
              lotId,
              quantity: { abs: () => ({ toFixed: () => '2.5000' }) },
              occurredAt: new Date('2026-10-28T12:00:00Z'),
              warehouse: { id: 'warehouse', code: 'ALM-1', name: 'Principal' },
              performedByUser: { id: 'user', fullName: 'Miguel' },
              saleDispatchItem: {
                saleDispatch: {
                  id: `dispatch-${index + 1}`,
                  number: `DES-2026-00000${index + 1}`,
                  dispatchedAt: new Date('2026-10-28T12:00:00Z'),
                  saleOrder: {
                    id: 'order',
                    number: 'OV-2026-000001',
                    customer: { id: 'customer', code: 'CLI-1', name: 'Cliente Uno' },
                  },
                },
              },
            })),
          ]);
        const orderId = args.where.productionOrderId!;
        return Promise.resolve(
          (orderId === 'root' ? ['child'] : []).map((id, index) => ({
            id: `${orderId}-${index}`,
            lotId: id,
            product,
            quantity: { abs: () => ({ toFixed: () => '1.0000' }) },
          })),
        );
      },
    );

    const result = await trace.get('root');
    expect(
      movements.mock.calls.filter(([args]) => args.where.type === 'SALE_DISPATCH'),
    ).toHaveLength(1);
    expect(result.lots.find((lot) => lot.id === 'root')?.outbound).toMatchObject([
      {
        id: 'movement-1',
        dispatchNumber: 'DES-2026-000001',
        quantity: '2.5000',
        saleOrder: {
          number: 'OV-2026-000001',
          customer: { code: 'CLI-1', name: 'Cliente Uno' },
        },
      },
    ]);
    expect(result.lots.find((lot) => lot.id === 'child')?.outbound).toMatchObject([
      {
        id: 'movement-2',
        dispatchNumber: 'DES-2026-000002',
        saleOrder: { id: 'order', number: 'OV-2026-000001' },
      },
    ]);
  });
});
