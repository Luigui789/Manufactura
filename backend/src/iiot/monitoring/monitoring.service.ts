import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IiotMetric, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  AlertsQueryDto,
  MonitoringQueryDto,
  ReadingsQueryDto,
} from './dto/monitoring-query.dto.js';

const deviceSelect = { id: true, code: true, name: true } as const;
const alertReadingSelect = {
  id: true,
  metric: true,
  value: true,
  unit: true,
  recordedAt: true,
  device: { select: deviceSelect },
} as const satisfies Prisma.IiotReadingSelect;
const readingSelect = {
  ...alertReadingSelect,
  productionOrderId: true,
  receivedAt: true,
} as const satisfies Prisma.IiotReadingSelect;

// NUMERIC(18,4): preserve the complete database precision, including trailing zeros.
function serializeReading<T extends { value: Prisma.Decimal }>(reading: T) {
  return { ...reading, value: reading.value.toFixed(4) };
}

function dateRange({ from, to }: MonitoringQueryDto) {
  const gte = from === undefined ? undefined : new Date(from);
  const lte = to === undefined ? undefined : new Date(to);
  if (gte && lte && gte > lte) {
    throw new BadRequestException('from no puede ser posterior a to');
  }
  return { gte, lte };
}

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  private async productionOrder(id: string) {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        startedAt: true,
        completedAt: true,
        product: { select: { id: true, code: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Orden de producción no encontrada');
    return order;
  }

  async overview(productionOrderId: string) {
    const productionOrder = await this.productionOrder(productionOrderId);
    const where = { productionOrderId };
    const [telemetry, latest, alertStats, severities, unacknowledged] = await Promise.all([
      this.prisma.iiotReading.aggregate({ where, _count: true, _max: { recordedAt: true } }),
      Promise.all(
        Object.values(IiotMetric).map((metric) =>
          this.prisma.iiotReading.findFirst({
            where: { ...where, metric },
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            select: readingSelect,
          }),
        ),
      ),
      this.prisma.iiotAlert.aggregate({ where, _count: true, _max: { createdAt: true } }),
      this.prisma.iiotAlert.groupBy({ by: ['severity'], where, _count: true }),
      this.prisma.iiotAlert.count({ where: { ...where, acknowledgedAt: null } }),
    ]);
    return {
      productionOrder,
      telemetry: {
        totalReadings: telemetry._count,
        lastReadingAt: telemetry._max.recordedAt,
        latestByMetric: latest.filter((reading) => reading !== null).map(serializeReading),
      },
      alerts: {
        total: alertStats._count,
        warning: severities.find((group) => group.severity === 'WARNING')?._count ?? 0,
        critical: severities.find((group) => group.severity === 'CRITICAL')?._count ?? 0,
        unacknowledged,
        lastAlertAt: alertStats._max.createdAt,
      },
    };
  }

  async readings(productionOrderId: string, query: ReadingsQueryDto) {
    const recordedAt = dateRange(query);
    await this.productionOrder(productionOrderId);
    const { page, limit, metric, deviceId } = query;
    const where: Prisma.IiotReadingWhereInput = { productionOrderId, metric, deviceId, recordedAt };
    const [rows, total] = await Promise.all([
      this.prisma.iiotReading.findMany({
        where,
        select: readingSelect,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.iiotReading.count({ where }),
    ]);
    return { data: rows.map(serializeReading), meta: { page, limit, total } };
  }

  async alerts(productionOrderId: string, query: AlertsQueryDto) {
    const createdAt = dateRange(query);
    await this.productionOrder(productionOrderId);
    const { page, limit, severity, type } = query;
    const where: Prisma.IiotAlertWhereInput = { productionOrderId, severity, type, createdAt };
    const [rows, total] = await Promise.all([
      this.prisma.iiotAlert.findMany({
        where,
        select: {
          id: true,
          productionOrderId: true,
          type: true,
          severity: true,
          message: true,
          createdAt: true,
          acknowledgedAt: true,
          reading: { select: alertReadingSelect },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.iiotAlert.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        reading: row.reading === null ? null : serializeReading(row.reading),
      })),
      meta: { page, limit, total },
    };
  }
}
