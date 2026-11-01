import { describe, expect, it } from 'vitest';

import { plainToInstance } from 'class-transformer';

import { validate } from 'class-validator';

import { operationData, serializeRoute } from './routes.service.js';

import { CreateProductionRouteDto } from './dto/routes.dto.js';

import { Prisma } from '../../generated/prisma/client.js';

const op = { sequence: 10, name: ' Mezclado ', standardMinutes: '15.00' };

describe('Production routes invariants', () => {
  it('normalizes text and preserves Decimal precision', () => {
    expect(operationData([op])[0]).toMatchObject({
      name: 'Mezclado',
      description: null,
      standardMinutes: new Prisma.Decimal('15'),
    });
  });

  it.each(['0', '0.00', '-1', '0.001', '10000000000', '1e3', 'NaN'])(
    'rejects invalid decimal %s',
    (standardMinutes) => expect(() => operationData([{ ...op, standardMinutes }])).toThrow(),
  );

  it.each([0, -1, 1.5, 2147483648])('rejects sequence %s', (sequence) =>
    expect(() => operationData([{ ...op, sequence }])).toThrow(),
  );

  it('requires operations, unique sequences and names', () => {
    expect(() => operationData([])).toThrow();

    expect(() => operationData([op, op])).toThrow();

    expect(() => operationData([{ ...op, name: ' ' }])).toThrow();
  });

  it('serializes decimal strings and calculates exact total', () => {
    const route = {
      operations: [
        { ...op, standardMinutes: new Prisma.Decimal('0.10') },
        { ...op, standardMinutes: new Prisma.Decimal('0.20') },
      ],
    } as Parameters<typeof serializeRoute>[0];

    expect(serializeRoute(route)).toMatchObject({
      operationCount: 2,
      totalStandardMinutes: '0.30',
      operations: [{ standardMinutes: '0.10' }, { standardMinutes: '0.20' }],
    });
  });

  it('DTO normalizes code, name and empty descriptions', async () => {
    const dto = plainToInstance(CreateProductionRouteDto, {
      productId: '00000000-0000-4000-8000-000000000001',
      code: ' rt-jabon ',
      name: ' Jabón ',
      description: ' ',
      operations: [op],
    });

    expect(await validate(dto)).toEqual([]);

    expect(dto).toMatchObject({ code: 'RT-JABON', name: 'Jabón', description: null });
  });

  it.each([
    { code: ' ' },
    { name: ' ' },
    { code: null },
    { name: null },
    { operations: [] },
    { operations: [op, op] },
    { operations: [{ ...op, standardMinutes: 15 }] },
  ])('DTO rejects malformed input %j', async (change) => {
    const dto = plainToInstance(CreateProductionRouteDto, {
      productId: '00000000-0000-4000-8000-000000000001',
      code: 'RT',
      name: 'Route',
      operations: [op],
      ...change,
    });

    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
