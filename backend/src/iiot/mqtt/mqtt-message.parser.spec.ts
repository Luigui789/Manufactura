import { describe, expect, it } from 'vitest';
import { parseTelemetry } from './mqtt-message.parser.js';
import { TelemetryRejectedError } from './mqtt-message.types.js';

const id = '019a1234-1234-7123-8123-123456789abc';
const topic = `ecosoap/production/${id}/CURING-01/telemetry`;
const metric = { metric: 'TEMPERATURE', value: 27.1234, unit: '°C' };
const payload = { recordedAt: '2026-10-30T10:00:00Z', metrics: [metric] };
function parse(value: unknown) {
  return parseTelemetry(topic, Buffer.from(JSON.stringify(value)));
}

describe('MQTT telemetry parser', () => {
  it('parses topic, numeric decimals and offset timestamps without physiological thresholds', () => {
    const message = parse({
      ...payload,
      recordedAt: '2026-10-30T04:00:00-06:00',
      metrics: [
        { ...metric, value: -10.1234 },
        { metric: 'PH', value: 14, unit: 'pH' },
      ],
    });
    expect(message.productionOrderId).toBe(id);
    expect(message.deviceCode).toBe('CURING-01');
    expect(message.recordedAt.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(message.metrics[0].value.toFixed(4)).toBe('-10.1234');
    expect(message.metrics[1].value.toNumber()).toBe(14);
  });
  it('accepts all five canonical metrics', () => {
    expect(
      parse({
        ...payload,
        metrics: [
          metric,
          { metric: 'HUMIDITY', value: 61.4, unit: '%' },
          { metric: 'PH', value: 9.4, unit: 'pH' },
          { metric: 'TANK_LEVEL', value: 72, unit: '%' },
          { metric: 'MIXER_RPM', value: 350, unit: 'RPM' },
        ],
      }).metrics,
    ).toHaveLength(5);
  });
  it.each([
    'ecosoap/production/telemetry',
    topic + '/extra',
    topic.replace(id, 'not-a-uuid'),
    topic.replace('CURING-01', ''),
    topic.replace('CURING-01', '+'),
    topic.replace('CURING-01', '#'),
    topic.replace('CURING-01', 'A/B'),
    topic.replace('CURING-01', 'A\0B'),
    topic.replace('CURING-01', 'A\nB'),
    topic.replace('CURING-01', 'x'.repeat(81)),
    topic.replace('ecosoap', 'other'),
    topic.replace('telemetry', 'other'),
  ])('rejects malformed topic %s', (invalid) => {
    expect(() => parseTelemetry(invalid, Buffer.from(JSON.stringify(payload)))).toThrow(
      TelemetryRejectedError,
    );
  });
  const invalidPayloads: [string, unknown][] = [
    ['null', null],
    ['array', []],
    ['number', 12],
    ['missing recordedAt', { metrics: [metric] }],
    ['missing metrics', { recordedAt: payload.recordedAt }],
    ['invalid date', { ...payload, recordedAt: '2026-02-30T10:00:00Z' }],
    ['no timezone', { ...payload, recordedAt: '2026-10-30T10:00:00' }],
    ['date only', { ...payload, recordedAt: '2026-10-30' }],
    ['empty metrics', { ...payload, metrics: [] }],
    ['too many metrics', { ...payload, metrics: Array.from({ length: 6 }, () => metric) }],
    ['unknown metric', { ...payload, metrics: [{ ...metric, metric: 'UNKNOWN' }] }],
    ['duplicate metric', { ...payload, metrics: [metric, metric] }],
    ['string value', { ...payload, metrics: [{ ...metric, value: '27.2' }] }],
    ['null value', { ...payload, metrics: [{ ...metric, value: null }] }],
    ['boolean value', { ...payload, metrics: [{ ...metric, value: true }] }],
    ['wrong unit', { ...payload, metrics: [{ ...metric, unit: 'RPM' }] }],
    ['decimal overflow', { ...payload, metrics: [{ ...metric, value: 1e14 }] }],
    ['excess scale', { ...payload, metrics: [{ ...metric, value: 0.00001 }] }],
    ['extra root field', { ...payload, deviceCode: 'CURING-01' }],
    ['reserved root field', { ...payload, constructor: 'unexpected' }],
    ['reserved metric field', { ...payload, metrics: [{ ...metric, constructor: 'unexpected' }] }],
    ['extra metric field', { ...payload, metrics: [{ ...metric, extra: true }] }],
    ['null metric', { ...payload, metrics: [null] }],
    ['nested metric array', { ...payload, metrics: [[metric]] }],
  ];
  it.each(invalidPayloads)('rejects %s', (_name, invalid) => {
    expect(() => parse(invalid)).toThrow(TelemetryRejectedError);
  });
  it.each(['{', 'NaN', 'Infinity', JSON.stringify(payload).replace('27.1234', '1e999')])(
    'rejects invalid or nonfinite JSON',
    (raw) => {
      expect(() => parseTelemetry(topic, Buffer.from(raw))).toThrow(TelemetryRejectedError);
    },
  );
  it('bounds payload parsing work', () => {
    expect(() => parseTelemetry(topic, Buffer.alloc(16385))).toThrow(/16 KiB/);
  });
});
