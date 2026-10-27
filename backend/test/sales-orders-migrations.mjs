import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Sales migration proof requires a dedicated *_test database');
const db = new Client({ connectionString: url });
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(backend, 'prisma', 'migrations');
const names = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
const salesMigration = names.indexOf('20261026090000_sales_orders');
assert(salesMigration > 0, 'Sales orders migration must exist after the existing schema');
const schema = 'sales_upgrade_' + randomUUID().replaceAll('-', '');
async function apply(list) {
  for (const name of list)
    await db.query(await readFile(path.join(root, name, 'migration.sql'), 'utf8'));
}
async function capture() {
  const rows = {};
  for (const table of [
    'roles',
    'users',
    'customers',
    'suppliers',
    'products',
    'warehouses',
    'bills_of_material',
    'bom_versions',
    'bom_items',
    'production_orders',
    'purchase_orders',
    'purchase_order_items',
    'purchase_receipts',
    'purchase_receipt_items',
    'lots',
    'quality_inspections',
    'stock_balances',
    'inventory_movements',
    'audit_logs',
    'document_sequences',
  ])
    rows[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows;
  return rows;
}
function runPrisma(args, databaseUrl) {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: backend,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `Prisma ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}
try {
  await db.connect();
  const version = Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
  assert(version >= 180000 && version < 190000, 'PostgreSQL 18 required');
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET search_path TO "${schema}"`);
  await apply(names.slice(0, salesMigration));
  const ids = Object.fromEntries(
    [
      'role',
      'user',
      'raw',
      'output',
      'warehouse',
      'supplier',
      'customer',
      'bom',
      'bomVersion',
      'productionOrder',
      'purchaseOrder',
      'purchaseItem',
      'receipt',
      'receiptItem',
      'purchaseLot',
      'productionLot',
      'qualityInspection',
      'movement',
      'audit',
    ].map((key) => [key, randomUUID()]),
  );
  const {
    role,
    user,
    raw,
    output,
    warehouse,
    supplier,
    customer,
    bom,
    bomVersion,
    productionOrder,
    purchaseOrder,
    purchaseItem,
    receipt,
    receiptItem,
    purchaseLot,
    productionLot,
    qualityInspection,
    movement,
    audit,
  } = ids;
  await db.query(`INSERT INTO roles(id,code,name) VALUES ($1,'ADMIN','Sales migration proof')`, [
    role,
  ]);
  await db.query(
    `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at) VALUES ($1,'sales-migration@example.test','fixture','Sales migration proof',$2,now())`,
    [user, role],
  );
  await db.query(
    `INSERT INTO products(id,code,name,category,type,unit,is_lot_tracked,updated_at) VALUES ($1,'SALES-MIGRATION-RAW','Historical raw','Migration','RAW_MATERIAL','KILOGRAM',true,now()),($2,'SALES-MIGRATION-OUTPUT','Historical output','Migration','FINISHED_GOOD','UNIT',true,now())`,
    [raw, output],
  );
  await db.query(
    `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'SALES-MIGRATION-WH','Historical warehouse','Migration',now())`,
    [warehouse],
  );
  await db.query(
    `INSERT INTO customers(id,code,name,updated_at) VALUES ($1,'SALES-MIGRATION-CUSTOMER','Historical customer',now())`,
    [customer],
  );
  await db.query(
    `INSERT INTO suppliers(id,code,name,updated_at) VALUES ($1,'SALES-MIGRATION-SUPPLIER','Historical supplier',now())`,
    [supplier],
  );
  await db.query(
    `INSERT INTO bills_of_material(id,product_id,name,updated_at) VALUES ($1,$2,'Historical BOM',now())`,
    [bom, output],
  );
  await db.query(
    `INSERT INTO bom_versions(id,bom_id,version,output_quantity,is_active,created_by_user_id) VALUES ($1,$2,1,1,true,$3)`,
    [bomVersion, bom, user],
  );
  await db.query(
    `INSERT INTO bom_items(id,bom_version_id,component_product_id,quantity) VALUES (gen_random_uuid(),$1,$2,2)`,
    [bomVersion, raw],
  );
  await db.query(
    `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,created_by_user_id,updated_at) VALUES ($1,'OP-SALES-MIGRATION',$2,$3,$4,2,$5,now())`,
    [productionOrder, output, bomVersion, warehouse, user],
  );
  await db.query(
    `INSERT INTO purchase_orders(id,number,supplier_id,status,ordered_at,created_by_user_id,updated_at) VALUES ($1,'OC-SALES-MIGRATION',$2,'RECEIVED',now(),$3,now())`,
    [purchaseOrder, supplier, user],
  );
  await db.query(
    `INSERT INTO purchase_order_items(id,purchase_order_id,product_id,quantity_ordered,unit_price,line_total) VALUES ($1,$2,$3,20,1,20)`,
    [purchaseItem, purchaseOrder, raw],
  );
  await db.query(
    `INSERT INTO purchase_receipts(id,number,purchase_order_id,received_at,received_by_user_id) VALUES ($1,'REC-SALES-MIGRATION',$2,now(),$3)`,
    [receipt, purchaseOrder, user],
  );
  await db.query(
    `INSERT INTO purchase_receipt_items(id,purchase_receipt_id,purchase_order_item_id,product_id,warehouse_id,quantity) VALUES ($1,$2,$3,$4,$5,20)`,
    [receiptItem, receipt, purchaseItem, raw, warehouse],
  );
  await db.query(
    `INSERT INTO lots(id,code,product_id,status,originated_at,purchase_receipt_item_id) VALUES ($1,'LOT-SALES-PURCHASE',$2,'RELEASED',now(),$3),($4,'LOT-SALES-PRODUCTION',$5,'RELEASED',now(),$6)`,
    [purchaseLot, raw, receiptItem, productionLot, output, productionOrder],
  );
  await db.query(
    `INSERT INTO quality_inspections(id,lot_id,result,observations,inspected_by_user_id) VALUES ($1,$2,'APPROVED','Historical inspection',$3)`,
    [qualityInspection, purchaseLot, user],
  );
  await db.query(
    `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,purchase_receipt_item_id) VALUES ($1,$2,$3,$4,'PURCHASE_RECEIPT',20,$5,$6)`,
    [movement, raw, warehouse, purchaseLot, user, receiptItem],
  );
  await db.query(
    `INSERT INTO stock_balances(id,product_id,warehouse_id,quantity,updated_at) VALUES (gen_random_uuid(),$1,$2,20,now())`,
    [raw, warehouse],
  );
  await db.query(
    `INSERT INTO audit_logs(id,actor_type,actor_user_id,action,entity_type,entity_id) VALUES ($1,'USER',$2,'CREATE','PRODUCT',$3)`,
    [audit, user, raw],
  );
  await db.query(
    `INSERT INTO document_sequences(id,document_type,year,last_number) VALUES (gen_random_uuid(),'LOT',2026,17),(gen_random_uuid(),'OP',2026,9)`,
  );
  const before = await capture();

  // Mark the develop-era migrations applied, then let Prisma itself upgrade the isolated schema.
  await db.query(`CREATE TABLE "_prisma_migrations" (
    "id" VARCHAR(36) NOT NULL PRIMARY KEY, "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )`);
  for (const name of names.slice(0, salesMigration)) {
    const contents = await readFile(path.join(root, name, 'migration.sql'));
    await db.query(
      `INSERT INTO "_prisma_migrations"(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ($1,$2,now(),$3,now(),1)`,
      [randomUUID(), createHash('sha256').update(contents).digest('hex'), name],
    );
  }
  const scopedUrl = new URL(url);
  scopedUrl.searchParams.set('schema', schema);
  const databaseUrl = scopedUrl.toString();
  runPrisma(['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], databaseUrl);
  const after = await capture();
  assert.deepEqual(after, before, 'Sales migration must preserve data from existing tables');
  const firstApplied = await db.query(
    `SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL`,
    ['20261026090000_sales_orders'],
  );
  assert.equal(firstApplied.rows[0].count, 1, 'Prisma deploy must record the Sales migration once');
  runPrisma(['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], databaseUrl);
  const repeatApplied = await db.query(
    `SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL`,
    ['20261026090000_sales_orders'],
  );
  assert.equal(repeatApplied.rows[0].count, 1, 'Second migrate deploy must be idempotent');
  runPrisma(
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ],
    databaseUrl,
  );

  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('sale_orders','sale_order_items') ORDER BY table_name`,
    [schema],
  );
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ['sale_order_items', 'sale_orders'],
  );
  const status = await db.query(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typname='SaleOrderStatus' ORDER BY enumsortorder`,
    [schema],
  );
  assert.deepEqual(
    status.rows.map((row) => row.enumlabel),
    ['DRAFT', 'CONFIRMED', 'PARTIALLY_DISPATCHED', 'DISPATCHED', 'CANCELLED'],
  );
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM sale_orders`)).rows[0].count, 0);
  console.log(
    'PASS PostgreSQL 18: Prisma upgrade preserves 20 historical tables, deploy is idempotent and schema drift is clean',
  );
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.query('SET search_path TO public').catch(() => {});
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
