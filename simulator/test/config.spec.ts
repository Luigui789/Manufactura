import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

const env = {
  SIM_PRODUCTION_ORDER_ID: '019a3e10-0000-7000-8000-000000000001',
  SIM_DEVICE_CODE: 'CURING-01',
  SIM_PROCESS: 'bar',
  SIM_SCENARIO: 'normal',
};
describe('configuration before connecting', () => {
  it('accepts environment, UUIDv7 and defaults', () => {
    expect(parseConfig([], env)).toMatchObject({
      samples: 60,
      intervalMs: 1000,
      seed: 42,
      process: 'bar',
      mqttUrl: 'mqtt://localhost:1883',
    });
  });
  it('CLI takes precedence, including a pnpm separator', () => {
    expect(
      parseConfig(
        [
          '--',
          '--process',
          'liquid',
          '--scenario',
          'deviation',
          '--samples',
          '3',
          '--interval-ms',
          '1',
          '--seed',
          '0',
          '--mqtt-url',
          'mqtts://broker:8883',
        ],
        env,
      ),
    ).toMatchObject({
      process: 'liquid',
      scenario: 'deviation',
      samples: 3,
      intervalMs: 1,
      seed: 0,
      mqttUrl: 'mqtts://broker:8883',
    });
  });
  it.each([
    ['--order', 'invalid'],
    ['--order', ''],
    ...['', 'a'.repeat(81), 'a/b', 'a+b', 'a#b', ' a', 'a ', 'a\nb', 'a\u007fb'].map((v) => [
      '--device',
      v,
    ]),
    ['--process', 'BAR'],
    ['--scenario', 'bad'],
    ['--samples', '0'],
    ['--samples', '1.5'],
    ['--samples', '9007199254740992'],
    ['--interval-ms', '0'],
    ['--interval-ms', '3600001'],
    ['--seed', '-1'],
    ['--seed', 'NaN'],
    ['--seed', '4294967296'],
    ...[
      'http://broker',
      'mqtt://',
      'mqtt://broker:99999',
      'mqtt://broker/path',
      'mqtt://broker#secret',
    ].map((v) => ['--mqtt-url', v]),
  ])('rejects %s = %j', (flag, value) => {
    expect(() => parseConfig([flag, value], env)).toThrow();
  });
  it('requires explicit process and scenario', () => {
    expect(() => parseConfig([], {})).toThrow();
    expect(() => parseConfig([], { ...env, SIM_PROCESS: undefined })).toThrow('process');
    expect(() => parseConfig([], { ...env, SIM_SCENARIO: undefined })).toThrow('scenario');
  });
  it('does not echo broker credentials on invalid configuration', () => {
    expect(() => parseConfig(['--mqtt-url', 'http://user:secret@broker'], env)).toThrow(
      'MQTT URL must be',
    );
  });
  it('rejects unknown flags and positionals', () => {
    expect(() => parseConfig(['--other', '1'], env)).toThrow();
    expect(() => parseConfig(['other'], env)).toThrow();
  });
});
