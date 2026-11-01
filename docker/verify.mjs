import assert from 'node:assert/strict';
import { get } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifySimulator } from './verify-simulator.mjs';
import { qualityEvidence, verifyMonitoring } from './verify-monitoring.mjs';
import { verifySimulation } from './verify-simulation.mjs';
import { verifySustainability } from './verify-sustainability.mjs';
import { verifyMultilevel } from './verify-multilevel.mjs';

// Solo contra el stack efimero de verificacion; usa el ADMIN creado por la CI.
assert.ok(process.env.POSTGRES_DB?.endsWith('_test'), 'Se requiere una base _test');
assert.ok(process.env.ADMIN_PASSWORD, 'Se requiere ADMIN_PASSWORD');

const api = 'http://backend:3000/api';
const origin = process.env.FRONTEND_URL;
const health = await fetch(`${api}/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).data.database, 'up');

// La conexion usa DNS interno; Host reproduce el acceso del navegador por localhost.
// Vite sigue rechazando hosts arbitrarios. node:http permite enviar este Host.
const page = await new Promise((resolve, reject) => {
  const request = get(
    'http://frontend:5173',
    { headers: { Host: 'localhost:5173' } },
    (response) => {
      let html = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (html += chunk));
      response.on('end', () => resolve({ status: response.statusCode, html }));
      response.on('error', reject);
    },
  );
  request.on('error', reject);
  request.setTimeout(10000, () => request.destroy(new Error('Frontend no responde')));
});
assert.equal(page.status, 200);
assert.match(page.html, /@vite\/client/);

const preflight = await fetch(`${api}/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});
assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

const login = await fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
});
assert.ok(login.ok, `Login fallo con HTTP ${login.status}`);
const cookieHeader = login.headers.getSetCookie().find((value) => value.includes('HttpOnly'));
assert.ok(cookieHeader, 'Falta la cookie HttpOnly');
assert.match(cookieHeader, /SameSite=Strict/i);
assert.doesNotMatch(cookieHeader, /;\s*Secure/i, 'El desarrollo HTTP debe poder usar la cookie');
const Cookie = cookieHeader.split(';')[0];

for (const route of [
  '/auth/me',
  '/users',
  '/products',
  '/warehouses',
  '/suppliers',
  '/customers',
  '/purchase-orders',
  '/inventory/stock',
  '/inventory/movements',
  '/inventory/lots',
  '/inventory/dashboard',
]) {
  const authenticated = await fetch(`${api}${route}`, { headers: { Cookie, Origin: origin } });
  assert.equal(authenticated.status, 200, route);
  const unauthenticated = await fetch(`${api}${route}`);
  assert.equal(unauthenticated.status, 401, `${route} debe exigir sesion`);
}

// Business smoke: run Purchases through the actual Docker API and reconcile its SQL ledger.
async function request(route, method = 'GET', body) {
  const result = await fetch(api + route, {
    method,
    headers: { Cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(result.ok, `${method} ${route}: HTTP ${result.status}`);
  return (await result.json()).data;
}
const suffix = randomUUID().slice(0, 8);
const inventoryDashboard = await request('/inventory/dashboard');
assert.equal(inventoryDashboard.period.timeZone, 'America/Managua');
assert.equal(inventoryDashboard.stock, null);
assert.equal(inventoryDashboard.movementQuantity, null);
assert.equal(
  Object.values(inventoryDashboard.catalog.productsByType).reduce((sum, count) => sum + count, 0),
  inventoryDashboard.catalog.activeProducts,
);
assert.equal(
  inventoryDashboard.movementsByPeriod.reduce((sum, point) => sum + point.count, 0),
  inventoryDashboard.movements.total,
);
assert.ok(inventoryDashboard.recentMovements.length <= 5);
for (const status of ['quarantined', 'released', 'rejected', 'rework', 'scrapped']) {
  assert.equal(typeof inventoryDashboard.lotsOnHand[status], 'number');
}
const catalogProduct = (await request('/products?limit=1'))[0];
if (catalogProduct) {
  const selected = await request(`/inventory/dashboard?productId=${catalogProduct.id}`);
  assert.equal(selected.stock.unit, catalogProduct.unit);
  for (const value of [
    selected.stock.onHand,
    selected.stock.consumable,
    selected.movementQuantity.in,
    selected.movementQuantity.out,
    selected.movementQuantity.net,
  ]) {
    assert.match(value, /^-?\d+\.\d{4}$/);
  }
}
const supplier = await request('/suppliers', 'POST', {
  code: 'DOCKER-' + suffix,
  name: 'Docker purchase supplier',
});
const product = await request('/products', 'POST', {
  code: 'DOCKER-' + suffix,
  name: 'Docker raw material',
  category: 'Validation',
  type: 'RAW_MATERIAL',
  unit: 'KILOGRAM',
});
const warehouse = (await request('/warehouses'))[0];
const order = await request('/purchase-orders', 'POST', {
  supplierId: supplier.id,
  items: [{ productId: product.id, quantity: '100', unitPrice: '1.005' }],
});
assert.equal(order.status, 'DRAFT');
assert.equal(order.total, '100.50');
assert.match(order.number, /^OC-\d{4}-\d{6,}$/);
await request('/purchase-orders/' + order.id, 'PATCH', { expectedDate: '2026-12-01' });
await request('/purchase-orders/' + order.id + '/confirm', 'POST', {});
const item = { purchaseOrderItemId: order.items[0].id, warehouseId: warehouse.id };
const partial = await request('/purchase-orders/' + order.id + '/receive', 'POST', {
  items: [
    { ...item, quantity: '30' },
    { ...item, quantity: '20' },
  ],
});
assert.equal(partial.status, 'PARTIALLY_RECEIVED');
assert.equal(partial.items[0].quantityReceived, '50.0000');
const complete = await request('/purchase-orders/' + order.id + '/receive', 'POST', {
  items: [{ ...item, quantity: '50' }],
});
assert.equal(complete.status, 'RECEIVED');
assert.equal(complete.items[0].quantityPending, '0.0000');
assert.equal((await request('/purchase-orders/' + order.id + '/receipts')).length, 2);
assert.equal(
  (
    await fetch(api + '/purchase-orders/' + order.id + '/cancel', {
      method: 'POST',
      headers: { Cookie, Origin: origin },
    })
  ).status,
  409,
);
const backendRequire = createRequire('/app/backend/package.json');
const adapterRequire = createRequire(backendRequire.resolve('@prisma/adapter-pg'));
const { Client } = adapterRequire('pg');
const database = new Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
try {
  const ledger = (
    await database.query('SELECT * FROM inventory_movements WHERE product_id=$1', [product.id])
  ).rows;
  assert.equal(ledger.length, 3);
  for (const movement of ledger) {
    assert.equal(movement.type, 'PURCHASE_RECEIPT');
    assert.equal(movement.reason, null);
    assert.equal(movement.lot_id, null);
    assert.ok(movement.purchase_receipt_item_id);
  }
  const result = (
    await database.query(
      'SELECT quantity::text AS quantity, quantity=(SELECT sum(quantity) FROM inventory_movements WHERE product_id=$1 AND warehouse_id=$2) AS reconciled FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2',
      [product.id, warehouse.id],
    )
  ).rows[0];
  assert.equal(result.quantity, '100.0000');
  assert.equal(result.reconciled, true);
} finally {
  await database.end();
}
console.log(
  'Docker: Purchase DRAFT/edit/confirm, split partial/full receipts, origins and reconciled ledger verified.',
);

// A-2 reads real receipts, including lot provenance and a DATE without timezone drift.
const stock = await request('/inventory/stock?productId=' + product.id);
assert.equal(stock[0].quantity, '100.0000');
const movements = await request(
  '/inventory/movements?productId=' + product.id + '&type=PURCHASE_RECEIPT',
);
assert.equal(movements.length, 3);
assert.ok(
  movements.every(
    (movement) =>
      movement.businessReference.number.startsWith('REC-') &&
      movement.businessReference.purchaseOrder.id === order.id &&
      movement.reason === null,
  ),
);
const tracked = await request('/products', 'POST', {
  code: 'DOCKER-LOT-' + suffix,
  name: 'Docker tracked material',
  category: 'Validation',
  type: 'RAW_MATERIAL',
  unit: 'KILOGRAM',
  isLotTracked: true,
  requiresQualityInspection: true,
});
const trackedOrder = await request('/purchase-orders', 'POST', {
  supplierId: supplier.id,
  items: [{ productId: tracked.id, quantity: '2', unitPrice: '1' }],
});
await request('/purchase-orders/' + trackedOrder.id + '/confirm', 'POST', {});
const trackedReceived = await request('/purchase-orders/' + trackedOrder.id + '/receive', 'POST', {
  items: [
    {
      purchaseOrderItemId: trackedOrder.items[0].id,
      warehouseId: warehouse.id,
      quantity: '2',
      expiresAt: '2026-10-14',
    },
  ],
});
const lots = await request('/inventory/lots?productId=' + tracked.id);
assert.equal(lots.length, 1);
assert.equal(lots[0].status, 'QUARANTINED');
assert.equal(lots[0].expiresAt, '2026-10-14');
assert.equal(lots[0].quantityOnHand, '2.0000');
assert.equal(lots[0].origin.purchaseReceipt.id, trackedReceived.receipts[0].id);
assert.equal(lots[0].origin.purchaseOrder.id, trackedOrder.id);
assert.equal(lots[0].origin.supplier.id, supplier.id);
const detailResponse = await fetch(api + '/inventory/lots/' + lots[0].id, { headers: { Cookie } });
assert.equal(detailResponse.status, 200);
const detail = await detailResponse.json();
assert.deepEqual(detail.origin, lots[0].origin);
assert.equal(detail.balances[0].quantity, '2.0000');
assert.equal(detail.movements[0].businessReference.id, trackedReceived.receipts[0].id);
console.log(
  'Docker: A-2 stock, receipt movement references, quarantined lot origin and calendar DATE verified.',
);

// C-2: real purchase lot → atomic production → quality → supplier traceability.
const productionRaw = await request('/products', 'POST', {
  code: 'DOCKER-PROD-RAW-' + suffix,
  name: 'Docker production component',
  category: 'Validation',
  type: 'RAW_MATERIAL',
  unit: 'KILOGRAM',
  isLotTracked: true,
});
const productionPurchase = await request('/purchase-orders', 'POST', {
  supplierId: supplier.id,
  items: [{ productId: productionRaw.id, quantity: '20', unitPrice: '1' }],
});
await request('/purchase-orders/' + productionPurchase.id + '/confirm', 'POST', {});
await request('/purchase-orders/' + productionPurchase.id + '/receive', 'POST', {
  items: [
    {
      purchaseOrderItemId: productionPurchase.items[0].id,
      warehouseId: warehouse.id,
      quantity: '20',
    },
  ],
});
const componentLots = await request(
  `/inventory/lots?productId=${productionRaw.id}&warehouseId=${warehouse.id}&status=RELEASED&hasStock=true`,
);
assert.equal(componentLots.length, 1);
const outputProduct = await request('/products', 'POST', {
  code: 'DOCKER-OUTPUT-' + suffix,
  name: 'Docker output',
  category: 'Validation',
  type: 'FINISHED_GOOD',
  unit: 'UNIT',
  isLotTracked: true,
  requiresQualityInspection: true,
});
const bom = await request('/production/boms', 'POST', {
  productId: outputProduct.id,
  name: 'Docker production BOM',
});
const version = await request(`/production/boms/${bom.id}/versions`, 'POST', {
  outputQuantity: '1',
  items: [{ productId: productionRaw.id, quantity: '2' }],
});
const op = await request('/production/orders', 'POST', {
  productId: outputProduct.id,
  bomVersionId: version.id,
  warehouseId: warehouse.id,
  quantityPlanned: '10',
});
const started = await request(`/production/orders/${op.id}/start`, 'POST', {});
assert.equal(started.status, 'IN_PROGRESS');
await verifySimulation(api, Cookie, origin, op.id, request);
await verifySimulator(Client, op.id, suffix);
await verifyMonitoring(Client, api, Cookie, op.id, 'IN_PROGRESS');

// Fase 3: actual publisher → Mosquitto → NestJS → PostgreSQL while the OP is active.
const mqttDb = new Client({ connectionString: process.env.DATABASE_URL });
await mqttDb.connect();
const { connectAsync } = backendRequire('mqtt');
let publisher;
try {
  publisher = await connectAsync(process.env.MQTT_URL, {
    reconnectPeriod: 0,
    connectTimeout: 5000,
  });
  const deviceId = randomUUID();
  const deviceCode = 'DOCKER-IIOT-' + suffix;
  await mqttDb.query('INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1,$2,$3,now())', [
    deviceId,
    deviceCode,
    'Isolated Docker telemetry fixture',
  ]);
  const topic = `ecosoap/production/${op.id}/${deviceCode}/telemetry`;
  const recordedAt = '2026-10-30T10:00:00Z';
  const alertsBefore = (await mqttDb.query('SELECT count(*) FROM iiot_alerts')).rows[0].count;
  await publisher.publishAsync(topic, '{invalid JSON', { qos: 0 });
  await publisher.publishAsync(
    topic,
    JSON.stringify({
      recordedAt,
      metrics: [
        { metric: 'TEMPERATURE', value: 27.25, unit: '°C' },
        { metric: 'HUMIDITY', value: 61.5, unit: '%' },
      ],
    }),
    { qos: 0 },
  );
  const deadline = Date.now() + 10000;
  let readings = [];
  while (Date.now() < deadline) {
    readings = (
      await mqttDb.query(
        'SELECT production_order_id,device_id,metric,value::text,unit,recorded_at,received_at FROM iiot_readings WHERE production_order_id=$1 AND device_id=$2 ORDER BY metric',
        [op.id, deviceId],
      )
    ).rows;
    if (readings.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(readings.length, 2, 'MQTT telemetry did not reach PostgreSQL within 10 seconds');
  assert.deepEqual(
    readings.map((row) => [row.metric, row.value, row.unit]),
    [
      ['TEMPERATURE', '27.2500', '°C'],
      ['HUMIDITY', '61.5000', '%'],
    ],
  );
  for (const row of readings) {
    assert.equal(row.production_order_id, op.id);
    assert.equal(row.device_id, deviceId);
    assert.equal(row.recorded_at.toISOString(), new Date(recordedAt).toISOString());
    assert.ok(row.received_at instanceof Date);
  }
  assert.equal(
    (await mqttDb.query('SELECT count(*) FROM iiot_alerts')).rows[0].count,
    alertsBefore,
  );
  console.log(
    'Docker: MQTT publisher → Mosquitto → NestJS → PostgreSQL verified (2 readings, no alerts, invalid JSON isolated).',
  );
} finally {
  if (publisher) await publisher.endAsync(true);
  await mqttDb.end();
}
assert.equal(
  (await request(`/inventory/stock?productId=${productionRaw.id}`))[0].quantity,
  '20.0000',
);
const completed = await request(`/production/orders/${op.id}/complete`, 'POST', {
  quantityProduced: '9',
  allocations: [
    { productId: productionRaw.id, lots: [{ lotId: componentLots[0].id, quantity: '20' }] },
  ],
});
assert.equal(completed.status, 'COMPLETED');
await verifyMonitoring(Client, api, Cookie, op.id, 'COMPLETED');
assert.equal(completed.quantityProduced, '9.0000');
assert.equal(completed.lot.status, 'QUARANTINED');
const produced = await request(`/inventory/lots?productId=${outputProduct.id}`);
assert.equal(produced[0].origin.type, 'PRODUCTION_ORDER');
assert.equal(produced[0].origin.productionOrder.id, op.id);
const productionMovements = await request(`/inventory/movements?productId=${outputProduct.id}`);
assert.equal(productionMovements[0].businessReference.number, op.number);
const qualityBefore = await qualityEvidence(Client, op.id, completed.lot.id);
assert.equal(qualityBefore.lot.status, 'QUARANTINED');
assert.deepEqual(qualityBefore.inspection, []);
assert.ok(qualityBefore.readings.length > 0);
for (const severity of ['WARNING', 'CRITICAL'])
  assert.ok(qualityBefore.alerts.some((alert) => alert.severity === severity));
assert.ok(qualityBefore.alerts.every((alert) => alert.acknowledged_at === null));
assert.equal(await request(`/production/lots/${completed.lot.id}/inspection`), null);
const manualInspection = await request(`/production/lots/${completed.lot.id}/inspection`, 'POST', {
  result: 'APPROVED',
  observations: 'Docker quality approved',
});
assert.equal(manualInspection.result, 'APPROVED');
const qualityAfter = await qualityEvidence(Client, op.id, completed.lot.id);
assert.equal(qualityAfter.lot.status, 'RELEASED');
assert.equal(qualityAfter.inspection.length, 1);
assert.equal(qualityAfter.inspection[0].result, 'APPROVED');
assert.deepEqual(qualityAfter.readings, qualityBefore.readings);
assert.deepEqual(qualityAfter.alerts, qualityBefore.alerts);
assert.deepEqual(qualityAfter.movements, qualityBefore.movements);
assert.ok(qualityAfter.alerts.some((alert) => alert.severity === 'CRITICAL'));
assert.ok(qualityAfter.alerts.every((alert) => alert.acknowledged_at === null));
await verifyMonitoring(Client, api, Cookie, op.id, 'COMPLETED');
console.log(
  'Docker: CRITICAL ≠ automatic rejection; explicit APPROVED → RELEASED; all readings, alerts and acknowledgements unchanged.',
);
const released = await fetch(api + '/inventory/lots/' + completed.lot.id, { headers: { Cookie } });
assert.equal((await released.json()).status, 'RELEASED');
const trace = await request(`/production/lots/${completed.lot.id}/traceability`);
assert.equal(trace.lots.length, 2);
assert.equal(trace.lots[1].origin.supplier.id, supplier.id);
assert.equal(
  (
    await fetch(api + `/production/orders/${op.id}/complete`, {
      method: 'POST',
      headers: { Cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantityProduced: '9',
        allocations: [
          { productId: productionRaw.id, lots: [{ lotId: componentLots[0].id, quantity: '20' }] },
        ],
      }),
    })
  ).status,
  409,
);
const productionDb = new Client({ connectionString: process.env.DATABASE_URL });
await productionDb.connect();
try {
  const reconciled = (
    await productionDb.query(
      'SELECT bool_and(b.quantity = (SELECT coalesce(sum(m.quantity),0) FROM inventory_movements m WHERE m.product_id=b.product_id AND m.warehouse_id=b.warehouse_id)) AS ok FROM stock_balances b WHERE b.product_id=ANY($1::uuid[])',
      [[productionRaw.id, outputProduct.id]],
    )
  ).rows[0];
  assert.equal(reconciled.ok, true);
} finally {
  await productionDb.end();
}
console.log(
  'Docker: C-2 START without reservation, atomic planned consumption/actual output, OP queries, quality and supplier traceability verified.',
);

// C2: independent rejected production retains IIoT evidence and removes all remaining lot stock.
await request('/inventory/adjustments', 'POST', {
  productId: productionRaw.id,
  warehouseId: warehouse.id,
  lotId: componentLots[0].id,
  type: 'ADJUSTMENT_IN',
  quantity: '20',
  reason: 'PHYSICAL_COUNT',
});
const scrapOrder = await request('/production/orders', 'POST', {
  productId: outputProduct.id,
  bomVersionId: version.id,
  warehouseId: warehouse.id,
  quantityPlanned: '10',
});
await request(`/production/orders/${scrapOrder.id}/start`, 'POST', {});
const evidenceDb = new Client({ connectionString: process.env.DATABASE_URL });
await evidenceDb.connect();
try {
  const evidenceDeviceId = randomUUID();
  await evidenceDb.query(
    "INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1::uuid,$1::text,'Docker C2 evidence',now())",
    [evidenceDeviceId],
  );
  await evidenceDb.query(
    "INSERT INTO iiot_readings(id,production_order_id,device_id,metric,value,unit,recorded_at) VALUES ($1,$2,$3,'TEMPERATURE',50,'°C',now())",
    [randomUUID(), scrapOrder.id, evidenceDeviceId],
  );
  await evidenceDb.query(
    "INSERT INTO iiot_alerts(id,production_order_id,type,severity,message) VALUES ($1,$2,'docker-c2','CRITICAL','Context for human disposition')",
    [randomUUID(), scrapOrder.id],
  );
} finally {
  await evidenceDb.end();
}
const scrapCompleted = await request(`/production/orders/${scrapOrder.id}/complete`, 'POST', {
  quantityProduced: '9',
  allocations: [
    { productId: productionRaw.id, lots: [{ lotId: componentLots[0].id, quantity: '20' }] },
  ],
});
const scrapBefore = await qualityEvidence(Client, scrapOrder.id, scrapCompleted.lot.id);
const rejectedInspection = await request(
  `/production/lots/${scrapCompleted.lot.id}/inspection`,
  'POST',
  {
    result: 'REJECTED',
    observations: 'Docker C2 human inspection',
    nonConformities: 'Docker C2 original defect',
  },
);
const rejectedBeforeDisposition = await qualityEvidence(
  Client,
  scrapOrder.id,
  scrapCompleted.lot.id,
);
await request(`/production/lots/${scrapCompleted.lot.id}/disposition`, 'POST', {
  type: 'SCRAP',
  reason: 'Docker C2 explicit disposal',
});
const scrapAfter = await qualityEvidence(Client, scrapOrder.id, scrapCompleted.lot.id);
assert.equal(scrapAfter.lot.status, 'SCRAPPED');
assert.equal(scrapBefore.readings.length, 1);
assert.equal(scrapBefore.alerts[0].severity, 'CRITICAL');
assert.deepEqual(scrapAfter.movements, scrapBefore.movements);
assert.equal(scrapAfter.inspection[0].result, 'REJECTED');
assert.deepEqual(scrapAfter.inspection, rejectedBeforeDisposition.inspection);
assert.equal(scrapAfter.inspection[0].id, rejectedInspection.id);
assert.deepEqual(scrapAfter.readings, scrapBefore.readings);
assert.deepEqual(scrapAfter.alerts, scrapBefore.alerts);
const scrapDb = new Client({ connectionString: process.env.DATABASE_URL });
await scrapDb.connect();
try {
  const disposition = (
    await scrapDb.query('SELECT type,reason FROM quality_dispositions WHERE lot_id=$1', [
      scrapCompleted.lot.id,
    ])
  ).rows;
  assert.equal(disposition.length, 1);
  assert.equal(disposition[0].type, 'SCRAP');
  const movements = (
    await scrapDb.query(
      "SELECT quantity::text FROM inventory_movements WHERE lot_id=$1 AND type='QUALITY_SCRAP'",
      [scrapCompleted.lot.id],
    )
  ).rows;
  assert.deepEqual(
    movements.map((row) => row.quantity),
    ['-9.0000'],
  );
  assert.equal(
    (
      await scrapDb.query(
        'SELECT sum(quantity)::text AS balance FROM inventory_movements WHERE lot_id=$1',
        [scrapCompleted.lot.id],
      )
    ).rows[0].balance,
    '0.0000',
  );
  assert.equal(
    (
      await scrapDb.query(
        'SELECT quantity::text FROM stock_balances WHERE product_id=$1 AND warehouse_id=$2',
        [outputProduct.id, warehouse.id],
      )
    ).rows[0].quantity,
    '9.0000',
  );
} finally {
  await scrapDb.end();
}
console.log(
  'Docker C2: completed OP → QUARANTINED → human REJECTED → SCRAP → SCRAPPED; QUALITY_SCRAP -9.0000, zero lot balance, original inspection and IIoT unchanged.',
);

await verifySustainability(api, Cookie, origin, request, suffix, warehouse);
await verifyMultilevel(request, suffix, warehouse, Client);

const logout = await fetch(`${api}/auth/logout`, {
  method: 'POST',
  headers: { Cookie, Origin: origin },
});
assert.ok(logout.ok);
const revoked = await fetch(`${api}/auth/me`, { headers: { Cookie } });
assert.equal(revoked.status, 401);
console.log('Docker: frontend, salud, CORS, cookie, cuatro catalogos y logout verificados.');
