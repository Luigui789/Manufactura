import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Production migration proof requires a dedicated *_test database');
const db = new Client({ connectionString: url });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
const names = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
const cut = names.indexOf('20261014020000_production_execution_enums');
assert(cut > 0);
const schema = 'c2_upgrade_' + randomUUID().replaceAll('-', '');
async function apply(list) {
  for (const name of list)
    await db.query(await readFile(path.join(root, name, 'migration.sql'), 'utf8'));
}
async function capture() {
  const result = {};
  for (const table of [
    'roles',
    'users',
    'products',
    'warehouses',
    'suppliers',
    'bills_of_material',
    'bom_versions',
    'bom_items',
    'production_orders',
    'purchase_orders',
    'purchase_order_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'lots',
    'inventory_movements',
    'stock_balances',
    'audit_logs',
    'document_sequences',
  ])
    result[table] = (
      await db.query(
        `SELECT to_jsonb(t) - 'production_order_id' - 'sale_dispatch_item_id' AS row FROM ${table} t ORDER BY id`,
      )
    ).rows;
  return result;
}
async function reject(sql, values, constraint) {
  await assert.rejects(db.query(sql, values), (error) => error.constraint === constraint);
}
try {
  await db.connect();
  const version = Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
  assert(version >= 180000 && version < 190000, 'PostgreSQL 18 required');
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET search_path TO "${schema}"`);
  await apply(names.slice(0, cut));
  const [
    role,
    actor,
    raw,
    output,
    warehouse,
    supplier,
    bom,
    versionId,
    order,
    purchase,
    item,
    receipt,
    receiptItem,
    purchasedLot,
    movement,
    audit,
  ] = Array.from({ length: 16 }, randomUUID);
  await db.query(`INSERT INTO roles(id,code,name) VALUES ($1,'ADMIN','C2')`, [role]);
  await db.query(
    `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at) VALUES ($1,'c2@example.test','fixture','C2',$2,now())`,
    [actor, role],
  );
  await db.query(
    `INSERT INTO products(id,code,name,category,type,unit,is_lot_tracked,updated_at) VALUES ($1,'RAW','Raw','C2','RAW_MATERIAL','KILOGRAM',true,now()),($2,'OUTPUT','Output','C2','FINISHED_GOOD','UNIT',true,now())`,
    [raw, output],
  );
  await db.query(
    `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'W','Warehouse','C2',now())`,
    [warehouse],
  );
  await db.query(
    `INSERT INTO suppliers(id,code,name,updated_at) VALUES ($1,'S','Supplier',now())`,
    [supplier],
  );
  await db.query(
    `INSERT INTO bills_of_material(id,product_id,name,updated_at) VALUES ($1,$2,'C2',now())`,
    [bom, output],
  );
  await db.query(
    `INSERT INTO bom_versions(id,bom_id,version,output_quantity,is_active,created_by_user_id) VALUES ($1,$2,1,1,true,$3)`,
    [versionId, bom, actor],
  );
  await db.query(
    `INSERT INTO bom_items(id,bom_version_id,component_product_id,quantity) VALUES (gen_random_uuid(),$1,$2,2)`,
    [versionId, raw],
  );
  await db.query(
    `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,created_by_user_id,updated_at) VALUES ($1,'OP-C2',$2,$3,$4,10,$5,now())`,
    [order, output, versionId, warehouse, actor],
  );
  await db.query(
    `INSERT INTO purchase_orders(id,number,supplier_id,status,ordered_at,created_by_user_id,updated_at) VALUES ($1,'OC-C2',$2,'RECEIVED',now(),$3,now())`,
    [purchase, supplier, actor],
  );
  await db.query(
    `INSERT INTO purchase_order_items(id,purchase_order_id,product_id,quantity_ordered,unit_price,line_total) VALUES ($1,$2,$3,20,1,20)`,
    [item, purchase, raw],
  );
  await db.query(
    `INSERT INTO purchase_receipts(id,number,purchase_order_id,received_at,received_by_user_id) VALUES ($1,'REC-C2',$2,now(),$3)`,
    [receipt, purchase, actor],
  );
  await db.query(
    `INSERT INTO purchase_receipt_items(id,purchase_receipt_id,purchase_order_item_id,product_id,warehouse_id,quantity) VALUES ($1,$2,$3,$4,$5,20)`,
    [receiptItem, receipt, item, raw, warehouse],
  );
  await db.query(
    `INSERT INTO lots(id,code,product_id,status,originated_at,purchase_receipt_item_id) VALUES ($1,'LOT-PURCHASE',$2,'RELEASED',now(),$3)`,
    [purchasedLot, raw, receiptItem],
  );
  await db.query(
    `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,purchase_receipt_item_id) VALUES ($1,$2,$3,$4,'PURCHASE_RECEIPT',20,$5,$6)`,
    [movement, raw, warehouse, purchasedLot, actor, receiptItem],
  );
  await db.query(
    `INSERT INTO stock_balances(id,product_id,warehouse_id,quantity,updated_at) VALUES (gen_random_uuid(),$1,$2,20,now())`,
    [raw, warehouse],
  );
  await db.query(
    `INSERT INTO audit_logs(id,actor_type,actor_user_id,action,entity_type,entity_id) VALUES ($1,'USER',$2,'RECEIVE','PURCHASE_RECEIPT',$3)`,
    [audit, actor, receipt],
  );
  await db.query(
    `INSERT INTO document_sequences(id,document_type,year,last_number) VALUES (gen_random_uuid(),'LOT',2026,1),(gen_random_uuid(),'OP',2026,1)`,
  );
  const before = await capture();
  await apply(names.slice(cut));
  assert.deepEqual(await capture(), before);
  console.log(
    'PASS C2 upgrade: all rows in 18 existing tables preserved, including Purchase lot origins',
  );

  const lotSql = `INSERT INTO lots(id,code,product_id,status,originated_at,purchase_receipt_item_id,production_order_id) VALUES (gen_random_uuid(),$1,$2,'RELEASED',now(),$3,$4)`;
  await reject(lotSql, ['EMPTY', output, null, null], 'lots_business_origin_check');
  await reject(lotSql, ['DOUBLE', raw, receiptItem, order], 'lots_business_origin_check');
  await reject(
    lotSql,
    ['WRONG-PRODUCT', raw, null, order],
    'lots_production_order_id_product_id_fkey',
  );
  const producedLot = randomUUID();
  await db.query(
    `INSERT INTO lots(id,code,product_id,status,originated_at,production_order_id) VALUES ($1,'LOT-OUTPUT',$2,'RELEASED',now(),$3)`,
    [producedLot, output, order],
  );
  await reject(lotSql, ['SECOND', output, null, order], 'lots_production_order_id_key');
  const productionSql = `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,production_order_id,purchase_receipt_item_id,reason) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  for (const [type, quantity, origin, receiptOrigin, reason] of [
    ['PRODUCTION_CONSUMPTION', 1, order, null, null],
    ['PRODUCTION_CONSUMPTION', 0, order, null, null],
    ['PRODUCTION_CONSUMPTION', -1, null, null, null],
    ['PRODUCTION_CONSUMPTION', -1, order, receiptItem, null],
    ['PRODUCTION_CONSUMPTION', -1, order, null, 'INITIAL_LOAD'],
  ])
    await reject(
      productionSql,
      [raw, warehouse, purchasedLot, type, quantity, actor, origin, receiptOrigin, reason],
      'inventory_movements_origin_check',
    );
  for (const [quantity, origin, receiptOrigin, reason] of [
    [-1, order, null, null],
    [0, order, null, null],
    [1, order, receiptItem, null],
    [1, order, null, 'INITIAL_LOAD'],
  ])
    await reject(
      productionSql,
      [
        output,
        warehouse,
        producedLot,
        'PRODUCTION_OUTPUT',
        quantity,
        actor,
        origin,
        receiptOrigin,
        reason,
      ],
      'inventory_movements_origin_check',
    );
  // Without its FK, the output fails its physical lot-origin check before row CHECKs.
  await reject(
    productionSql,
    [output, warehouse, producedLot, 'PRODUCTION_OUTPUT', 1, actor, null, null, null],
    'inventory_movements_output_lot_origin_check',
  );
  const outputSql = `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,production_order_id) VALUES (gen_random_uuid(),$1,$2,$3,'PRODUCTION_OUTPUT',9,$4,$5)`;
  await reject(
    outputSql,
    [raw, warehouse, purchasedLot, actor, order],
    'inventory_movements_output_lot_origin_check',
  );
  await db.query(outputSql, [output, warehouse, producedLot, actor, order]);
  await reject(
    outputSql,
    [output, warehouse, producedLot, actor, order],
    'inventory_movements_production_output_key',
  );
  await db.query(
    `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,production_order_id) VALUES (gen_random_uuid(),$1,$2,$3,'PRODUCTION_CONSUMPTION',-10,$4,$5),(gen_random_uuid(),$1,$2,$3,'PRODUCTION_CONSUMPTION',-10,$4,$5)`,
    [raw, warehouse, purchasedLot, actor, order],
  );
  await reject(
    `UPDATE production_orders SET status='COMPLETED',quantity_produced=9,started_at=now(),completed_at=NULL WHERE id=$1`,
    [order],
    'production_orders_execution_check',
  );
  await db.query(
    `UPDATE production_orders SET status='COMPLETED',quantity_produced=9,started_at=now(),completed_at=now() WHERE id=$1`,
    [order],
  );
  await assert.rejects(
    db.query('UPDATE inventory_movements SET quantity=1 WHERE id=$1', [movement]),
    /append-only/,
  );
  await assert.rejects(db.query('DELETE FROM audit_logs WHERE id=$1', [audit]), /append-only/);
  await db.query(`UPDATE stock_balances SET quantity=0 WHERE product_id=$1`, [raw]);
  await db.query(
    `INSERT INTO stock_balances(id,product_id,warehouse_id,quantity,updated_at) VALUES (gen_random_uuid(),$1,$2,9,now())`,
    [output, warehouse],
  );
  assert.equal(
    (
      await db.query(
        'SELECT (SELECT sum(quantity) FROM inventory_movements) = (SELECT sum(quantity) FROM stock_balances) AS reconciled',
      )
    ).rows[0].reconciled,
    true,
  );
  console.log(
    'PASS C2 physical constraints: XOR, lot uniqueness/product, output origin/uniqueness, multiple consumptions, execution dates, append-only and reconciliation',
  );
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.query('SET search_path TO public').catch(() => {});
  // Only the isolated schema created by this proof is removed; the test database is retained.
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
