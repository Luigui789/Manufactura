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
const target = names.indexOf('20261031000000_production_routes');
assert(target > 0);
const schemas = [];
async function apply(list) {
  for (const name of list)
    await db.query(await readFile(new URL(name + '/migration.sql', root), 'utf8'));
}
try {
  await db.connect();
  for (const upgrade of [false, true]) {
    const schema = 'routes_' + randomUUID().replaceAll('-', '');
    schemas.push(schema);
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    await apply(names.slice(0, target));
    const product = randomUUID();
    if (upgrade)
      await db.query(
        `INSERT INTO products(id,code,name,category,type,unit,updated_at) VALUES ($1,'OUTPUT','Existing product','C1','FINISHED_GOOD','UNIT',now())`,
        [product],
      );
    const before = await db.query('SELECT to_jsonb(t) AS row FROM products t ORDER BY id');
    await apply(names.slice(target));
    assert.deepEqual(
      (await db.query('SELECT to_jsonb(t) AS row FROM products t ORDER BY id')).rows,
      before.rows,
    );
    if (!upgrade)
      await db.query(
        `INSERT INTO products(id,code,name,category,type,unit,updated_at) VALUES ($1,'OUTPUT','New product','C1','FINISHED_GOOD','UNIT',now())`,
        [product],
      );
    const route = randomUUID();
    await db.query(
      `INSERT INTO production_routes(id,product_id,code,name,updated_at) VALUES ($1,$2,'RT','Route',now())`,
      [route, product],
    );
    await db.query(
      `INSERT INTO route_operations(id,route_id,sequence,name,standard_minutes,updated_at) VALUES ($1,$2,10,'Mix',0.10,now())`,
      [randomUUID(), route],
    );
    for (const [sequence, name, minutes, constraint] of [
      [0, 'Mix', '1', 'route_operations_sequence_check'],
      [20, ' ', '1', 'route_operations_name_check'],
      [20, 'Mix', '0', 'route_operations_minutes_check'],
      [10, 'Mix', '1', 'route_operations_route_id_sequence_key'],
    ]) {
      await assert.rejects(
        db.query(
          `INSERT INTO route_operations(id,route_id,sequence,name,standard_minutes,updated_at) VALUES ($1,$2,$3,$4,$5,now())`,
          [randomUUID(), route, sequence, name, minutes],
        ),
        (e) => e.constraint === constraint,
      );
    }
    for (const [column, constraint] of [
      ['code', 'production_routes_code_check'],
      ['name', 'production_routes_name_check'],
    ])
      await assert.rejects(
        db.query(`UPDATE production_routes SET ${column}=' ' WHERE id=$1`, [route]),
        (e) => e.constraint === constraint,
      );
    await assert.rejects(
      db.query(
        `INSERT INTO production_routes(id,product_id,code,name,updated_at) VALUES ($1,$2,'RT2','Duplicate',now())`,
        [randomUUID(), product],
      ),
      (e) => e.constraint === 'production_routes_product_id_key',
    );
    await assert.rejects(
      db.query('DELETE FROM production_routes WHERE id=$1', [route]),
      (e) => e.constraint === 'route_operations_route_id_fkey',
    );
    console.log(
      'PASS routes migration: ' +
        (upgrade ? 'upgrade preserves products' : 'from zero') +
        '; checks, uniqueness, FK restrict',
    );
  }
} finally {
  await db.query('SET search_path TO public').catch(() => {});
  for (const schema of schemas)
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
