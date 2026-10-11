import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatPlanningDate, planningInputValue, planningInstant } from './planning-dates';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fechas opcionales de planificación', () => {
  it.each([null, undefined, ''])('representa una fecha ausente: %s', (iso) => {
    expect(planningInputValue(iso)).toBe('');
    expect(formatPlanningDate(iso)).toBe('—');
  });

  it('convierte el campo vacío a null', () => {
    expect(planningInstant('')).toBeNull();
  });

  it('presenta un instante UTC en hora de Managua', () => {
    expect(planningInputValue('2026-10-10T16:30:00.000Z')).toBe('2026-10-10T10:30');
    expect(planningInstant('2026-10-10T10:30')).toBe('2026-10-10T16:30:00.000Z');
  });

  it('interpreta también instantes con un offset explícito', () => {
    expect(planningInputValue('2026-10-10T10:30:00-06:00')).toBe('2026-10-10T10:30');
  });

  it('conserva correctamente el cambio de año entre Managua y UTC', () => {
    expect(planningInputValue('2027-01-01T04:00:00.000Z')).toBe('2026-12-31T22:00');
    expect(planningInstant('2026-12-31T22:00')).toBe('2027-01-01T04:00:00.000Z');
    expect(planningInstant('2027-01-01T00:15')).toBe('2027-01-01T06:15:00.000Z');
  });

  it.each([
    ['2026-01-01T00:00', '2026-01-01T06:00:00.000Z'],
    ['2026-12-31T23:59', '2027-01-01T05:59:00.000Z'],
    ['2028-02-29T23:59', '2028-03-01T05:59:00.000Z'],
  ])('hace ida y vuelta a precisión de minuto: %s', (local, iso) => {
    expect(planningInstant(local)).toBe(iso);
    expect(planningInputValue(iso)).toBe(local);
  });

  it('el campo datetime-local omite segundos y milisegundos', () => {
    expect(planningInputValue('2026-10-10T16:30:42.123Z')).toBe('2026-10-10T10:30');
  });

  it('usa el offset histórico de Managua en lugar de fijar UTC-6', () => {
    expect(planningInstant('2006-07-10T10:30')).toBe('2006-07-10T15:30:00.000Z');
    expect(planningInputValue('2006-07-10T15:30:00.000Z')).toBe('2006-07-10T10:30');
  });

  it('muestra la fecha y hora en español de Nicaragua', () => {
    const rendered = formatPlanningDate('2027-01-01T04:00:00.000Z');
    expect(rendered).toContain('31');
    expect(rendered).toContain('dic');
    expect(rendered).toContain('2026');
    expect(rendered).toContain('22:00');
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Honolulu'])(
    'ignora la zona horaria del host: %s',
    (hostZone) => {
      vi.stubEnv('TZ', hostZone);
      expect(planningInputValue('2027-01-01T04:00:00.000Z')).toBe('2026-12-31T22:00');
      expect(planningInstant('2026-12-31T22:00')).toBe('2027-01-01T04:00:00.000Z');
      expect(formatPlanningDate('2027-01-01T04:00:00.000Z')).toContain('22:00');
    },
  );

  it.each([
    '2026-02-30T10:30',
    '2026-02-29T10:30',
    '2026-13-01T10:30',
    '2026-00-01T10:30',
    '2026-10-00T10:30',
    '2026-10-10T24:00',
    '2026-10-10T10:60',
    '0000-01-01T10:30',
    '2026-10-10 10:30',
    '2026-10-10T10:30Z',
    'invalid',
    ' ',
  ])('rechaza el campo local inválido: %s', (value) => {
    expect(() => planningInstant(value)).toThrow(RangeError);
  });

  it.each(['invalid', '2026-10-10T10:30', '2026-13-10T10:30:00Z'])(
    'rechaza una fecha API inválida o sin offset: %s',
    (value) => {
      expect(() => planningInputValue(value)).toThrow(RangeError);
      expect(() => formatPlanningDate(value)).toThrow(RangeError);
    },
  );
});
