import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://localhost/test',
  FRONTEND_URL: 'http://localhost:5173',
  JWT_SECRET: 'x'.repeat(32),
};
describe('MQTT_URL', () => {
  it.each(['development', 'production'])('is required in %s', (NODE_ENV) => {
    expect(() => validateEnv({ ...base, NODE_ENV })).toThrow(/MQTT_URL/);
  });
  it.each(['mqtt://localhost:1883', 'mqtts://broker.example:8883'])('accepts %s', (MQTT_URL) => {
    expect(() => validateEnv({ ...base, MQTT_URL })).not.toThrow();
  });
  it.each(['http://localhost', 'localhost:1883', 'mqtt://', ''])('rejects %s', (MQTT_URL) => {
    expect(() => validateEnv({ ...base, MQTT_URL })).toThrow(/MQTT_URL/);
  });
  it('is optional for test, but validates a supplied URL', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'test' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'test', MQTT_URL: 'bad' })).toThrow(/MQTT_URL/);
  });
});
