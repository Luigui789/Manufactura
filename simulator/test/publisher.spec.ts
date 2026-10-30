import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { CONNECTION_TIMEOUT_MS, runSimulation } from '../src/publisher.js';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('mqtt', () => ({ connect }));
class Client extends EventEmitter {
  connected = true;
  publishAsync = vi.fn().mockResolvedValue(undefined);
  endAsync = vi.fn().mockResolvedValue(undefined);
  stream = { destroy: vi.fn() };
}
const config = parseConfig([], {
  SIM_PRODUCTION_ORDER_ID: '019a3e10-0000-7000-8000-000000000001',
  SIM_DEVICE_CODE: 'CURING-01',
  SIM_PROCESS: 'bar',
  SIM_SCENARIO: 'normal',
  SIM_SAMPLES: '3',
  SIM_INTERVAL_MS: '1',
});
let client: Client;
beforeEach(() => {
  client = new Client();
  connect.mockReturnValue(client);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe('MQTT publisher', () => {
  it.each(['bar', 'liquid'] as const)('publishes exact %s contract and closes', async (process) => {
    await runSimulation({ ...config, process }, new AbortController().signal, vi.fn());
    expect(connect).toHaveBeenCalledWith(
      config.mqttUrl,
      expect.objectContaining({ clean: true, queueQoSZero: false, reconnectPeriod: 2000 }),
    );
    expect(client.publishAsync).toHaveBeenCalledTimes(3);
    for (const [topic, raw, options] of client.publishAsync.mock.calls) {
      expect(topic).toBe(`ecosoap/production/${config.productionOrderId}/CURING-01/telemetry`);
      expect(options).toEqual({ qos: 0, retain: false });
      const payload = JSON.parse(raw as string);
      expect(Object.keys(payload).sort()).toEqual(['metrics', 'recordedAt']);
      expect(new Date(payload.recordedAt).toISOString()).toBe(payload.recordedAt);
      expect(payload.metrics).toHaveLength(process === 'bar' ? 2 : 4);
      for (const metric of payload.metrics)
        expect(Object.keys(metric).sort()).toEqual(['metric', 'unit', 'value']);
    }
    expect(client.endAsync).toHaveBeenCalledWith(false);
  });
  it('times out initial connection without generating publications and redacts errors', async () => {
    vi.useFakeTimers();
    client.connected = false;
    const log = vi.fn();
    const result = runSimulation(config, new AbortController().signal, log);
    const rejected = expect(result).rejects.toThrow('connection timed out');
    client.emit('error', new Error('mqtt://user:secret@broker'));
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
    await rejected;
    expect(client.publishAsync).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('waits for reconnect before producing a sample', async () => {
    client.connected = false;
    const result = runSimulation({ ...config, samples: 1 }, new AbortController().signal, vi.fn());
    expect(client.publishAsync).not.toHaveBeenCalled();
    client.connected = true;
    client.emit('connect');
    await result;
    expect(client.publishAsync).toHaveBeenCalledTimes(1);
    expect(client.listenerCount('connect')).toBe(0);
  });
  it('stops on abort while disconnected and closes', async () => {
    client.connected = false;
    const controller = new AbortController();
    const result = runSimulation(config, controller.signal, vi.fn());
    controller.abort();
    await result;
    expect(client.publishAsync).not.toHaveBeenCalled();
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('stops during the interval without waiting for the whole delay', async () => {
    const controller = new AbortController();
    client.publishAsync.mockImplementation(async () => {
      controller.abort();
    });
    await runSimulation({ ...config, intervalMs: 3_600_000 }, controller.signal, vi.fn());
    expect(client.publishAsync).toHaveBeenCalledTimes(1);
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('closes even when publishing fails', async () => {
    client.publishAsync.mockRejectedValue(new Error('secret'));
    await expect(runSimulation(config, new AbortController().signal, vi.fn())).rejects.toThrow(
      'publication failed',
    );
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('abort interrupts a stalled in-flight publication', async () => {
    client.publishAsync.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const result = runSimulation(config, controller.signal, vi.fn());
    await Promise.resolve();
    controller.abort();
    await result;
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('does not replay a sample lost during a temporary disconnect', async () => {
    client.publishAsync.mockImplementationOnce(async () => {
      client.connected = false;
      setTimeout(() => {
        client.connected = true;
        client.emit('connect');
      }, 5);
      throw new Error('offline');
    });
    await runSimulation(config, new AbortController().signal, vi.fn());
    expect(client.publishAsync).toHaveBeenCalledTimes(3);
    expect(client.endAsync).toHaveBeenCalled();
  });
  it('bounds graceful shutdown and forces a stalled client to close', async () => {
    vi.useFakeTimers();
    client.endAsync.mockImplementation(() => new Promise(() => {}));
    const result = runSimulation({ ...config, samples: 1 }, new AbortController().signal, vi.fn());
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(client.stream.destroy).toHaveBeenCalled();
  });
});
