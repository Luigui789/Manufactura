import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { StartSimulationDto } from './simulation.dto.js';
import { SIMULATION_SAMPLES, SimulatorRunner } from './simulator-runner.service.js';

type Run = {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  process: 'bar' | 'liquid';
  scenario: 'normal' | 'deviation';
  deviceId: string | null;
  deviceCode: string | null;
  publishedSamples: number;
  error: string | null;
  stop?: () => void;
  completion?: Promise<void>;
};

@Injectable()
export class SimulationService implements OnModuleDestroy {
  private readonly runs = new Map<string, Run>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SimulatorRunner,
  ) {}

  async status(orderId: string) {
    const order = await this.order(orderId);
    const run = this.runs.get(orderId);
    const receivedReadings = run?.deviceId
      ? await this.prisma.iiotReading.count({
          where: { productionOrderId: orderId, deviceId: run.deviceId },
        })
      : 0;
    return {
      available: this.runner.available,
      orderStatus: order.status,
      status: run?.status ?? 'IDLE',
      process: run?.process ?? null,
      scenario: run?.scenario ?? null,
      deviceCode: run?.deviceCode ?? null,
      publishedSamples: run?.publishedSamples ?? 0,
      totalSamples: SIMULATION_SAMPLES,
      receivedReadings,
      error: run?.error ?? null,
    };
  }

  async start(orderId: string, options: StartSimulationDto) {
    if (!this.runner.available)
      throw new ConflictException(
        'El simulador de demostración no está disponible en este entorno.',
      );
    if (this.runs.get(orderId)?.status === 'RUNNING')
      throw new ConflictException('Ya hay una prueba IIoT en curso para esta orden.');
    // Reserve before the first await so concurrent requests cannot launch two children.
    const run: Run = {
      ...options,
      status: 'RUNNING',
      deviceId: null,
      deviceCode: null,
      publishedSamples: 0,
      error: null,
    };
    this.runs.set(orderId, run);
    try {
      const order = await this.order(orderId);
      if (order.status !== 'IN_PROGRESS')
        throw new ConflictException(
          'Iniciá la producción antes de ejecutar la prueba IIoT. La orden debe estar en curso.',
        );
      const device = await this.prisma.iiotDevice.create({
        data: {
          code: 'DEMO-' + randomUUID(),
          name: 'DEMO / SYNTHETIC · ' + options.process,
          isActive: true,
        },
      });
      run.deviceId = device.id;
      run.deviceCode = device.code;
      const child = this.runner.start(orderId, device.code, options, (sample) => {
        run.publishedSamples = sample;
      });
      run.stop = child.stop;
      run.completion = this.finish(orderId, run, child.completion);
      return await this.status(orderId);
    } catch (error) {
      if (!run.completion) this.runs.delete(orderId);
      throw error;
    }
  }

  private async order(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  private async finish(orderId: string, run: Run, completion: Promise<void>) {
    try {
      await completion;
      const expected = SIMULATION_SAMPLES * (run.process === 'bar' ? 2 : 4);
      // MQTT publication is not proof of ingestion: reconcile this run's device with PostgreSQL.
      let received = 0;
      for (let attempt = 0; attempt < 10; attempt++) {
        received = await this.prisma.iiotReading.count({
          where: { productionOrderId: orderId, deviceId: run.deviceId! },
        });
        if (received === expected) break;
        await delay(200);
      }
      if (received !== expected) throw new Error('incomplete ingestion');
      run.status = 'COMPLETED';
    } catch {
      run.status = 'FAILED';
      run.error =
        'La prueba no recibió todas las lecturas esperadas. Verificá que la OP siga en curso y que el monitoreo esté disponible antes de reintentar.';
    } finally {
      run.stop = undefined;
    }
  }

  async onModuleDestroy() {
    for (const run of this.runs.values()) run.stop?.();
    await Promise.all(
      [...this.runs.values()].flatMap((run) => (run.completion ? [run.completion] : [])),
    );
  }
}
