import { randomUUID } from 'node:crypto';
import { Prisma, type UnitOfMeasure } from '../../src/generated/prisma/client.js';
import type { TestApp } from './auth-test-kit.js';

export type Component = {
  unit: UnitOfMeasure;
  /** Cantidad de la BOM por unidad producida (outputQuantity = 1). */
  perUnit: string;
  /** Si es trazable, el stock se recibe por compra en dos lotes y la OP consume ambos. */
  lotTracked?: boolean;
  name?: string;
};

export const tag = () => randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
export const body = <T>(response: { body: unknown }) => (response.body as { data: T }).data;

/** Orden real: BOM → OP → start → complete por la API de Producción (ledger real). */
export async function completedOrder(
  kit: TestApp,
  cookie: string,
  actorId: string,
  options: {
    components: Component[];
    planned?: string;
    produced?: string;
    requiresInspection?: boolean;
    complete?: boolean;
  },
) {
  const post = (url: string) => kit.http().post(url).set('Cookie', cookie);
  const planned = options.planned ?? '200';
  const warehouse = await kit.prisma.warehouse.create({
    data: { code: 'C3-' + tag(), name: 'Almacén C3', location: 'Pruebas C3' },
  });
  const components = [];
  for (const [index, spec] of options.components.entries()) {
    const product = await kit.prisma.product.create({
      data: {
        code: 'C3-MP-' + tag(),
        name: spec.name ?? `Componente C3 ${index + 1}`,
        category: 'C3',
        type: 'RAW_MATERIAL',
        unit: spec.unit,
        isLotTracked: spec.lotTracked ?? false,
      },
    });
    const required = new Prisma.Decimal(spec.perUnit).times(planned).toFixed(4);
    const lotIds: string[] = [];
    if (spec.lotTracked) {
      const supplier = await kit.prisma.supplier.create({
        data: { code: 'C3-' + tag(), name: 'Proveedor C3' },
      });
      const purchase = body<{ id: string; items: { id: string }[] }>(
        await post('/api/purchase-orders')
          .send({
            supplierId: supplier.id,
            items: [{ productId: product.id, quantity: required, unitPrice: '1' }],
          })
          .expect(201),
      );
      await post(`/api/purchase-orders/${purchase.id}/confirm`).send({}).expect(200);
      const half = new Prisma.Decimal(required).div(2).toFixed(4);
      for (const quantity of [half, new Prisma.Decimal(required).minus(half).toFixed(4)])
        await post(`/api/purchase-orders/${purchase.id}/receive`)
          .send({
            items: [
              { purchaseOrderItemId: purchase.items[0].id, warehouseId: warehouse.id, quantity },
            ],
          })
          .expect(201);
      lotIds.push(
        ...(
          await kit.prisma.lot.findMany({
            where: { productId: product.id },
            orderBy: { id: 'asc' },
          })
        ).map((lot) => lot.id),
      );
    } else
      await post('/api/inventory/adjustments')
        .send({
          productId: product.id,
          warehouseId: warehouse.id,
          type: 'ADJUSTMENT_IN',
          quantity: required,
          reason: 'INITIAL_LOAD',
        })
        .expect(201);
    components.push({ product, required, lotIds, spec });
  }
  const output = await kit.prisma.product.create({
    data: {
      code: 'C3-PT-' + tag(),
      name: 'Jabón ecológico C3',
      category: 'C3',
      type: 'FINISHED_GOOD',
      unit: 'UNIT',
      isLotTracked: true,
      requiresQualityInspection: options.requiresInspection ?? false,
    },
  });
  const bom = await kit.prisma.billOfMaterial.create({
    data: {
      productId: output.id,
      name: 'Fórmula C3',
      versions: {
        create: {
          version: 1,
          outputQuantity: '1',
          isActive: true,
          createdByUserId: actorId,
          items: {
            create: components.map((c) => ({
              componentProductId: c.product.id,
              quantity: c.spec.perUnit,
            })),
          },
        },
      },
    },
    include: { versions: true },
  });
  const order = body<{ id: string; number: string }>(
    await post('/api/production/orders')
      .send({
        productId: output.id,
        bomVersionId: bom.versions[0].id,
        warehouseId: warehouse.id,
        quantityPlanned: planned,
      })
      .expect(201),
  );
  await post(`/api/production/orders/${order.id}/start`).send({}).expect(200);
  let lotId = '';
  if (options.complete !== false) {
    const completed = body<{ lot: { id: string } }>(
      await post(`/api/production/orders/${order.id}/complete`)
        .send({
          quantityProduced: options.produced ?? planned,
          allocations: components
            .filter((c) => c.spec.lotTracked)
            .map((c) => {
              const half = new Prisma.Decimal(c.required).div(2).toFixed(4);
              return {
                productId: c.product.id,
                lots: [
                  { lotId: c.lotIds[0], quantity: half },
                  {
                    lotId: c.lotIds[1],
                    quantity: new Prisma.Decimal(c.required).minus(half).toFixed(4),
                  },
                ],
              };
            }),
        })
        .expect(200),
    );
    lotId = completed.lot.id;
  }
  return { order, output, warehouse, components, lotId, bomVersionId: bom.versions[0].id };
}
