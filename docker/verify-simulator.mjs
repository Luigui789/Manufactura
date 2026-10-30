import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { execPath } from 'node:process';

const exec = promisify(execFile);

/** Provision/check externally; the simulator receives only MQTT + simulation config. */
export async function verifySimulator(Client, orderId, suffix) {
  assert.ok(process.env.POSTGRES_DB?.endsWith('_test'), 'Se requiere una base _test');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { createScenario } = await import('/app/simulator/dist/scenarios/index.js');
    const { parseTelemetry } = await import('/app/backend/dist/iiot/mqtt/mqtt-message.parser.js');
    // Exercise the actual Phase 3 parser for every generated profile, test only.
    for (const process of ['bar', 'liquid']) {
      for (const scenario of ['normal', 'deviation']) {
        const next = createScenario({ process, scenario, samples: 60, seed: 42 });
        for (let i = 0; i < 60; i++) {
          parseTelemetry(
            `ecosoap/production/${orderId}/CONTRACT-01/telemetry`,
            Buffer.from(JSON.stringify({ recordedAt: new Date().toISOString(), metrics: next() })),
          );
        }
      }
    }
    const alertsBefore = (await db.query('SELECT count(*) FROM iiot_alerts')).rows[0].count;
    for (const process of ['bar', 'liquid']) {
      const id = randomUUID();
      const code = `SIM-${process}-${suffix}`;
      await db.query('INSERT INTO iiot_devices(id,code,name,updated_at) VALUES ($1,$2,$3,now())', [
        id,
        code,
        'Isolated simulator fixture',
      ]);
      const expected = [];
      const next = createScenario({ process, scenario: 'normal', samples: 3, seed: 42 });
      for (let i = 0; i < 3; i++) expected.push(...next());
      const { stdout } = await exec(execPath, ['/app/simulator/dist/cli.js'], {
        env: {
          MQTT_URL: 'mqtt://mosquitto:1883',
          SIM_PRODUCTION_ORDER_ID: orderId,
          SIM_DEVICE_CODE: code,
          SIM_PROCESS: process,
          SIM_SCENARIO: 'normal',
          SIM_SAMPLES: '3',
          SIM_INTERVAL_MS: '25',
          SIM_SEED: '42',
        },
        timeout: 20000,
      });
      assert.match(stdout, /Simulation completed/);
      const deadline = Date.now() + 10000;
      let rows = [];
      while (Date.now() < deadline) {
        rows = (
          await db.query(
            'SELECT production_order_id,device_id,metric,value::text,unit,recorded_at,received_at FROM iiot_readings WHERE production_order_id=$1 AND device_id=$2 ORDER BY recorded_at,metric::text',
            [orderId, id],
          )
        ).rows;
        if (rows.length >= expected.length) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(rows.length, expected.length, `${process} persisted row count`);
      // Compare the entire deterministic sequence, grouped by timestamp then metric.
      const actual = rows.map((r) => [r.metric, Number(r.value), r.unit]);
      const sorted = [];
      const width = process === 'bar' ? 2 : 4;
      for (let i = 0; i < expected.length; i += width)
        sorted.push(
          ...expected.slice(i, i + width).sort((a, b) => a.metric.localeCompare(b.metric)),
        );
      assert.deepEqual(
        actual,
        sorted.map((r) => [r.metric, r.value, r.unit]),
      );
      for (const row of rows) {
        assert.equal(row.production_order_id, orderId);
        assert.equal(row.device_id, id);
        assert.ok(row.recorded_at instanceof Date);
        assert.ok(row.received_at instanceof Date);
      }
      console.log(
        `Docker: simulator ${process}-normal → Mosquitto → NestJS → PostgreSQL: expected=${expected.length}, actual=${rows.length}`,
      );
    }
    assert.equal((await db.query('SELECT count(*) FROM iiot_alerts')).rows[0].count, alertsBefore);
    console.log('Docker: all four simulator profiles pass parseTelemetry; no alerts created.');
  } finally {
    await db.end();
  }
}
