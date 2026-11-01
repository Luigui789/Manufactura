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
const cut = names.indexOf('20261031020000_sustainability_enums');
assert(cut > 0, 'C3 migrations must exist after C2');
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
const rejects = (promise, check, label) =>
  assert.rejects(promise, check, label).then(() => console.log('  constraint ok: ' + label));
try {
  await db.connect();
  for (const upgrade of [false, true]) {
    const schema = 'c3_' + randomUUID().replaceAll('-', '');
    schemas.push(schema);
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`SET search_path TO "${schema}"`);
    if (!upgrade) {
      await apply(names);
      for (const table of [
        'emission_factors',
        'production_footprints',
        'carbon_activities',
        'circular_material_profiles',
      ])
        assert.equal((await db.query(`SELECT count(*) FROM ${table}`)).rows[0].count, '0');
      console.log('PASS C3 migrations from zero');
      continue;
    }
    // Estado C2 completo: catálogo, ledger, C1 rutas, IIoT, inspección y disposición.
    await apply(names.slice(0, cut));
    const [role, user, product, raw, warehouse, bom, version, route, operation] = Array.from(
      { length: 9 },
      randomUUID,
    );
    await db.query(`INSERT INTO roles(id,code,name) VALUES ($1,'ADMIN','C3')`, [role]);
    await db.query(
      `INSERT INTO users(id,email,password_hash,full_name,role_id,updated_at) VALUES ($1,'c3@example.test','fixture','C3',$2,now())`,
      [user, role],
    );
    await db.query(
      `INSERT INTO products(id,code,name,category,type,unit,is_lot_tracked,requires_quality_inspection,updated_at) VALUES ($1,'C3-PT','Jabón','C3','FINISHED_GOOD','UNIT',true,true,now())`,
      [product],
    );
    await db.query(
      `INSERT INTO products(id,code,name,category,type,unit,updated_at) VALUES ($1,'C3-OIL','Aceite usado','C3','RAW_MATERIAL','MILLILITER',now())`,
      [raw],
    );
    await db.query(
      `INSERT INTO warehouses(id,code,name,location,updated_at) VALUES ($1,'W','Warehouse','C3',now())`,
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
      `INSERT INTO bom_items(id,bom_version_id,component_product_id,quantity) VALUES ($1,$2,$3,500)`,
      [randomUUID(), version, raw],
    );
    await db.query(
      `INSERT INTO production_routes(id,product_id,code,name,updated_at) VALUES ($1,$2,'RT','C1 route',now())`,
      [route, product],
    );
    await db.query(
      `INSERT INTO route_operations(id,route_id,sequence,name,standard_minutes,updated_at) VALUES ($1,$2,10,'Mix',15,now())`,
      [operation, route],
    );
    await db.query(
      `INSERT INTO inventory_movements(id,product_id,warehouse_id,type,quantity,reason,performed_by_user_id) VALUES ($1,$2,$3,'ADJUSTMENT_IN',300000,'INITIAL_LOAD',$4)`,
      [randomUUID(), raw, warehouse, user],
    );
    const orders = [];
    for (const status of ['RELEASED', 'REJECTED']) {
      const [order, lot, inspection, consumption] = Array.from({ length: 4 }, randomUUID);
      orders.push({ order, lot, consumption });
      await db.query(
        `INSERT INTO production_orders(id,number,product_id,bom_version_id,warehouse_id,quantity_planned,quantity_produced,status,started_at,completed_at,created_by_user_id,updated_at) VALUES ($1::uuid,left($1::text,24),$2,$3,$4,200,200,'COMPLETED',now(),now(),$5,now())`,
        [order, product, version, warehouse, user],
      );
      await db.query(
        `INSERT INTO lots(id,code,product_id,status,originated_at,production_order_id) VALUES ($1::uuid,$1::text,$2,$3,now(),$4)`,
        [lot, product, status, order],
      );
      await db.query(
        `INSERT INTO inventory_movements(id,product_id,warehouse_id,type,quantity,performed_by_user_id,production_order_id) VALUES ($1,$2,$3,'PRODUCTION_CONSUMPTION',-100000,$4,$5)`,
        [consumption, raw, warehouse, user, order],
      );
      await db.query(
        `INSERT INTO inventory_movements(id,product_id,warehouse_id,lot_id,type,quantity,performed_by_user_id,production_order_id) VALUES ($1,$2,$3,$4,'PRODUCTION_OUTPUT',200,$5,$6)`,
        [randomUUID(), product, warehouse, lot, user, order],
      );
      await db.query(
        `INSERT INTO quality_inspections(id,lot_id,result,observations,non_conformities,inspected_by_user_id) VALUES ($1,$2,$3::"QualityResult",'Inspección',CASE WHEN $3::"QualityResult" = 'REJECTED' THEN 'Defecto' END,$4)`,
        [inspection, lot, status === 'REJECTED' ? 'REJECTED' : 'APPROVED', user],
      );
      if (status === 'REJECTED')
        await db.query(
          `INSERT INTO quality_dispositions(id,lot_id,inspection_id,type,reason,decided_by_user_id) VALUES ($1,$2,$3,'REWORK','C2 histórico',$4)`,
          [randomUUID(), lot, inspection, user],
        );
      const device = randomUUID();
      await db.query(
        `INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1::uuid,$1::text,'C3 device',now())`,
        [device],
      );
      await db.query(
        `INSERT INTO iiot_readings(id,production_order_id,device_id,metric,value,unit,recorded_at) VALUES ($1,$2,$3,'PH',9.5,'pH',now())`,
        [randomUUID(), order, device],
      );
      await db.query(
        `INSERT INTO iiot_alerts(id,production_order_id,type,severity,message) VALUES ($1,$2,'C3','WARNING','Evidence')`,
        [randomUUID(), order],
      );
    }
    const before = await snapshot();
    await apply(names.slice(cut));
    const after = await snapshot();
    for (const [table, rows] of Object.entries(before)) assert.deepEqual(after[table], rows, table);
    console.log(
      'PASS C3 upgrade from C2: catalog, ledger, C1 routes, IIoT, inspections and C2 dispositions preserved',
    );

    // --- Restricciones físicas C3 ---
    const factor = (code, value, extra = {}) =>
      db.query(
        `INSERT INTO emission_factors(id,code,name,category,activity_unit,kg_co2e_per_unit,product_id,source_name,source_reference,is_active,created_by_user_id,updated_at)
         VALUES ($1,$2,'TEST','RAW_MATERIAL',$3,$4,$5,$6,$7,$8,$9,now()) RETURNING id`,
        [
          randomUUID(),
          code,
          extra.unit ?? 'LITER',
          value,
          extra.product ?? null,
          extra.sourceName ?? 'TEST_FIXTURE',
          extra.sourceReference ?? 'TEST_FIXTURE',
          extra.active ?? true,
          user,
        ],
      );
    await rejects(
      factor('TEST-NEG', -0.1),
      (e) => e.constraint === 'emission_factors_value_check',
      'negative factor',
    );
    await rejects(
      factor('TEST-ANON', 1, { sourceName: ' \t' }),
      (e) => e.constraint === 'emission_factors_source_check',
      'whitespace source name',
    );
    await rejects(
      factor('TEST-ANON2', 1, { sourceReference: '   ' }),
      (e) => e.constraint === 'emission_factors_source_check',
      'whitespace source reference',
    );
    const zero = (await factor('TEST-ZERO', 0)).rows[0].id;
    assert(zero);
    const oilFactor = (await factor('TEST-RAW-001', '0.10000000', { product: raw })).rows[0].id;
    await rejects(
      factor('TEST-RAW-002', 1, { product: raw }),
      (e) => e.code === '23505',
      'one active factor per product',
    );
    await factor('TEST-RAW-OLD', 1, { product: raw, active: false });
    await rejects(factor('TEST-RAW-001', 1), (e) => e.code === '23505', 'unique factor code');

    const [{ order, lot, consumption }, other] = orders;
    const footprint = randomUUID();
    await rejects(
      db.query(
        `INSERT INTO production_footprints(id,production_order_id,lot_id,scope,quantity_produced_snapshot,output_unit_snapshot,updated_at) VALUES ($1,$2,$3,'PARTIAL_CRADLE_TO_GATE',200,'UNIT',now())`,
        [randomUUID(), order, other.lot],
      ),
      (e) => e.code === '23503',
      'footprint lot belongs to its order',
    );
    await rejects(
      db.query(
        `INSERT INTO production_footprints(id,production_order_id,lot_id,scope,quantity_produced_snapshot,output_unit_snapshot,updated_at) VALUES ($1,$2,$3,'PARTIAL_CRADLE_TO_GATE',0,'UNIT',now())`,
        [randomUUID(), order, lot],
      ),
      (e) => e.constraint === 'production_footprints_values_check',
      'positive produced quantity',
    );
    await db.query(
      `INSERT INTO production_footprints(id,production_order_id,lot_id,scope,quantity_produced_snapshot,output_unit_snapshot,updated_at) VALUES ($1,$2,$3,'PARTIAL_CRADLE_TO_GATE',200,'UNIT',now())`,
      [footprint, order, lot],
    );
    const activity = (movement, extra = {}) =>
      db.query(
        `INSERT INTO carbon_activities(id,footprint_id,category,source,description,activity_quantity,activity_unit,original_quantity,original_unit,emission_factor_id,factor_code_snapshot,factor_name_snapshot,factor_value_snapshot,factor_source_name_snapshot,factor_source_reference_snapshot,emissions_kg_co2e,inventory_movement_id,created_by_user_id,updated_at)
         VALUES ($1,$2,'RAW_MATERIAL',$3,'Consumo',100,'LITER',$4,$5,$6,'TEST-RAW-001','TEST',0.1,'TEST_FIXTURE','TEST_FIXTURE',$7,$8,$9,now()) RETURNING id`,
        [
          randomUUID(),
          footprint,
          extra.source ?? 'PRODUCTION_CONSUMPTION',
          extra.source === 'MANUAL' ? null : 100000,
          extra.source === 'MANUAL' ? null : 'MILLILITER',
          oilFactor,
          extra.emissions ?? 10,
          movement,
          extra.source === 'MANUAL' ? user : null,
        ],
      );
    await rejects(
      activity(other.consumption),
      (e) => e.code === '23514',
      'automatic activity requires consumption of the same order',
    );
    await rejects(
      activity(consumption, { emissions: -1 }),
      (e) => e.constraint === 'carbon_activities_values_check',
      'non-negative emissions',
    );
    await rejects(
      activity(null),
      (e) => e.constraint === 'carbon_activities_source_check',
      'automatic activity needs its movement',
    );
    const auto = (await activity(consumption)).rows[0].id;
    await rejects(activity(consumption), (e) => e.code === '23505', 'one activity per movement');
    const manual = (await activity(null, { source: 'MANUAL' })).rows[0].id;
    await rejects(
      db.query(`UPDATE production_footprints SET status='FINALIZED' WHERE id=$1`, [footprint]),
      (e) => e.constraint === 'production_footprints_finalization_check',
      'complete finalization',
    );
    await db.query(
      `UPDATE production_footprints SET status='FINALIZED', total_kg_co2e=20, kg_co2e_per_output_unit=0.1, boundary_notes='Incluye MP y energía', calculated_at=now(), finalized_at=now(), finalized_by_user_id=$2 WHERE id=$1`,
      [footprint, user],
    );
    for (const [sql, label] of [
      [
        `UPDATE production_footprints SET total_kg_co2e=0 WHERE id='${footprint}'`,
        'finalized footprint immutable',
      ],
      [`DELETE FROM production_footprints WHERE id='${footprint}'`, 'footprint never deleted'],
      [
        `UPDATE carbon_activities SET emissions_kg_co2e=0 WHERE id='${auto}'`,
        'finalized activity immutable',
      ],
      [`DELETE FROM carbon_activities WHERE id='${manual}'`, 'finalized activity not deleted'],
    ])
      await rejects(db.query(sql), (e) => e.code === '55000', label);
    await rejects(
      activity(null, { source: 'MANUAL' }),
      (e) => e.code === '55000',
      'no activity after finalization',
    );
    await db.query(`UPDATE emission_factors SET kg_co2e_per_unit=0.9 WHERE id=$1`, [oilFactor]);
    assert.equal(
      (await db.query(`SELECT factor_value_snapshot FROM carbon_activities WHERE id=$1`, [auto]))
        .rows[0].factor_value_snapshot,
      '0.10000000',
    );
    await db.query(
      `INSERT INTO circular_material_profiles(id,product_id,metric_code,display_name,reporting_unit,updated_at) VALUES ($1,$2,'USED_COOKING_OIL_RECOVERED','Aceite de cocina usado valorizado','LITER',now())`,
      [randomUUID(), raw],
    );
    await rejects(
      db.query(
        `INSERT INTO circular_material_profiles(id,product_id,metric_code,display_name,reporting_unit,updated_at) VALUES ($1,$2,'OTHER','Dup','LITER',now())`,
        [randomUUID(), raw],
      ),
      (e) => e.code === '23505',
      'one circular profile per product',
    );
    // Nada de C3 modifica el historial previo.
    const final = await snapshot();
    for (const [table, rows] of Object.entries(before)) {
      if (table === 'emission_factors') continue;
      assert.deepEqual(final[table], rows, table + ' preserved after C3 writes');
    }
    console.log(
      'PASS C3 constraints: non-negative documented factors, one active per product, ledger-bound activities, snapshots, immutable finalization, circular uniqueness',
    );
  }
} finally {
  await db.query('SET search_path TO public').catch(() => {});
  for (const schema of schemas)
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await db.end();
}
