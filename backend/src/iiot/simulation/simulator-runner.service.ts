import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StartSimulationDto } from './simulation.dto.js';

export const SIMULATION_SAMPLES = 60;

@Injectable()
export class SimulatorRunner {
  private readonly cli = path.resolve(import.meta.dirname, '../../../../simulator/dist/cli.js');

  constructor(private readonly config: ConfigService) {}

  get available() {
    return this.config.get<string>('NODE_ENV') !== 'production' && existsSync(this.cli);
  }

  start(
    orderId: string,
    deviceCode: string,
    options: StartSimulationDto,
    progress: (sample: number) => void,
  ) {
    // Fixed executable and arguments, no shell, and no database/session secrets in the child.
    const child = spawn(process.execPath, [this.cli], {
      env: {
        MQTT_URL: this.config.getOrThrow<string>('MQTT_URL'),
        SIM_PRODUCTION_ORDER_ID: orderId,
        SIM_DEVICE_CODE: deviceCode,
        SIM_PROCESS: options.process,
        SIM_SCENARIO: options.scenario,
        SIM_SAMPLES: String(SIMULATION_SAMPLES),
        SIM_INTERVAL_MS: '1000',
        SIM_SEED: '42',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 90_000,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });
    const lines = createInterface({ input: child.stdout });
    let published = 0;
    lines.on('line', (line) => {
      const match = /^Sample (\d+)\/60 published$/.exec(line);
      if (match) progress(++published);
    });
    const completion = new Promise<void>((resolve, reject) => {
      child.once('error', () => reject(new Error('No se pudo iniciar el simulador.')));
      child.once('close', (code) => {
        lines.close();
        if (code === 0) resolve();
        else reject(new Error('El simulador no terminó correctamente.'));
      });
    });
    return {
      completion,
      stop: () => {
        child.kill('SIGKILL');
      },
    };
  }
}
