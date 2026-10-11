import { describe, expect, it, vi } from 'vitest';

import { type Prisma } from '../../generated/prisma/client.js';
import { DocumentSequenceService } from './document-sequence.service.js';

function makeTransaction(lastNumbers: number[] = [1]) {
  let updateIndex = 0;
  const createMany = vi.fn().mockResolvedValue({ count: 1 });
  const update = vi
    .fn()
    .mockImplementation(() => Promise.resolve({ lastNumber: lastNumbers[updateIndex++] ?? 1 }));
  const queryRaw = vi.fn().mockResolvedValue([{ id: 'sequence-id' }]);
  const tx = {
    documentSequence: {
      createMany,
      update,
    },
    $queryRaw: queryRaw,
  };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    createMany,
    update,
    queryRaw,
  };
}

describe('DocumentSequenceService', () => {
  it('numera OP con el año empresarial de Managua, separado de LOT', async () => {
    const { tx, createMany } = makeTransaction([7]);
    await expect(
      new DocumentSequenceService().nextCode(tx, 'OP', new Date('2027-01-01T05:30:00Z')),
    ).resolves.toBe('OP-2026-000007');
    expect(createMany).toHaveBeenCalledWith({
      data: [{ documentType: 'OP', year: 2026 }],
      skipDuplicates: true,
    });
  });
  it('genera un código LOT con seis dígitos y usa el contador bloqueado', async () => {
    const { tx, createMany, update } = makeTransaction([42]);
    const service = new DocumentSequenceService();

    await expect(service.nextCode(tx, 'LOT', new Date('2026-06-15T18:00:00.000Z'))).resolves.toBe(
      'LOT-2026-000042',
    );

    expect(createMany).toHaveBeenCalledWith({
      data: [{ documentType: 'LOT', year: 2026 }],
      skipDuplicates: true,
    });
    expect(update).toHaveBeenCalledWith({
      where: { documentType_year: { documentType: 'LOT', year: 2026 } },
      data: { lastNumber: { increment: 1 } },
      select: { lastNumber: true },
    });
  });

  it('determina el año usando Managua cerca del cambio de año', async () => {
    const { tx, createMany } = makeTransaction([1]);
    const service = new DocumentSequenceService();

    await expect(service.nextCode(tx, 'LOT', new Date('2026-01-01T05:59:59.999Z'))).resolves.toBe(
      'LOT-2025-000001',
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [{ documentType: 'LOT', year: 2025 }],
      skipDuplicates: true,
    });
  });

  it('serializa el acceso al contador con el bloqueo de fila', async () => {
    const { tx, update, queryRaw } = makeTransaction([1]);
    const service = new DocumentSequenceService();

    await service.nextCode(tx, 'LOT', new Date('2026-06-15T18:00:00.000Z'));

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('reserva varios números contiguos del mismo tipo bajo un único bloqueo', async () => {
    const { tx, update, queryRaw } = makeTransaction([3]);
    const service = new DocumentSequenceService();

    await expect(
      service.nextCodes(tx, ['LOT', 'LOT', 'LOT'], new Date('2026-06-15T18:00:00.000Z')),
    ).resolves.toEqual(
      new Map([['LOT', ['LOT-2026-000001', 'LOT-2026-000002', 'LOT-2026-000003']]]),
    );

    expect(queryRaw).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { documentType_year: { documentType: 'LOT', year: 2026 } },
      data: { lastNumber: { increment: 3 } },
      select: { lastNumber: true },
    });
  });

  it('rechaza fechas inválidas antes de tocar la transacción', async () => {
    const { tx, createMany } = makeTransaction();
    const service = new DocumentSequenceService();

    await expect(service.nextCode(tx, 'LOT', new Date(Number.NaN))).rejects.toThrow(RangeError);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('falla si no encuentra la fila del contador para bloquear', async () => {
    const { tx, update, queryRaw } = makeTransaction();
    queryRaw.mockResolvedValue([]);
    const service = new DocumentSequenceService();

    await expect(service.nextCode(tx, 'LOT', new Date('2026-06-15T18:00:00.000Z'))).rejects.toThrow(
      'No se pudo bloquear el contador del documento',
    );
    expect(update).not.toHaveBeenCalled();
  });
});
