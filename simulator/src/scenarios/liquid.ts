import type { Scenario } from '../config.js';
import { reading } from '../telemetry.js';
import { approach, deviationProgress } from './profile.js';

export const LIQUID_PROFILE = {
  temperature: 42,
  ph: 9.4,
  tankStart: 80,
  tankDrop: 25,
  rpm: 350,
  temperatureRise: 16,
  phRise: 2,
  rpmRise: 150,
};
export function createLiquid(scenario: Scenario, rng: () => number) {
  let temperature = LIQUID_PROFILE.temperature;
  let ph = LIQUID_PROFILE.ph;
  let tank = LIQUID_PROFILE.tankStart;
  let rpm = LIQUID_PROFILE.rpm;
  return (progress: number) => {
    const drift = scenario === 'deviation' ? deviationProgress(progress) : 0;
    temperature = approach(
      temperature,
      LIQUID_PROFILE.temperature + drift * LIQUID_PROFILE.temperatureRise,
      0.3,
      rng,
    );
    ph = approach(ph, LIQUID_PROFILE.ph + drift * LIQUID_PROFILE.phRise, 0.025, rng);
    tank = Math.min(
      100,
      Math.max(
        0,
        approach(tank, LIQUID_PROFILE.tankStart - progress * LIQUID_PROFILE.tankDrop, 0.08, rng),
      ),
    );
    rpm = approach(rpm, LIQUID_PROFILE.rpm + drift * LIQUID_PROFILE.rpmRise, 3, rng);
    return [
      reading('TEMPERATURE', temperature),
      reading('PH', ph),
      reading('TANK_LEVEL', tank),
      reading('MIXER_RPM', rpm),
    ];
  };
}
