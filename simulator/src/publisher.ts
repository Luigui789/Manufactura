import { setTimeout as delay } from 'node:timers/promises';
import { connect, type MqttClient } from 'mqtt';
import type { Config } from './config.js';
import { createScenario } from './scenarios/index.js';
import type { Telemetry } from './telemetry.js';

export const CONNECTION_TIMEOUT_MS = 10_000;
export const CLOSE_TIMEOUT_MS = 2_000;

async function publish(
  client: MqttClient,
  topic: string,
  payload: Telemetry,
  signal: AbortSignal,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    await Promise.race([
      client.publishAsync(topic, JSON.stringify(payload), { qos: 0, retain: false }),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error('Simulation interrupted'));
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(
          () => reject(new Error('MQTT publication timed out')),
          CONNECTION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

function waitConnected(client: MqttClient, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Simulation interrupted'));
  if (client.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off('connect', connected);
      signal.removeEventListener('abort', aborted);
    };
    const connected = () => {
      cleanup();
      resolve();
    };
    const aborted = () => {
      cleanup();
      reject(new Error('Simulation interrupted'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('MQTT broker connection timed out after 10 seconds'));
    }, CONNECTION_TIMEOUT_MS);
    client.once('connect', connected);
    signal.addEventListener('abort', aborted, { once: true });
  });
}

async function close(client: MqttClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.endAsync(false),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          // MQTT.js ignores another end(force) once graceful disconnect began.
          // Destroy the transport to finish that disconnect even under backpressure.
          client.stream.destroy();
          resolve();
        }, CLOSE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runSimulation(
  config: Config,
  signal: AbortSignal,
  log: (line: string) => void = console.log,
): Promise<void> {
  const client = connect(config.mqttUrl, {
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
    queueQoSZero: false,
  });
  // MQTT errors may contain the URL/credentials; log only fixed messages.
  client.on('error', () => log('MQTT connection error; waiting for broker'));
  const topic = `ecosoap/production/${config.productionOrderId}/${config.deviceCode}/telemetry`;
  const next = createScenario(config);
  try {
    await waitConnected(client, signal);
    log(
      `Connected to MQTT broker\nProcess: ${config.process}\nScenario: ${config.scenario}\nProduction order: ${config.productionOrderId}\nDevice: ${config.deviceCode}`,
    );
    for (let index = 0; index < config.samples && !signal.aborted; index++) {
      await waitConnected(client, signal);
      const payload: Telemetry = { recordedAt: new Date().toISOString(), metrics: next() };
      try {
        await publish(client, topic, payload, signal);
        log(`Sample ${index + 1}/${config.samples} published`);
      } catch {
        // Do not replay a QoS 0 sample: the broker may already have received it.
        if (client.connected) throw new Error('MQTT telemetry publication failed');
        log(`Sample ${index + 1}/${config.samples} lost during disconnect (QoS 0)`);
      }
      if (index + 1 < config.samples) await delay(config.intervalMs, undefined, { signal });
    }
    if (!signal.aborted) log('Simulation completed');
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    await close(client);
  }
}
