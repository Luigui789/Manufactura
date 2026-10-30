import type { IiotMetric } from '../../generated/prisma/client.js';

type DemoRule = {
  unit: string;
  warning: readonly [string, string];
  critical: readonly [string, string];
  types: readonly [string, string];
};

// DEMO / SYNTHETIC RULES: not industrial specifications or soap quality criteria.
export const DEMO_RULES = {
  TEMPERATURE: {
    unit: '°C',
    warning: ['10', '50'],
    critical: ['0', '55'],
    types: ['LOW_TEMPERATURE', 'HIGH_TEMPERATURE'],
  },
  HUMIDITY: {
    unit: '%',
    warning: ['30', '70'],
    critical: ['20', '78'],
    types: ['LOW_HUMIDITY', 'HIGH_HUMIDITY'],
  },
  PH: {
    unit: 'pH',
    warning: ['8.5', '10'],
    critical: ['8', '11'],
    types: ['PH_OUT_OF_RANGE', 'PH_OUT_OF_RANGE'],
  },
  TANK_LEVEL: {
    unit: '%',
    warning: ['30', '95'],
    critical: ['15', '99'],
    types: ['LOW_TANK_LEVEL', 'HIGH_TANK_LEVEL'],
  },
  MIXER_RPM: {
    unit: 'RPM',
    warning: ['250', '420'],
    critical: ['150', '470'],
    types: ['LOW_MIXER_RPM', 'HIGH_MIXER_RPM'],
  },
} as const satisfies Record<IiotMetric, DemoRule>;
