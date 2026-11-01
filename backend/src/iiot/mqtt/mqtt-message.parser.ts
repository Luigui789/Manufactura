import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsString,
  isUUID,
  Matches,
  ValidateNested,
  validateSync,
} from 'class-validator';

import { IiotMetric, Prisma } from '../../generated/prisma/client.js';
import { TelemetryRejectedError, type TelemetryMessage } from './mqtt-message.types.js';

const units: Record<IiotMetric, string> = {
  TEMPERATURE: '°C',
  HUMIDITY: '%',
  PH: 'pH',
  TANK_LEVEL: '%',
  MIXER_RPM: 'RPM',
};

class MetricInput {
  @IsEnum(IiotMetric)
  metric: IiotMetric;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  value: number;

  @IsString()
  unit: string;
}

class TelemetryInput {
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
  recordedAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => MetricInput)
  metrics: MetricInput[];
}

/** External MQTT boundary: the HTTP ValidationPipe does not run here. */
export function parseTelemetry(topic: string, payload: Buffer): TelemetryMessage {
  const parts = topic.split('/');
  if (
    parts.length !== 5 ||
    parts[0] !== 'ecosoap' ||
    parts[1] !== 'production' ||
    parts[4] !== 'telemetry' ||
    !isUUID(parts[2])
  )
    throw new TelemetryRejectedError('invalid telemetry topic or production order UUID');
  const deviceCode = parts[3];
  if (
    !deviceCode ||
    deviceCode.length > 80 ||
    deviceCode.trim() !== deviceCode ||
    ['/', '+', '#'].some((segment) => deviceCode.includes(segment)) ||
    [...deviceCode].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new TelemetryRejectedError('invalid device code');

  // A five-metric message is small; bound parsing work at this untrusted boundary.
  if (payload.length > 16 * 1024) throw new TelemetryRejectedError('payload exceeds 16 KiB');
  let raw: unknown;
  try {
    raw = JSON.parse(payload.toString('utf8')) as unknown;
  } catch {
    throw new TelemetryRejectedError('invalid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new TelemetryRejectedError('payload must be an object');
  // Check raw keys too: class-transformer omits reserved keys such as __proto__.
  if (Object.keys(raw).some((key) => !['recordedAt', 'metrics'].includes(key)))
    throw new TelemetryRejectedError('unexpected payload field');
  const rawMetrics = (raw as Record<string, unknown>).metrics;
  if (
    Array.isArray(rawMetrics) &&
    rawMetrics.some(
      (metric: unknown) =>
        !metric ||
        typeof metric !== 'object' ||
        Array.isArray(metric) ||
        Object.keys(metric).some((key) => !['metric', 'value', 'unit'].includes(key)),
    )
  )
    throw new TelemetryRejectedError('each metric must contain only metric, value and unit');
  const input = plainToInstance(TelemetryInput, raw, { enableImplicitConversion: false });
  if (
    validateSync(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }).length
  )
    throw new TelemetryRejectedError('invalid payload fields, timestamp or metrics');

  const recordedAt = new Date(input.recordedAt);
  if (!Number.isFinite(recordedAt.getTime()))
    throw new TelemetryRejectedError('invalid recordedAt');
  const seen = new Set<IiotMetric>();
  const metrics = input.metrics.map(({ metric, value, unit }) => {
    if (seen.has(metric)) throw new TelemetryRejectedError('duplicate metric');
    seen.add(metric);
    if (unit !== units[metric]) throw new TelemetryRejectedError('incorrect canonical unit');
    const decimal = new Prisma.Decimal(value.toString());
    if (decimal.decimalPlaces() > 4 || decimal.abs().gte('100000000000000'))
      throw new TelemetryRejectedError('value must fit Decimal(18,4) without rounding');
    return { metric, value: decimal, unit };
  });
  return { productionOrderId: parts[2].toLowerCase(), deviceCode, recordedAt, metrics };
}
