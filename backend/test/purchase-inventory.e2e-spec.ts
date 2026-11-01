import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StockQueryService } from '../src/inventory/stock/stock-query.service.js';
import { LotsService } from '../src/inventory/lots/lots.service.js';
import { MovementQueryService } from '../src/inventory/movements/movement-query.service.js';
import { serializeOrder } from '../src/purchases/purchase-orders/purchase-order-mapping.js';
import { createTestApp, createUser, login, type TestApp } from './support/auth-test-kit.js';
import { createInventoryProduct, createInventoryWarehouse } from './support/inventory-fixtures.js';

type Order = ReturnType<typeof serializeOrder>;
let kit: TestApp;
let cookie: string;
let actorId: string;
const orderData = (r: { body: unknown }) => (r.body as { data: Order }).data;
beforeAll(async () => {
  kit = await createTestApp();
  const actor = await createUser(kit, 'ADMIN');
  actorId = actor.id;
  cookie = await login(kit, actor);
});
afterAll(async () => {
  await kit?.close();
});

describe('Purchase receipts consumed by A-2', () => {
  it.each([
    [false, false],
    [true, false],
    [true, true],
  ])(
    'exposes receipt stock, movements and origins (tracked=%s, quality=%s)',
    async (tracked, quality) => {
      const product = await createInventoryProduct(kit.prisma);
      const warehouse = await createInventoryWarehouse(kit.prisma);
      const supplier = await kit.prisma.supplier.create({
        data: { code: 'A2-' + randomUUID(), name: 'Proveedor integración' },
      });
      const patch = (value: unknown) =>
        kit
          .http()
          .patch('/api/products/' + product.id)
          .set('Cookie', cookie)
          .send(value);
      await patch({ isLotTracked: false, requiresQualityInspection: true }).expect(422);
      await patch({ isLotTracked: tracked, requiresQualityInspection: quality }).expect(200);
      const post = (path: string, value: unknown) =>
        kit.http().post(path).set('Cookie', cookie).send(value);
      const base = '/api/purchase-orders';
      const draft = orderData(
        await post(base, {
          supplierId: supplier.id,
          items: [{ productId: product.id, quantity: '7.25', unitPrice: '2' }],
        }).expect(201),
      );
      const order = orderData(await post(base + '/' + draft.id + '/confirm', {}).expect(200));
      const received = orderData(
        await post(base + '/' + order.id + '/receive', {
          receivedAt: '2026-10-13T14:00:00-06:00',
          items: [
            {
              purchaseOrderItemId: order.items[0].id,
              warehouseId: warehouse.id,
              quantity: '7.25',
              ...(tracked ? { expiresAt: '2026-10-14' } : {}),
            },
          ],
        }).expect(201),
      );
      const receipt = received.receipts[0];
      const item = receipt.items[0];
      const read = (path: string) => kit.http().get(path).set('Cookie', cookie);
      const stockResponse = await read('/api/inventory/stock')
        .query({ productId: product.id, warehouseId: warehouse.id })
        .expect(200);
      expect((stockResponse.body as { data: unknown[] }).data).toHaveLength(1);
      expect((stockResponse.body as { data: unknown[] }).data).toMatchObject([
        {
          quantity: '7.2500',
          product: { id: product.id, isLotTracked: tracked },
        },
      ]);
      const stock = kit.app.get(StockQueryService);
      expect((await stock.getOnHandQuantity(product.id, warehouse.id)).toFixed(4)).toBe('7.2500');
      expect((await stock.getConsumableQuantity(product.id, warehouse.id)).toFixed(4)).toBe(
        quality ? '0.0000' : '7.2500',
      );
      const movementsResponse = await read('/api/inventory/movements')
        .query({ productId: product.id, type: 'PURCHASE_RECEIPT' })
        .expect(200);
      type MovementList = Awaited<ReturnType<MovementQueryService['list']>>;
      const movements = (movementsResponse.body as MovementList).data;
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: 'PURCHASE_RECEIPT',
        quantity: '7.2500',
        reason: null,
        purchaseReceiptItemId: item.id,
        product: { id: product.id },
        warehouse: { id: warehouse.id },
        performedByUser: { id: actorId },
        businessReference: {
          type: 'PURCHASE_RECEIPT',
          id: receipt.id,
          number: receipt.number,
          purchaseOrder: { id: order.id, number: order.number },
        },
      });
      if (tracked) {
        expect(movements[0].lot).toMatchObject({
          id: item.lot!.id,
          status: quality ? 'QUARANTINED' : 'RELEASED',
        });
        const expectedOrigin = {
          type: 'PURCHASE_RECEIPT',
          purchaseReceiptItemId: item.id,
          purchaseReceipt: {
            id: receipt.id,
            number: receipt.number,
            receivedAt: '2026-10-13T20:00:00.000Z',
          },
          purchaseOrder: { id: order.id, number: order.number },
          supplier: { id: supplier.id, code: supplier.code, name: supplier.name },
        };
        const list = await read('/api/inventory/lots')
          .query({ productId: product.id, warehouseId: warehouse.id, hasStock: true })
          .expect(200);
        type LotList = Awaited<ReturnType<LotsService['list']>>;
        expect((list.body as LotList).data).toHaveLength(1);
        expect((list.body as LotList).data).toMatchObject([
          {
            id: item.lot!.id,
            origin: expectedOrigin,
            quantityOnHand: '7.2500',
            expiresAt: '2026-10-14',
            originatedAt: '2026-10-13T20:00:00.000Z',
            product: { id: product.id },
          },
        ]);
        const detail = await read('/api/inventory/lots/' + item.lot!.id).expect(200);
        expect(detail.body).toMatchObject({
          origin: expectedOrigin,
          expiresAt: '2026-10-14',
          balances: [{ warehouse: { id: warehouse.id }, quantity: '7.2500' }],
          movements: [
            { purchaseReceiptItemId: item.id, businessReference: { number: receipt.number } },
          ],
        });
        if (quality) {
          // Rejected lots are still physical inventory, never consumable.
          await kit.prisma.lot.update({
            where: { id: item.lot!.id },
            data: { status: 'REJECTED' },
          });
          expect((await stock.getOnHandQuantity(product.id, warehouse.id)).toFixed(4)).toBe(
            '7.2500',
          );
          expect((await stock.getConsumableQuantity(product.id, warehouse.id)).toFixed(4)).toBe(
            '0.0000',
          );
        }
      } else expect(movements[0].lot).toBeNull();
      await patch({ isLotTracked: !tracked, requiresQualityInspection: false }).expect(409);
      await patch({ unit: 'LITER' }).expect(409);
      await patch({ type: 'CONSUMABLE' }).expect(409);
      await post('/api/inventory/adjustments', {
        productId: product.id,
        warehouseId: warehouse.id,
        type: 'PURCHASE_RECEIPT',
        quantity: '1',
        reason: 'CORRECTION',
      }).expect(400);
      await post('/api/inventory/adjustments', {
        productId: product.id,
        warehouseId: warehouse.id,
        ...(tracked ? { lotId: item.lot!.id } : {}),
        type: 'ADJUSTMENT_OUT',
        quantity: '7.25',
        reason: 'CORRECTION',
      }).expect(201);
      expect((await stock.getOnHandQuantity(product.id, warehouse.id)).toFixed(4)).toBe('0.0000');
      await patch({ isLotTracked: !tracked, requiresQualityInspection: false }).expect(409);
      const adjustments = await read('/api/inventory/movements')
        .query({ productId: product.id, type: 'ADJUSTMENT_OUT' })
        .expect(200);
      expect((adjustments.body as MovementList).data[0]).toMatchObject({
        businessReference: null,
        purchaseReceiptItemId: null,
      });
    },
  );
});
