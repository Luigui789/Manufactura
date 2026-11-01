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
  throw new Error('IIoT migration proofs require a dedicated *_test database');
const db = new Client({ connectionString: url });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');
const names = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
const migration = '20261030040000_iiot_data_model';
const cut = names.indexOf(migration);
assert(cut > 0);
const schemas = [];
async function isolated(label) {
  const schema = `iiot_${label}_${randomUUID().replaceAll('-', '')}`;
  schemas.push(schema);
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET search_path TO "${schema}"`);
  return schema;
}
async function apply(list) {
  for (const name of list)
    await db.query(await readFile(path.join(root, name, 'migration.sql'), 'utf8'));
}
async function snapshot() {
  const tables = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename`,
  );
  const result = {};
  for (const { tablename } of tables.rows)
    result[tablename] = (
      await db.query(`SELECT to_jsonb(t) AS row FROM "${tablename}" t ORDER BY id`)
    ).rows;
  return result;
}
async function reject(sql, values, code, constraint) {
  await assert.rejects(
    db.query(sql, values),
    (error) => error.code === code && (!constraint || error.constraint === constraint),
  );
}

try {
  await db.connect();
  await isolated('fresh');
  await apply(names);
  assert.equal((await db.query('SELECT count(*) FROM iiot_readings')).rows[0].count, '0');
  console.log('PASS IIoT: complete migration history installs on an empty schema');

  const schema = await isolated('upgrade');
  await apply(names.slice(0, cut));
  const [role, user, product, warehouse, bom, version, orderA, orderB, device, reading, alert] =
    Array.from({ length: 11 }, () => randomUUID());
  await db.query(`INSERT INTO roles VALUES ($1,'ADMIN','IIoT proof')`, [role]);
  await db.query(
    `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at)
     VALUES ($1,'iiot-proof@example.test','fixture','IIoT proof',$2,now())`,
    [user, role],
  );
  await db.query(
    `INSERT INTO products(id,code,name,category,type,unit,updated_at)
     VALUES ($1,'IIOT-OUTPUT','Soap','Soap','FINISHED_GOOD','UNIT',now())`,
    [product],
  );
  await db.query(
    `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'IIOT-WH','WH','Plant',now())`,
    [warehouse],
  );
  await db.query(
    `INSERT INTO bills_of_material(id,product_id,name,updated_at) VALUES ($1,$2,'Soap',now())`,
    [bom, product],
  );
  await db.query(
    `INSERT INTO bom_versions(id,bom_id,version,output_quantity,created_by_user_id)
     VALUES ($1,$2,1,1,$3)`,
    [version, bom, user],
  );
  for (const [id, number] of [
    [orderA, 'OP-IIOT-A'],
    [orderB, 'OP-IIOT-B'],
  ])
    await db.query(
      `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,created_by_user_id,updated_at)
       VALUES ($1,$2,$3,$4,$5,1,$6,now())`,
      [id, number, product, version, warehouse, user],
    );
  const before = await snapshot();
  await apply(names.slice(cut));
  const after = await snapshot();
  for (const table of Object.keys(before)) assert.deepEqual(after[table], before[table], table);
  console.log('PASS IIoT: upgrade preserves every existing table and historical production orders');

  const insertDevice = `INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1,$2,'Curing',now()) RETURNING *`;
  const created = (await db.query(insertDevice, [device, 'CURING-01'])).rows[0];
  assert.equal(created.is_active, true);
  assert.equal(created.description, null);
  assert(created.created_at instanceof Date);
  await reject(insertDevice, [randomUUID(), 'CURING-01'], '23505', 'iiot_devices_code_key');
  await reject(insertDevice, [randomUUID(), ' '], '23514', 'iiot_devices_code_nonempty_check');
  await reject(insertDevice, [randomUUID(), 'x'.repeat(81)], '22001');

  const insertReading = `INSERT INTO iiot_readings(id,production_order_id,device_id,metric,value,unit,recorded_at)
    VALUES ($1,$2,$3,$4,$5,$6,'2026-10-30T00:00:00-06:00') RETURNING *`;
  const args = [reading, orderA, device, 'TEMPERATURE', '12345678901234.5678', '°C'];
  const receivedBefore = Date.now();
  const row = (await db.query(insertReading, args)).rows[0];
  assert.equal(row.production_order_id, orderA);
  assert.equal(row.device_id, device);
  assert.equal(row.value, '12345678901234.5678');
  assert.equal(row.recorded_at.toISOString(), '2026-10-30T06:00:00.000Z');
  assert(Math.abs(row.received_at.getTime() - receivedBefore) < 30000);
  await reject(
    insertReading,
    [randomUUID(), randomUUID(), ...args.slice(2)],
    '23503',
    'iiot_readings_production_order_id_fkey',
  );
  await reject(
    insertReading,
    [randomUUID(), orderA, randomUUID(), ...args.slice(3)],
    '23503',
    'iiot_readings_device_id_fkey',
  );
  await reject(insertReading, [randomUUID(), orderA, device, 'UNKNOWN', '1', '°C'], '22P02');
  await reject(
    insertReading,
    [randomUUID(), orderA, device, 'PH', 'NaN', 'pH'],
    '23514',
    'iiot_readings_value_finite_check',
  );
  await reject(
    insertReading,
    [randomUUID(), orderA, device, 'PH', '100000000000000', 'pH'],
    '22003',
  );
  await reject(
    insertReading,
    [randomUUID(), orderA, device, 'PH', '7', ' '],
    '23514',
    'iiot_readings_unit_nonempty_check',
  );
  await reject(insertReading, [randomUUID(), orderA, device, 'PH', '7', 'x'.repeat(17)], '22001');
  for (const [metric, unit, value] of [
    ['HUMIDITY', '%', '50'],
    ['PH', 'pH', '7.1234'],
    ['TANK_LEVEL', '%', '30'],
    ['MIXER_RPM', 'RPM', '100'],
    ['TEMPERATURE', '°C', '-10.1234'],
  ])
    await db.query(insertReading, [randomUUID(), orderA, device, metric, value, unit]);

  const insertAlert = `INSERT INTO iiot_alerts(id,production_order_id,reading_id,type,severity,message)
    VALUES ($1,$2,$3,'HIGH_TEMPERATURE',$4,'Telemetry deviation') RETURNING *`;
  const linked = (await db.query(insertAlert, [alert, orderA, reading, 'WARNING'])).rows[0];
  assert.equal(linked.reading_id, reading);
  assert.equal(linked.acknowledged_at, null);
  assert(linked.created_at instanceof Date);
  await db.query(insertAlert, [randomUUID(), orderB, null, 'CRITICAL']);
  await reject(
    insertAlert,
    [randomUUID(), orderB, reading, 'WARNING'],
    '23503',
    'iiot_alerts_reading_order_fkey',
  );
  await reject(
    insertAlert,
    [randomUUID(), orderA, randomUUID(), 'WARNING'],
    '23503',
    'iiot_alerts_reading_order_fkey',
  );
  await reject(
    insertAlert,
    [randomUUID(), randomUUID(), null, 'WARNING'],
    '23503',
    'iiot_alerts_production_order_id_fkey',
  );
  await reject(insertAlert, [randomUUID(), orderA, null, 'INFO'], '22P02');
  await reject(
    'UPDATE iiot_alerts SET production_order_id=$1 WHERE id=$2',
    [orderB, alert],
    '23503',
    'iiot_alerts_reading_order_fkey',
  );
  await reject(
    'UPDATE iiot_readings SET production_order_id=$1 WHERE id=$2',
    [orderB, reading],
    '23001',
    'iiot_alerts_reading_order_fkey',
  );
  await reject(
    'DELETE FROM iiot_devices WHERE id=$1',
    [device],
    '23001',
    'iiot_readings_device_id_fkey',
  );
  await reject(
    'DELETE FROM iiot_readings WHERE id=$1',
    [reading],
    '23001',
    'iiot_alerts_reading_order_fkey',
  );
  await reject('DELETE FROM production_orders WHERE id=$1', [orderA], '23001');
  await reject(
    'DELETE FROM production_orders WHERE id=$1',
    [orderB],
    '23001',
    'iiot_alerts_production_order_id_fkey',
  );
  console.log(
    'PASS IIoT: device uniqueness, decimal precision, timestamps, metric/severity enums, optional reading, same-order FK and RESTRICT (inserts, updates, deletes)',
  );

  const indexes = (
    await db.query(
      `SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename LIKE 'iiot_%' ORDER BY indexname`,
      [schema],
    )
  ).rows;
  for (const columns of [
    '(production_order_id, recorded_at)',
    '(production_order_id, metric, recorded_at)',
    '(device_id, recorded_at)',
    '(production_order_id, created_at)',
    '(reading_id, production_order_id)',
  ])
    assert(
      indexes.some(({ indexdef }) => indexdef.includes(columns)),
      columns,
    );
  console.log(
    'PASS IIoT: actual PostgreSQL indexes\n' + indexes.map(({ indexdef }) => indexdef).join('\n'),
  );
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.query('SET search_path TO public').catch(() => {});
  for (const schema of schemas)
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
