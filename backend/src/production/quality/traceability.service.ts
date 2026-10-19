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
        return { rootLotId, lots: nodes };
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
      consumptions: consumed.map((item) => ({ ...item, quantity: item.quantity.abs().toFixed(4) })),
    };
  }
}
