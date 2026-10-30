import type { ProductionOrder } from '@/features/production/api/orders';

export const IIOT_METRICS = ['TEMPERATURE', 'HUMIDITY', 'PH', 'TANK_LEVEL', 'MIXER_RPM'] as const;
export type IiotMetric = (typeof IIOT_METRICS)[number];
export type IiotAlertSeverity = 'WARNING' | 'CRITICAL';
export type IiotDevice = { id: string; code: string; name: string };
export type IiotReading = {
  id: string;
  productionOrderId: string;
  metric: IiotMetric;
  value: string;
  unit: string;
  recordedAt: string;
  receivedAt: string;
  device: IiotDevice;
};
export type IiotAlert = {
  id: string;
  productionOrderId: string;
  type: string;
  severity: IiotAlertSeverity;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
  reading: Omit<IiotReading, 'productionOrderId' | 'receivedAt'> | null;
};
export type IiotOverview = {
  productionOrder: Pick<
    ProductionOrder,
    'id' | 'number' | 'status' | 'startedAt' | 'completedAt'
  > & {
    product: { id: string; code: string; name: string };
  };
  telemetry: {
    totalReadings: number;
    lastReadingAt: string | null;
    latestByMetric: IiotReading[];
  };
  alerts: {
    total: number;
    warning: number;
    critical: number;
    unacknowledged: number;
    lastAlertAt: string | null;
  };
};
export type IiotPage<T> = { data: T[]; meta: { page: number; limit: number; total: number } };
