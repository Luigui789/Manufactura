import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { SimulatorRunner } from './simulator-runner.service.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
afterEach(() => vi.clearAllMocks());

function fixture() {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const config = new ConfigService({
    NODE_ENV: 'development',
    MQTT_URL: 'mqtt://broker:1883',
    DATABASE_URL: 'private',
    JWT_SECRET: 'private',
  });
  return { child, runner: new SimulatorRunner(config) };
}

it('uses the real CLI without shell or database/session secrets; parses complete stdout lines', async () => {
  const { child, runner } = fixture();
  const progress = vi.fn();
  const run = runner.start(
    'order',
    'device',
    { process: 'liquid', scenario: 'deviation' },
    progress,
  );
  expect(spawn).toHaveBeenCalledWith(
    process.execPath,
    [expect.stringMatching(/simulator[\\/]dist[\\/]cli.js$/)],
    expect.objectContaining({
      timeout: 90000,
      windowsHide: true,
      env: {
        MQTT_URL: 'mqtt://broker:1883',
        SIM_PRODUCTION_ORDER_ID: 'order',
        SIM_DEVICE_CODE: 'device',
        SIM_PROCESS: 'liquid',
        SIM_SCENARIO: 'deviation',
        SIM_SAMPLES: '60',
        SIM_INTERVAL_MS: '1000',
        SIM_SEED: '42',
      },
    }),
  );
  child.stdout.write('Sample 1/60 pub');
  expect(progress).not.toHaveBeenCalled();
  child.stdout.write('lished\nSample 2/60 lost during disconnect (QoS 0)\n');
  expect(progress).toHaveBeenCalledExactlyOnceWith(1);
  child.stdout.write('Sample 3/60 published\n');
  expect(progress).toHaveBeenLastCalledWith(2);
  child.emit('close', 0);
  await run.completion;
});

it('stops the child and reports process failures', async () => {
  const { child, runner } = fixture();
  const run = runner.start('order', 'device', { process: 'bar', scenario: 'normal' }, vi.fn());
  run.stop();
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  child.emit('close', null);
  await expect(run.completion).rejects.toThrow('El simulador no terminó correctamente.');
});

it('does not expose raw spawn errors', async () => {
  const { child, runner } = fixture();
  const run = runner.start('order', 'device', { process: 'bar', scenario: 'normal' }, vi.fn());
  child.emit('error', new Error('private internals'));
  child.emit('close', -1);
  await expect(run.completion).rejects.toThrow('No se pudo iniciar el simulador.');
});

it('disables the runner in production or when the compiled simulator is absent', () => {
  expect(new SimulatorRunner(new ConfigService({ NODE_ENV: 'production' })).available).toBe(false);
  vi.mocked(existsSync).mockReturnValueOnce(false);
  expect(new SimulatorRunner(new ConfigService({ NODE_ENV: 'development' })).available).toBe(false);
});
