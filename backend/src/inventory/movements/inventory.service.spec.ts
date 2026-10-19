import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { InventoryService, type MovementLine } from './inventory.service.js';

const orderId = '00000000-0000-4000-8000-000000000001';
const line: MovementLine = {
  productId: '00000000-0000-4000-8000-000000000002',
  warehouseId: '00000000-0000-4000-8000-000000000003',
  quantity: '1',
  type: 'PRODUCTION_OUTPUT',
  origin: { kind: 'PRODUCTION_ORDER', productionOrderId: orderId },
};

describe('Production inventory plan', () => {
  it.each([
    ['missing output', [{ ...line, type: 'PRODUCTION_CONSUMPTION' }]],
    ['duplicate output', [line, line]],
    [
      'different orders',
      [
        line,
        {
          ...line,
          type: 'PRODUCTION_CONSUMPTION',
          origin: {
            kind: 'PRODUCTION_ORDER',
            productionOrderId: '00000000-0000-4000-8000-000000000004',
          },
        },
      ],
    ],
  ] as Array<[string, MovementLine[]]>)(
    'rejects %s before writing inventory',
    async (_name, lines) => {
      const query = vi.fn();
      const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
      await expect(
        new InventoryService().applyMovements(tx, { performedByUserId: orderId, lines }),
      ).rejects.toThrow('una sola orden y exactamente un output');
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('rejects an existing output before any inventory write', async () => {
    const query = vi.fn();
    const tx = {
      $queryRaw: query,
      inventoryMovement: { findFirst: vi.fn().mockResolvedValue({ id: orderId }) },
    } as unknown as Prisma.TransactionClient;
    await expect(
      new InventoryService().applyMovements(tx, { performedByUserId: orderId, lines: [line] }),
    ).rejects.toThrow('ya tiene un output');
    expect(query).not.toHaveBeenCalled();
  });
});
