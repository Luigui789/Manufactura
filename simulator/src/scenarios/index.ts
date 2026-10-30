import type { Config } from '../config.js';
import { seededRandom } from '../random.js';
import type { Reading } from '../telemetry.js';
import { createBar } from './bar.js';
import { createLiquid } from './liquid.js';

export { DEVIATION_START } from './profile.js';
export function createScenario(
  config: Pick<Config, 'process' | 'scenario' | 'seed' | 'samples'>,
): () => Reading[] {
  const rng = seededRandom(config.seed);
  const next =
    config.process === 'bar' ? createBar(config.scenario, rng) : createLiquid(config.scenario, rng);
  let index = 0;
  return () => {
    const progress = config.samples === 1 ? 0 : index / (config.samples - 1);
    index++;
    return next(progress);
  };
}
