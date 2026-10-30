import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TelemetryRejectedError, type TelemetryMessage } from '../mqtt/mqtt-message.types.js';

@Injectable()
export class TelemetryIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(message: TelemetryMessage): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.productionOrder.findUnique({
          where: { id: message.productionOrderId },
          select: { status: true },
        });
        if (!order || order.status !== 'IN_PROGRESS')
          throw new TelemetryRejectedError('production order missing or not IN_PROGRESS');
        const device = await tx.iiotDevice.findUnique({
          where: { code: message.deviceCode },
          select: { id: true, isActive: true },
        });
        if (!device?.isActive) throw new TelemetryRejectedError('device missing or inactive');
        // One atomic INSERT batch; receivedAt remains the database default.
        await tx.iiotReading.createMany({
          data: message.metrics.map((metric) => ({
            productionOrderId: message.productionOrderId,
            deviceId: device.id,
            recordedAt: message.recordedAt,
            ...metric,
          })),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
