import { describe, expect, it } from 'vitest';

import {
  createProductionRouteSchema,
  formatStandardMinutes,
  routeOperationsSchema,
} from './route-schemas';

const op = { sequence: 10, name: 'Mezclado', standardMinutes: '15.00' };

describe('Production route form', () => {
  it('normalizes metadata and accepts a single operation', () => {
    expect(
      createProductionRouteSchema.parse({
        productId: '00000000-0000-4000-8000-000000000001',
        code: ' rt-1 ',
        name: ' Jabón ',
        operations: [op],
      }),
    ).toMatchObject({ code: 'RT-1', name: 'Jabón' });
  });

  it.each(
    [
      [],
      [op, op],
      [{ ...op, sequence: 0 }],
      [{ ...op, name: ' ' }],
      [{ ...op, standardMinutes: '0' }],
      [{ ...op, standardMinutes: '0.001' }],
    ].map((operations) => ({ operations })),
  )('rejects invalid operations %j', ({ operations }) =>
    expect(routeOperationsSchema.safeParse({ operations }).success).toBe(false),
  );

  it('formats days without altering persisted minutes', () => {
    expect(formatStandardMinutes('21600.00')).toContain('15 días');
    expect(formatStandardMinutes('0.10')).toContain('0.1 min');
  });
});
