import type { IiotAlert, IiotMetric, IiotOverview, IiotReading } from '../types';

export function reading(
  metric: IiotMetric = 'TEMPERATURE',
  overrides: Partial<IiotReading> = {},
): IiotReading {
  return {
    id: metric,
    productionOrderId: 'order',
    metric,
    value: metric === 'HUMIDITY' ? '61.5000' : '27.2500',
    unit: metric === 'HUMIDITY' ? '%' : '°C',
    recordedAt: '2026-10-30T16:35:21.000Z',
    receivedAt: '2026-10-30T16:35:22.000Z',
    device: { id: 'device', code: 'CURING-01', name: 'Curado' },
    ...overrides,
  };
}
export function overview(
  status: IiotOverview['productionOrder']['status'] = 'IN_PROGRESS',
): IiotOverview {
  return {
    productionOrder: {
      id: 'order',
      number: 'OP-000001',
      status,
      startedAt: '2026-10-30T16:00:00.000Z',
      completedAt: status === 'COMPLETED' ? '2026-10-30T17:00:00.000Z' : null,
      product: { id: 'product', code: 'SOAP-01', name: 'Jabón' },
    },
    telemetry: {
      totalReadings: 240,
      lastReadingAt: '2026-10-30T16:35:21.000Z',
      latestByMetric: [reading('HUMIDITY'), reading()],
    },
    alerts: {
      total: 14,
      warning: 10,
      critical: 4,
      unacknowledged: 13,
      lastAlertAt: '2026-10-30T16:30:00.000Z',
    },
  };
}
export function alert(
  severity: IiotAlert['severity'] = 'WARNING',
  overrides: Partial<IiotAlert> = {},
): IiotAlert {
  return {
    id: severity,
    productionOrderId: 'order',
    type: 'HIGH_TEMPERATURE',
    severity,
    message: 'Temperatura fuera del umbral ' + severity,
    createdAt: '2026-10-30T16:35:23.000Z',
    acknowledgedAt: null,
    reading: reading(),
    ...overrides,
  };
}
export function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
export function page<T>(data: T[]) {
  return { data, meta: { page: 1, limit: 20, total: data.length } };
}
