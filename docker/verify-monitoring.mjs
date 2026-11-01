import assert from 'node:assert/strict';

/** Capture every persisted field so inspection cannot silently mutate IIoT evidence. */
export async function qualityEvidence(Client, orderId, lotId) {
  assert.ok(process.env.POSTGRES_DB?.endsWith('_test'), 'Se requiere una base _test');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return {
      readings: (
        await db.query('SELECT * FROM iiot_readings WHERE production_order_id=$1 ORDER BY id', [
          orderId,
        ])
      ).rows,
      alerts: (
        await db.query('SELECT * FROM iiot_alerts WHERE production_order_id=$1 ORDER BY id', [
          orderId,
        ])
      ).rows,
      lot: (await db.query('SELECT status FROM lots WHERE id=$1', [lotId])).rows[0],
      inspection: (await db.query('SELECT * FROM quality_inspections WHERE lot_id=$1', [lotId]))
        .rows,
      movements: (
        await db.query(
          'SELECT * FROM inventory_movements WHERE production_order_id=$1 ORDER BY id',
          [orderId],
        )
      ).rows,
    };
  } finally {
    await db.end();
  }
}

/** Real HTTP reconciliation after simulator normal/deviation → MQTT → ingestion. */
export async function verifyMonitoring(Client, api, Cookie, orderId, status) {
  assert.ok(process.env.POSTGRES_DB?.endsWith('_test'), 'Se requiere una base _test');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const tables = [
    'production_orders',
    'iiot_readings',
    'iiot_alerts',
    'lots',
    'quality_inspections',
    'inventory_movements',
  ];
  const counts = async () =>
    Promise.all(
      tables.map(
        async (table) =>
          (await db.query(`SELECT count(*)::int AS total FROM ${table}`)).rows[0].total,
      ),
    );
  try {
    const before = await counts();
    const responses = {};
    for (const endpoint of ['overview', 'readings', 'alerts']) {
      const url = `${api}/iiot/production-orders/${orderId}/${endpoint}`;
      assert.equal((await fetch(url)).status, 401);
      const response = await fetch(url, { headers: { Cookie } });
      assert.equal(response.status, 200, endpoint);
      responses[endpoint] = await response.json();
    }
    const { data: overview } = responses.overview;
    assert.equal(overview.productionOrder.status, status);
    const readings = (
      await db.query(
        'SELECT count(*)::int AS total, max(recorded_at) AS last FROM iiot_readings WHERE production_order_id=$1',
        [orderId],
      )
    ).rows[0];
    assert.ok(readings.total > 0);
    assert.equal(overview.telemetry.totalReadings, readings.total);
    assert.equal(overview.telemetry.lastReadingAt, readings.last.toISOString());
    const latest = (
      await db.query(
        `SELECT DISTINCT ON (metric) id,metric,value::text FROM iiot_readings
       WHERE production_order_id=$1 ORDER BY metric,recorded_at DESC,id DESC`,
        [orderId],
      )
    ).rows;
    assert.deepEqual(
      overview.telemetry.latestByMetric.map(({ id, metric, value }) => ({ id, metric, value })),
      latest,
    );
    const alerts = (
      await db.query(
        `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE severity='WARNING')::int AS warning,
       count(*) FILTER (WHERE severity='CRITICAL')::int AS critical,
       count(*) FILTER (WHERE acknowledged_at IS NULL)::int AS unacknowledged,
       max(created_at) AS "lastAlertAt" FROM iiot_alerts WHERE production_order_id=$1`,
        [orderId],
      )
    ).rows[0];
    assert.ok(alerts.warning > 0 && alerts.critical > 0);
    assert.deepEqual(overview.alerts, { ...alerts, lastAlertAt: alerts.lastAlertAt.toISOString() });
    for (const [endpoint, table, time] of [
      ['readings', 'iiot_readings', 'recorded_at'],
      ['alerts', 'iiot_alerts', 'created_at'],
    ]) {
      const expected = (
        await db.query(
          `SELECT id FROM ${table} WHERE production_order_id=$1 ORDER BY ${time} DESC,id DESC LIMIT 20`,
          [orderId],
        )
      ).rows.map((row) => row.id);
      assert.deepEqual(
        responses[endpoint].data.map((row) => row.id),
        expected,
      );
      assert.deepEqual(responses[endpoint].meta, {
        page: 1,
        limit: 20,
        total: endpoint === 'readings' ? readings.total : alerts.total,
      });
    }
    for (const reading of responses.readings.data) {
      assert.equal(typeof reading.value, 'string');
      assert.match(reading.value, /^-?\d+\.\d{4}$/);
      assert.deepEqual(Object.keys(reading.device).sort(), ['code', 'id', 'name']);
    }
    for (const alert of responses.alerts.data) {
      assert.ok(alert.reading?.device?.id);
      assert.equal(typeof alert.reading.value, 'string');
    }
    assert.deepEqual(await counts(), before, 'Monitoring HTTP must remain read-only');
    console.log(`Docker: monitoring HTTP reconciled with PostgreSQL (${status}, read-only).`);
  } finally {
    await db.end();
  }
}
