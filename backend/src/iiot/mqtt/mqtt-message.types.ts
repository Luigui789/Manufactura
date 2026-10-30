import type { IiotMetric, Prisma } from '../../generated/prisma/client.js';

export const TELEMETRY_TOPIC = 'ecosoap/production/+/+/telemetry';

export type TelemetryMessage = {
  productionOrderId: string;
  deviceCode: string;
  recordedAt: Date;
  metrics: { metric: IiotMetric; value: Prisma.Decimal; unit: string }[];
};

export class TelemetryRejectedError extends Error {}
