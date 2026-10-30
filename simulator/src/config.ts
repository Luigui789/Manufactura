import { parseArgs } from 'node:util';

export type Process = 'bar' | 'liquid';
export type Scenario = 'normal' | 'deviation';
export type Config = {
  productionOrderId: string;
  deviceCode: string;
  process: Process;
  scenario: Scenario;
  samples: number;
  intervalMs: number;
  seed: number;
  mqttUrl: string;
};

function integer(name: string, value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return parsed;
}

export function parseConfig(args: string[], env: NodeJS.ProcessEnv = process.env): Config {
  // pnpm forwards the optional separator to scripts.
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: Object.fromEntries(
      ['order', 'device', 'process', 'scenario', 'samples', 'interval-ms', 'seed', 'mqtt-url'].map(
        (key) => [key, { type: 'string' as const }],
      ),
    ),
    strict: true,
    allowPositionals: false,
  });
  const productionOrderId = values.order ?? env.SIM_PRODUCTION_ORDER_ID ?? '';
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productionOrderId,
    ) &&
    !/^(?:00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(
      productionOrderId,
    )
  )
    throw new Error('productionOrderId (--order / SIM_PRODUCTION_ORDER_ID) must be a UUID');
  const deviceCode = values.device ?? env.SIM_DEVICE_CODE ?? '';
  if (
    !deviceCode ||
    deviceCode.length > 80 ||
    deviceCode.trim() !== deviceCode ||
    /[/+#]/.test(deviceCode) ||
    [...deviceCode].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error(
      'deviceCode must be 1–80 characters, without topic wildcards, controls or surrounding spaces',
    );
  const process = values.process ?? env.SIM_PROCESS;
  if (process !== 'bar' && process !== 'liquid') throw new Error('process must be bar or liquid');
  const scenario = values.scenario ?? env.SIM_SCENARIO;
  if (scenario !== 'normal' && scenario !== 'deviation')
    throw new Error('scenario must be normal or deviation');
  const mqttUrl = values['mqtt-url'] ?? env.MQTT_URL ?? 'mqtt://localhost:1883';
  try {
    const url = new URL(mqttUrl);
    if (
      !['mqtt:', 'mqtts:'].includes(url.protocol) ||
      !url.hostname ||
      url.hash ||
      url.search ||
      (url.pathname && url.pathname !== '/')
    )
      throw new Error();
  } catch {
    throw new Error('MQTT URL must be a valid mqtt:// or mqtts:// broker URL');
  }
  return {
    productionOrderId,
    deviceCode,
    process,
    scenario,
    mqttUrl,
    samples: integer(
      'samples',
      values.samples ?? env.SIM_SAMPLES ?? '60',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    intervalMs: integer(
      'intervalMs',
      values['interval-ms'] ?? env.SIM_INTERVAL_MS ?? '1000',
      1,
      3_600_000,
    ),
    seed: integer('seed', values.seed ?? env.SIM_SEED ?? '42', 0, 0xffffffff),
  };
}
