import assert from 'node:assert/strict';

/** Exercise the same HTTP action used by the ERP button, with the real CLI and MQTT. */
export async function verifySimulation(api, Cookie, origin, orderId, request) {
  const url = `${api}/iiot/production-orders/${orderId}/simulation`;
  const before = await request(`/production/orders/${orderId}`);
  const launch = () =>
    fetch(url, {
      method: 'POST',
      headers: { Cookie, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ process: 'liquid', scenario: 'deviation' }),
    });
  assert.equal((await fetch(url)).status, 401);
  const started = await launch();
  assert.equal(started.status, 202);
  const { data: run } = await started.json();
  assert.equal(run.status, 'RUNNING');
  assert.match(run.deviceCode, /^DEMO-/);
  assert.equal((await launch()).status, 409);
  const deadline = Date.now() + 90_000;
  let current = run;
  while (current.status === 'RUNNING' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    current = await request(`/iiot/production-orders/${orderId}/simulation`);
  }
  assert.equal(current.status, 'COMPLETED', JSON.stringify(current));
  assert.equal(current.publishedSamples, 60);
  assert.equal(current.receivedReadings, 240);
  const overview = await request(`/iiot/production-orders/${orderId}/overview`);
  assert.ok(overview.alerts.warning > 0 && overview.alerts.critical > 0);
  assert.deepEqual(await request(`/production/orders/${orderId}`), before);
  assert.equal(before.lot, null);
  console.log(
    'Docker: ERP simulation API → provisioned device → real CLI → MQTT → 240 readings + alerts; OP unchanged and duplicate run rejected.',
  );
}
