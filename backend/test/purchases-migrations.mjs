import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const adapterRequire = createRequire(require.resolve('@prisma/adapter-pg'));
const { Client } = adapterRequire('pg');
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Migration proofs require a dedicated *_test database');
const client = new Client({ connectionString: url });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
const names = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
const initial = names.indexOf('20261013031753_purchase_receipt');
const correction = names.indexOf('20261014010000_purchases_invariants');
assert(initial > 0 && correction > initial);
async function apply(list) {
  for (const name of list)
    await client.query(await readFile(path.join(root, name, 'migration.sql'), 'utf8'));
}
const schemas = [];
async function isolated(label) {
  const schema = 'purchases_' + label + '_' + randomUUID().replaceAll('-', '');
  schemas.push(schema);
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET search_path TO "${schema}"`);
  return schema;
}
async function baseline() {
  const ids = Array.from({ length: 10 }, () => randomUUID());
  const [role, user, product, warehouse, movement, audit, output, bom, version, order] = ids;
  await client.query(`INSERT INTO roles(id,code,name) VALUES ($1,'ADMIN','Migration admin')`, [
    role,
  ]);
  await client.query(
    `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at) VALUES ($1,$2,'fixture','Migration user',$3,now())`,
    [user, user + '@example.test', role],
  );
  await client.query(
    `INSERT INTO products(id,code,name,category,type,unit,updated_at) VALUES ($1,'RAW','Raw','Migration','RAW_MATERIAL','KILOGRAM',now()),($2,'OUTPUT','Output','Migration','FINISHED_GOOD','UNIT',now())`,
    [product, output],
  );
  await client.query(`UPDATE products SET is_lot_tracked=true WHERE id=$1`, [output]);
  await client.query(
    `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'W','Warehouse','Migration',now())`,
    [warehouse],
  );
  await client.query(
    `INSERT INTO inventory_movements(id,product_id,warehouse_id,type,quantity,reason,performed_by_user_id) VALUES ($1,$2,$3,'ADJUSTMENT_IN',10,'INITIAL_LOAD',$4)`,
    [movement, product, warehouse, user],
  );
  await client.query(
    `INSERT INTO stock_balances(id,product_id,warehouse_id,quantity,updated_at) VALUES (gen_random_uuid(),$1,$2,10,now())`,
    [product, warehouse],
  );
  await client.query(
    `INSERT INTO audit_logs(id,actor_type,actor_user_id,action,entity_type,entity_id) VALUES ($1,'USER',$2,'CREATE','PRODUCT',$3)`,
    [audit, user, product],
  );
  await client.query(
    `INSERT INTO document_sequences(id,document_type,year,last_number) VALUES (gen_random_uuid(),'OP',2026,9),(gen_random_uuid(),'LOT',2026,3)`,
  );
  await client.query(
    `INSERT INTO bills_of_material(id,product_id,name,updated_at) VALUES ($1,$2,'Migration BOM',now())`,
    [bom, output],
  );
  await client.query(
    `INSERT INTO bom_versions(id,bom_id,version,output_quantity,is_active,created_by_user_id) VALUES ($1,$2,1,1,true,$3)`,
    [version, bom, user],
  );
  await client.query(
    `INSERT INTO bom_items(id,bom_version_id,component_product_id,quantity) VALUES (gen_random_uuid(),$1,$2,2)`,
    [version, product],
  );
  await client.query(
    `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,created_by_user_id,updated_at) VALUES ($1,'OP-2026-000009',$2,$3,$4,2,$5,now())`,
    [order, output, version, warehouse, user],
  );
  return { product, output, warehouse, movement, audit, user, order };
}
async function capture() {
  const result = {};
  for (const table of [
    'inventory_movements',
    'stock_balances',
    'audit_logs',
    'document_sequences',
    'production_orders',
    'bom_versions',
    'bom_items',
  ]) {
    const { rows } = await client.query(`SELECT * FROM ${table} ORDER BY id`);
    result[table] = rows;
  }
  return result;
}
try {
  await client.connect();
  const { rows } = await client.query('SHOW server_version_num');
  assert(
    Number(rows[0].server_version_num) >= 180000 && Number(rows[0].server_version_num) < 190000,
    'PostgreSQL 18 required',
  );
  await isolated('clean');
  await apply(names);
  assert.equal(
    (await client.query('SELECT count(*)::int AS count FROM purchase_orders')).rows[0].count,
    0,
  );
  console.log('PASS PostgreSQL 18: installation from empty schema');
  await isolated('upgrade');
  await apply(names.slice(0, initial));
  const ids = await baseline();
  const before = await capture();
  await apply(names.slice(initial));
  const after = await capture();
  const expected = structuredClone(before);
  expected.inventory_movements = expected.inventory_movements.map((m) => ({
    ...m,
    purchase_receipt_item_id: null,
    production_order_id: null,
  }));
  assert.deepEqual(after, expected);
  await assert.rejects(
    client.query('UPDATE inventory_movements SET quantity=11 WHERE id=$1', [ids.movement]),
    /append-only/,
  );
  await assert.rejects(
    client.query('DELETE FROM inventory_movements WHERE id=$1', [ids.movement]),
    /append-only/,
  );
  assert.equal(
    (
      await client.query(
        'SELECT (SELECT sum(quantity) FROM inventory_movements) = (SELECT sum(quantity) FROM stock_balances) AS reconciled',
      )
    ).rows[0].reconciled,
    true,
  );
  console.log(
    'PASS upgrade from develop: adjustments, ledger, stock, audit, OP, BOM and counters preserved',
  );
  await isolated('orphan');
  await apply(names.slice(0, initial));
  const orphanIds = await baseline();
  const lot = randomUUID();
  await client.query(
    `INSERT INTO lots(id,code,product_id,status,originated_at) VALUES ($1,'ORPHAN',$2,'RELEASED',now())`,
    [lot, orphanIds.output],
  );
  await apply(names.slice(initial, correction));
  await assert.rejects(apply([names[correction]]), /existing lots have no business origin/);
  await client.query('ROLLBACK');
  const orphan = (await client.query('SELECT * FROM lots WHERE id=$1', [lot])).rows[0];
  assert.equal(orphan.purchase_receipt_item_id, null);
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS count FROM pg_constraint WHERE conname='inventory_movements_adjustment_check' AND conrelid='inventory_movements'::regclass",
      )
    ).rows[0].count,
    1,
  );
  console.log(
    'PASS legacy orphan: corrective migration stops atomically without inventing origins',
  );
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.query('SET search_path TO public').catch(() => {});
  for (const schema of schemas) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
