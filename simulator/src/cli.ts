import { parseConfig } from './config.js';
import { runSimulation } from './publisher.js';

const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const config = parseConfig(process.argv.slice(2));
  await runSimulation(config, controller.signal);
  if (controller.signal.aborted) console.log('Simulation interrupted');
} catch (error) {
  // parseArgs errors include user arguments; do not echo potentially secret values.
  const message =
    error instanceof Error && !('code' in error) ? error.message : 'Invalid CLI arguments';
  console.error(`Simulator: ${message}`);
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
