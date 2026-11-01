import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { businessOrigin, businessOriginSelect } from '../../inventory/business-origin.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const productSelect = { id: true, code: true, name: true, unit: true } as const;

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async get(rootLotId: string) {
    // Iterative DFS avoids a call-stack limit and returns a graph without repeated ancestor payloads.
    return this.prisma.$transaction(
      async (tx) => {
        const visited = new Set<string>();
        const active = new Set<string>();
        const stack = [{ id: rootLotId, exit: false }];
        const nodes: Array<Awaited<ReturnType<typeof this.node>>> = [];
        while (stack.length) {
          const frame = stack.pop()!;
          if (frame.exit) {
            active.delete(frame.id);
            visited.add(frame.id);
            continue;
          }
          if (active.has(frame.id)) throw new Error('Cycle detected in inventory lot traceability');
          if (visited.has(frame.id)) continue;
          const node = await this.node(tx, frame.id);
          nodes.push(node);
          active.add(frame.id);
          stack.push({ id: frame.id, exit: true });
          for (const id of [
            ...new Set(node.consumptions.flatMap((item) => (item.lotId ? [item.lotId] : []))),
          ].reverse())
            stack.push({ id, exit: false });
        }
        const outbound = await tx.inventoryMovement.findMany({
          where: { lotId: { in: nodes.map((node) => node.id) }, type: 'SALE_DISPATCH' },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            lotId: true,
            quantity: true,
            occurredAt: true,
            warehouse: { select: { id: true, code: true, name: true } },
            performedByUser: { select: { id: true, fullName: true } },
            saleDispatchItem: {
              select: {
                saleDispatch: {
                  select: {
                    id: true,
                    number: true,
                    dispatchedAt: true,
                    saleOrder: {
                      select: {
                        id: true,
                        number: true,
                        customer: { select: { id: true, code: true, name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const outboundByLot = new Map<string, typeof outbound>();
        for (const movement of outbound) {
          if (!movement.lotId || !movement.saleDispatchItem) continue;
          const entries = outboundByLot.get(movement.lotId) ?? [];
          entries.push(movement);
          outboundByLot.set(movement.lotId, entries);
        }
        const lots = nodes.map((node) => ({
          ...node,
          outbound: (outboundByLot.get(node.id) ?? []).map((movement) => ({
            id: movement.id,
            dispatchId: movement.saleDispatchItem!.saleDispatch.id,
            dispatchNumber: movement.saleDispatchItem!.saleDispatch.number,
            dispatchedAt: movement.saleDispatchItem!.saleDispatch.dispatchedAt,
            quantity: movement.quantity.abs().toFixed(4),
            saleOrder: movement.saleDispatchItem!.saleDispatch.saleOrder,
            warehouse: movement.warehouse,
            performedByUser: movement.performedByUser,
          })),
        }));
        return { rootLotId, lots };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 },
    );
  }

  private async node(tx: Prisma.TransactionClient, id: string) {
    const lot = await tx.lot.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        status: true,
        product: { select: productSelect },
        qualityInspection: { include: { inspectedBy: { select: { id: true, fullName: true } } } },
        qualityDisposition: { include: { decidedBy: { select: { id: true, fullName: true } } } },
        ...businessOriginSelect,
      },
    });
    if (!lot) throw new NotFoundException('Lote de trazabilidad no encontrado');
    const origin = businessOrigin(lot);
    if (!origin) throw new Error('Lot business origin is missing');
    const consumed = lot.productionOrderId
      ? await tx.inventoryMovement.findMany({
          where: { productionOrderId: lot.productionOrderId, type: 'PRODUCTION_CONSUMPTION' },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            quantity: true,
            lotId: true,
            productionOrder: { select: { id: true, number: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            product: { select: productSelect },
          },
        })
      : [];
    return {
      id: lot.id,
      code: lot.code,
      status: lot.status,
      product: lot.product,
      origin,
      quality: {
        inspection: lot.qualityInspection ?? null,
        disposition: lot.qualityDisposition ?? null,
      },
      consumptions: consumed.map((item) => ({ ...item, quantity: item.quantity.abs().toFixed(4) })),
    };
  }
}
