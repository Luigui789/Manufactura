import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Requires dedicated *_test database');
const db = new Client({ connectionString: url });
const root = new URL('../prisma/migrations/', import.meta.url);
const names = (await readdir(root)).filter((n) => /^\d/.test(n)).sort();
const cut = names.indexOf('20261031010000_quality_disposition_enums');
assert(cut > 0);
const schemas = [];
async function apply(list) {
  for (const name of list)
    await db.query(await readFile(new URL(name + '/migration.sql', root), 'utf8'));
}
async function snapshot() {
  const tables = (
    await db.query(
      'SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename',
    )
  ).rows;
  const result = {};
  for (const { tablename } of tables)
    result[tablename] = (
      await db.query(`SELECT to_jsonb(t) AS row FROM "${tablename}" t ORDER BY id`)
    ).rows;
  return result;
}
try {
  await db.connect();
  for (const upgrade of [false, true]) {
    const schema = 'quality_' + randomUUID().replaceAll('-', '');
    schemas.push(schema);
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    if (!upgrade) {
      await apply(names);
      assert.equal(
        (await db.query('SELECT count(*) FROM quality_dispositions')).rows[0].count,
        '0',
      );
      console.log('PASS C2 migrations from zero');
      continue;
    }
    await apply(names.slice(0, cut));
    const [role, user, product, warehouse, bom, version, route, operation] = Array.from(
      { length: 8 },
      randomUUID,
    );
    await db.query(`INSERT INTO roles(id,code,name) VALUES ($1,'ADMIN','C2')`, [role]);
    await db.query(
      `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at) VALUES ($1,'c2@example.test','fixture','C2',$2,now())`,
      [user, role],
    );
    await db.query(
      `INSERT INTO products(id,code,name,category,type,unit,is_lot_tracked,requires_quality_inspection,updated_at) VALUES ($1,'C2','Product','C2','FINISHED_GOOD','UNIT',true,true,now())`,
      [product],
    );
    await db.query(
      `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'W','Warehouse','C2',now())`,
      [warehouse],
    );
    await db.query(
      `INSERT INTO bills_of_material(id,product_id,name,updated_at) VALUES ($1,$2,'BOM',now())`,
      [bom, product],
    );
    await db.query(
      `INSERT INTO bom_versions(id,bom_id,version,output_quantity,created_by_user_id) VALUES ($1,$2,1,1,$3)`,
      [version, bom, user],
    );
    await db.query(
      `INSERT INTO production_routes(id,product_id,code,name,updated_at) VALUES ($1,$2,'RT','C1 route',now())`,
      [route, product],
    );
    await db.query(
      `INSERT INTO route_operations(id,route_id,sequence,name,standard_minutes,updated_at) VALUES ($1,$2,10,'Mix',15,now())`,
      [operation, route],
    );
    const lots = [];
    let rejectedInspection;
    for (const status of ['QUARANTINED', 'RELEASED', 'REJECTED']) {
      const [order, lot, inspection, reading] = Array.from({ length: 4 }, randomUUID);
      lots.push(lot);
      await db.query(
        `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,quantity_produced,status,started_at,completed_at,created_by_user_id,updated_at) VALUES ($1::uuid,left($1::text,24),$2,$3,$4,125,125,'COMPLETED',now(),now(),$5,now())`,
        [order, product, version, warehouse, user],
      );
      await db.query(
        `INSERT INTO lots(id,code,product_id,status,originated_at,production_order_id) VALUES ($1::uuid,$1::text,$2,$3,now(),$4)`,
        [lot, product, status, order],
      );
      await db.query(
        `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,production_order_id) VALUES ($1,$2,$3,$4,'PRODUCTION_OUTPUT',125,$5,$6)`,
        [randomUUID(), product, warehouse, lot, user, order],
      );
      if (status !== 'QUARANTINED')
        await db.query(
          `INSERT INTO quality_inspections(id,lot_id,result,observations,non_conformities,inspected_by_user_id) VALUES ($1,$2,$3,'Human inspection','Original defects',$4)`,
          [inspection, lot, status === 'REJECTED' ? 'REJECTED' : 'APPROVED', user],
        );
      if (status === 'REJECTED') rejectedInspection = inspection;
      const device = randomUUID();
      await db.query(
        `INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1::uuid,$1::text,'C2 device',now())`,
        [device],
      );
      await db.query(
        `INSERT INTO iiot_readings(id,production_order_id,device_id,metric,value,unit,recorded_at) VALUES ($1,$2,$3,'TEMPERATURE',50,'C',now())`,
        [reading, order, device],
      );
      await db.query(
        `INSERT INTO iiot_alerts(id,production_order_id,type,severity,message) VALUES ($1,$2,'C2','CRITICAL','Evidence')`,
        [randomUUID(), order],
      );
    }
    const before = await snapshot();
    await apply(names.slice(cut));
    const after = await snapshot();
    for (const [table, rows] of Object.entries(before)) assert.deepEqual(after[table], rows, table);
    const values = [randomUUID(), lots[2], rejectedInspection, user];
    const insert = `INSERT INTO quality_dispositions(id,lot_id,inspection_id,type,reason,decided_by_user_id) VALUES ($1,$2,$3,'SCRAP',$5,$4)`;
    for (const reason of [' ', '\t\n'])
      await assert.rejects(
        db.query(insert, [...values, reason]),
        (e) => e.constraint === 'quality_dispositions_reason_check',
      );
    await db.query(insert, [...values, 'Human disposal']);
    await assert.rejects(
      db.query(insert, [randomUUID(), ...values.slice(1), 'Duplicate']),
      (e) => e.code === '23505',
    );
    await assert.rejects(
      db.query(`UPDATE quality_dispositions SET reason='edited' WHERE id=$1`, [values[0]]),
      (e) => e.code === '55000',
    );
    await assert.rejects(
      db.query(`DELETE FROM quality_dispositions WHERE id=$1`, [values[0]]),
      (e) => e.code === '55000',
    );
    await db.query(`UPDATE lots SET status='REWORK' WHERE id=$1`, [lots[0]]);
    await db.query(`UPDATE lots SET status='SCRAPPED' WHERE id=$1`, [lots[2]]);
    await db.query(
      `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id) VALUES ($1,$2,$3,$4,'QUALITY_SCRAP',-125,$5)`,
      [randomUUID(), product, warehouse, lots[2], user],
    );
    await assert.rejects(
      db.query(
        `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id) VALUES ($1,$2,$3,$4,'QUALITY_SCRAP',125,$5)`,
        [randomUUID(), product, warehouse, lots[2], user],
      ),
      (e) => e.constraint === 'inventory_movements_origin_check',
    );
    assert.equal(
      (await db.query(`SELECT result FROM quality_inspections WHERE id=$1`, [rejectedInspection]))
        .rows[0].result,
      'REJECTED',
    );
    console.log(
      'PASS C2 ' +
        (upgrade ? 'upgrade' : 'from zero') +
        ': historical lots/inspections/ledger/IIoT/C1 preserved; enum states, reason, uniqueness, immutable disposition, scrap sign',
    );
  }
} finally {
  await db.query('SET search_path TO public').catch(() => {});
  for (const schema of schemas)
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
