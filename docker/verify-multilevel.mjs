import assert from 'node:assert/strict';

/**
 * C4 acceptance against the real Docker stack: staged multilevel manufacturing.
 *
 *   RAW (adjustment) → OP INTERMEDIATE → released intermediate lot
 *   → OP FINAL consuming that lot explicitly → quarantined final lot
 *
 * Each level is an explicit production order; the final OP never consumes the raw material of
 * the intermediate (no automatic BOM explosion).
 */
export async function verifyMultilevel(request, suffix, warehouse, Client) {
  const tag = suffix.toUpperCase().replaceAll('-', '');
  const product = (code, name, type, unit, flags = {}) =>
    request('/products', 'POST', {
      code: `DOCKER-C4-${code}-${tag}`,
      name,
      category: 'Validation',
      type,
      unit,
      ...flags,
    });
  const raw = await product('RAW-OIL', 'Docker C4 used oil', 'RAW_MATERIAL', 'MILLILITER');
  const soda = await product('NAOH', 'Docker C4 soda', 'RAW_MATERIAL', 'GRAM');
  const intermediate = await product(
    'INT-OIL',
    'Docker C4 filtered oil',
    'INTERMEDIATE',
    'MILLILITER',
    {
      isLotTracked: true,
    },
  );
  const final = await product('PT-SOAP', 'Docker C4 soap', 'FINISHED_GOOD', 'UNIT', {
    isLotTracked: true,
    requiresQualityInspection: true,
  });
  for (const [item, quantity] of [
    [raw, '1000'],
    [soda, '70'],
  ])
    await request('/inventory/adjustments', 'POST', {
      productId: item.id,
      warehouseId: warehouse.id,
      type: 'ADJUSTMENT_IN',
      quantity,
      reason: 'INITIAL_LOAD',
    });
  async function formula(output, outputQuantity, items) {
    const bom = await request('/production/boms', 'POST', {
      productId: output.id,
      name: 'Docker C4 BOM ' + output.code,
    });
    return request(`/production/boms/${bom.id}/versions`, 'POST', {
      outputQuantity,
      items: items.map(([item, quantity]) => ({ productId: item.id, quantity })),
    });
  }
  const intermediateVersion = await formula(intermediate, '1000', [[raw, '1000']]);
  const finalVersion = await formula(final, '1', [
    [intermediate, '500'],
    [soda, '70'],
  ]);
  for (const [output, operations] of [
    [intermediate, [{ sequence: 10, name: 'Filtración', standardMinutes: '30' }]],
    [
      final,
      [
        { sequence: 10, name: 'Mezclado', standardMinutes: '15' },
        { sequence: 30, name: 'Curado', standardMinutes: '21600' },
      ],
    ],
  ])
    await request('/production/routes', 'POST', {
      productId: output.id,
      code: 'RT-C4-' + output.code.slice(-24),
      name: 'Docker C4 route ' + output.code,
      operations,
    });

  const structure = await request('/production/manufacturing-structure/' + final.id);
  assert.equal(structure.readiness, 'READY');
  assert.equal(structure.maxDepth, 2);
  const child = structure.components.find((c) => c.product.id === intermediate.id).child;
  assert.equal(child.components[0].product.id, raw.id);
  assert.equal(child.components[0].child, null);

  const createOrder = (output, version, planned) =>
    request('/production/orders', 'POST', {
      productId: output.id,
      bomVersionId: version.id,
      warehouseId: warehouse.id,
      quantityPlanned: planned,
    });
  async function run(order, planned, allocations) {
    await request(`/production/orders/${order.id}/start`, 'POST', {});
    return request(`/production/orders/${order.id}/complete`, 'POST', {
      quantityProduced: planned,
      allocations,
    });
  }
  const intermediateOrder = await run(
    await createOrder(intermediate, intermediateVersion, '1000'),
    '1000',
    [],
  );
  assert.equal(intermediateOrder.lot.status, 'RELEASED');

  const pendingFinal = await createOrder(final, finalVersion, '1');
  const requirements = await request(`/production/orders/${pendingFinal.id}/requirements`);
  assert.deepEqual(
    requirements.items.map((item) => item.product.id).sort(),
    [intermediate.id, soda.id].sort(),
  );
  const finalOrder = await run(pendingFinal, '1', [
    { productId: intermediate.id, lots: [{ lotId: intermediateOrder.lot.id, quantity: '500' }] },
  ]);
  assert.equal(finalOrder.lot.status, 'QUARANTINED');

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const consumption = (
      await db.query(
        `SELECT product_id, lot_id, quantity::text FROM inventory_movements
          WHERE production_order_id=$1 AND type='PRODUCTION_CONSUMPTION' ORDER BY product_id`,
        [finalOrder.id],
      )
    ).rows;
    assert.deepEqual(
      consumption.map((row) => [row.product_id, row.lot_id, row.quantity]).sort(),
      [
        [intermediate.id, intermediateOrder.lot.id, '-500.0000'],
        [soda.id, null, '-70.0000'],
      ].sort(),
    );
    const rawConsumption = (
      await db.query(
        `SELECT production_order_id, quantity::text FROM inventory_movements
          WHERE product_id=$1 AND type='PRODUCTION_CONSUMPTION'`,
        [raw.id],
      )
    ).rows;
    assert.deepEqual(rawConsumption, [
      { production_order_id: intermediateOrder.id, quantity: '-1000.0000' },
    ]);
    const balance = (
      await db.query(
        'SELECT sum(quantity)::text AS balance FROM inventory_movements WHERE lot_id=$1',
        [intermediateOrder.lot.id],
      )
    ).rows[0].balance;
    assert.equal(balance, '500.0000');
  } finally {
    await db.end();
  }
  console.log(
    'Docker C4: RAW → OP INTERMEDIATE → released lot → OP FINAL consumed -500.0000 of that lot → QUARANTINED final lot; structure READY depth 2, no raw consumption in final OP.',
  );
}
