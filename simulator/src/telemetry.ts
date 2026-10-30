export const units = {
  TEMPERATURE: '°C',
  HUMIDITY: '%',
  PH: 'pH',
  TANK_LEVEL: '%',
  MIXER_RPM: 'RPM',
} as const;
export type Metric = keyof typeof units;
export type Reading = { metric: Metric; value: number; unit: (typeof units)[Metric] };
export type Telemetry = { recordedAt: string; metrics: Reading[] };

export function reading(metric: Metric, value: number): Reading {
  return { metric, value: Number(value.toFixed(2)), unit: units[metric] };
}
