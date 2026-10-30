import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type MqttClient } from 'mqtt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryIngestionService } from '../readings/telemetry-ingestion.service.js';
import { MqttService } from './mqtt.service.js';
import { TelemetryRejectedError, TELEMETRY_TOPIC } from './mqtt-message.types.js';

vi.mock('mqtt', () => ({ connect: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function fixture(NODE_ENV = 'development') {
  const client = Object.assign(new EventEmitter(), {
    subscribe: vi.fn(
      (
        _topic: string,
        _options: unknown,
        done: (error: Error | null, grants: { qos: number }[]) => void,
      ) => done(null, [{ qos: 0 }]),
    ),
    endAsync: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(connect).mockReturnValue(client as unknown as MqttClient);
  const ingest = vi.fn().mockResolvedValue(undefined);
  const service = new MqttService(
    new ConfigService({ NODE_ENV, MQTT_URL: 'mqtt://localhost:1883' }),
    { ingest } as unknown as TelemetryIngestionService,
  );
  return { client, ingest, service };
}
describe('MQTT lifecycle and message isolation', () => {
  it('does not connect even if MQTT_URL is set in test', async () => {
    vi.mocked(connect).mockClear();
    const { service } = fixture('test');
    service.onModuleInit();
    expect(connect).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
  it('subscribes at QoS 0 after every connection and closes on shutdown', async () => {
    const { service, client } = fixture();
    service.onModuleInit();
    client.emit('connect');
    client.emit('close');
    client.emit('reconnect');
    client.emit('connect');
    expect(client.subscribe).toHaveBeenCalledTimes(2);
    expect(client.subscribe).toHaveBeenCalledWith(
      TELEMETRY_TOPIC,
      { qos: 0 },
      expect.any(Function),
    );
    await service.onModuleDestroy();
    expect(client.endAsync).toHaveBeenCalledWith(true);
    expect(client.listenerCount('message')).toBe(0);
  });
  it('isolates invalid JSON, domain rejection and persistence failure before a valid message', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const { service, client, ingest } = fixture();
    service.onModuleInit();
    const topic = 'ecosoap/production/019a1234-1234-7123-8123-123456789abc/TANK-01/telemetry';
    const valid = Buffer.from(
      JSON.stringify({
        recordedAt: '2026-10-30T10:00:00Z',
        metrics: [{ metric: 'PH', value: 14, unit: 'pH' }],
      }),
    );
    client.emit('message', topic, Buffer.from('{secret payload'));
    ingest.mockRejectedValueOnce(new TelemetryRejectedError('device missing or inactive'));
    client.emit('message', topic, valid);
    ingest.mockRejectedValueOnce(new Error('internal details secret'));
    client.emit('message', topic, valid);
    client.emit('message', topic, valid);
    client.emit('error', new Error('mqtt://secret:password@host'));
    await service.onModuleDestroy();
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([warn.mock.calls, error.mock.calls])).not.toContain('secret');
  });
});
