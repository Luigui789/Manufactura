import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DispositionDto } from './disposition.dto.js';
describe('DispositionDto', () => {
  it.each(['RELEASE', 'REWORK', 'SCRAP'])('accepts %s and trims reason', async (type) => {
    const dto = plainToInstance(DispositionDto, { type, reason: '  Decisión humana  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.reason).toBe('Decisión humana');
  });
  it.each(['', '   ', '\t\n', 'a'.repeat(1001), null, 123])(
    'rejects invalid reason %j',
    async (reason) => {
      expect(
        (await validate(plainToInstance(DispositionDto, { type: 'SCRAP', reason }))).length,
      ).toBeGreaterThan(0);
    },
  );
  it('rejects invalid disposition', async () => {
    expect(
      (await validate(plainToInstance(DispositionDto, { type: 'APPROVED', reason: 'Motivo' })))
        .length,
    ).toBeGreaterThan(0);
  });
});
