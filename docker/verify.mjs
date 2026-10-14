import assert from 'node:assert/strict';
import { get } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

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

const logout = await fetch(`${api}/auth/logout`, {
  method: 'POST',
  headers: { Cookie, Origin: origin },
});
assert.ok(logout.ok);
const revoked = await fetch(`${api}/auth/me`, { headers: { Cookie } });
assert.equal(revoked.status, 401);
console.log('Docker: frontend, salud, CORS, cookie, cuatro catalogos y logout verificados.');
