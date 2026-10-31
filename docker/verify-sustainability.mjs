import assert from 'node:assert/strict';

/**
 * C3 acceptance against the real Docker stack. Every factor here is a TEST_*
 * fixture with source TEST_FIXTURE: they are not real environmental data.
 *
 *   MP:          10 kg × 2.00000000 kg CO₂e/kg  = 20.00000000
 *   Electricity:  5 kWh × 0.50000000 kg CO₂e/kWh =  2.50000000
 *   Total = 22.50000000 kg CO₂e; 100 UNIT → 0.22500000 kg CO₂e/UNIT
 */
export async function verifySustainability(api, Cookie, origin, request, suffix, warehouse) {
  const tag = suffix.toUpperCase().replaceAll('-', '');
  const raw = await request('/products', 'POST', {
    code: 'DOCKER-C3-MP-' + tag,
    name: 'Docker C3 raw material',
    category: 'Validation',
    type: 'RAW_MATERIAL',
    unit: 'KILOGRAM',
  });
  await request('/inventory/adjustments', 'POST', {
    productId: raw.id,
    warehouseId: warehouse.id,
    type: 'ADJUSTMENT_IN',
    quantity: '10',
    reason: 'INITIAL_LOAD',
  });
  const output = await request('/products', 'POST', {
    code: 'DOCKER-C3-PT-' + tag,
    name: 'Docker C3 soap',
    category: 'Validation',
    type: 'FINISHED_GOOD',
    unit: 'UNIT',
    isLotTracked: true,
  });
  const bom = await request('/production/boms', 'POST', {
    productId: output.id,
    name: 'Docker C3 BOM',
  });
  const version = await request(`/production/boms/${bom.id}/versions`, 'POST', {
    outputQuantity: '1',
    items: [{ productId: raw.id, quantity: '0.1' }],
  });
  const op = await request('/production/orders', 'POST', {
    productId: output.id,
    bomVersionId: version.id,
    warehouseId: warehouse.id,
    quantityPlanned: '100',
  });
  await request(`/production/orders/${op.id}/start`, 'POST', {});
  // Completing the order needs no emission factor: Production stays decoupled.
  const completed = await request(`/production/orders/${op.id}/complete`, 'POST', {
    quantityProduced: '100',
    allocations: [],
  });
  assert.equal(completed.status, 'COMPLETED');
  const footprintUrl = `/sustainability/production-orders/${op.id}/footprint`;
  assert.equal(await request(footprintUrl), null, 'GET must never create a footprint');

  const source = { sourceName: 'TEST_FIXTURE', sourceReference: 'TEST_FIXTURE' };
  const rawFactor = await request('/sustainability/emission-factors', 'POST', {
    code: 'TEST_DOCKER_MP_' + tag,
    name: 'TEST MP factor (not real data)',
    category: 'RAW_MATERIAL',
    activityUnit: 'KILOGRAM',
    kgCo2ePerUnit: '2.00000000',
    productId: raw.id,
    ...source,
  });
  const electricity = await request('/sustainability/emission-factors', 'POST', {
    code: 'TEST_DOCKER_ELECTRICITY_' + tag,
    name: 'TEST electricity factor (not real data)',
    category: 'ENERGY',
    activityUnit: 'KWH',
    kgCo2ePerUnit: '0.50000000',
    ...source,
  });
  const draft = await request(footprintUrl, 'POST');
  assert.equal(draft.status, 'DRAFT');
  assert.deepEqual(draft.missingFactors, []);
  assert.equal(draft.activities.length, 1);
  assert.equal(draft.activities[0].source, 'PRODUCTION_CONSUMPTION');
  assert.equal(draft.activities[0].originalQuantity, '10.0000');
  assert.equal(draft.activities[0].emissionsKgCo2e, '20.00000000');
  const withEnergy = await request(`${footprintUrl}/activities`, 'POST', {
    emissionFactorId: electricity.id,
    description: 'TEST electricidad del proceso',
    quantity: '5',
  });
  assert.equal(withEnergy.totalKgCo2ePreview, '22.50000000');
  const finalized = await request(`${footprintUrl}/finalize`, 'POST', {
    boundaryNotes:
      'Docker C3 TEST: incluye MP consumida y electricidad manual; excluye distribución, uso y fin de vida.',
  });
  assert.equal(finalized.status, 'FINALIZED');
  assert.equal(finalized.totalKgCo2e, '22.50000000');
  assert.equal(finalized.kgCo2ePerOutputUnit, '0.22500000');
  assert.deepEqual(finalized.totalsByCategory, {
    RAW_MATERIAL: '20.00000000',
    ENERGY: '2.50000000',
    INBOUND_TRANSPORT: '0.00000000',
    PACKAGING: '0.00000000',
    WASTE: '0.00000000',
  });
  // A later factor change never rewrites a finalized footprint.
  await request(`/sustainability/emission-factors/${rawFactor.id}`, 'PATCH', {
    kgCo2ePerUnit: '9.00000000',
  });
  const after = await request(footprintUrl);
  assert.equal(after.totalKgCo2e, '22.50000000');
  assert.equal(
    after.activities.find((a) => a.source === 'PRODUCTION_CONSUMPTION').factorValueSnapshot,
    '2.00000000',
  );
  const frozen = await fetch(`${api}${footprintUrl}/sync`, {
    method: 'POST',
    headers: { Cookie, Origin: origin },
  });
  assert.equal(frozen.status, 409);
  assert.equal((await fetch(`${api}${footprintUrl}`)).status, 401);
  console.log(
    'Docker C3: OP completed without factors; TEST_FIXTURE footprint 20 + 2.5 = 22.50000000 kg CO2e, 0.22500000 kg CO2e/UNIT, finalized and immutable.',
  );
}
