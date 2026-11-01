import type { Scenario } from '../config.js';
import { reading } from '../telemetry.js';
import { approach, deviationProgress } from './profile.js';

// Synthetic academic profiles; these are not manufacturing or quality limits.
export const BAR_PROFILE = { temperature: 27, humidity: 60, temperatureRise: 12, humidityRise: 22 };
export function createBar(scenario: Scenario, rng: () => number) {
  let temperature = BAR_PROFILE.temperature;
  let humidity = BAR_PROFILE.humidity;
  return (progress: number) => {
    const drift = scenario === 'deviation' ? deviationProgress(progress) : 0;
    temperature = approach(
      temperature,
      BAR_PROFILE.temperature + drift * BAR_PROFILE.temperatureRise,
      0.25,
      rng,
    );
    humidity = approach(
      humidity,
      BAR_PROFILE.humidity + drift * BAR_PROFILE.humidityRise,
      0.5,
      rng,
    );
    return [reading('TEMPERATURE', temperature), reading('HUMIDITY', humidity)];
  };
}
