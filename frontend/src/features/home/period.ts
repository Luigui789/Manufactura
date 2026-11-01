import type { ProductionDashboard } from '@/features/production/api/dashboard';

export const HOME_TIME_ZONE = 'America/Managua';
const DAY = 86_400_000;
export type HomePeriod = Pick<ProductionDashboard['period'], 'from' | 'to'>;
type SourcePeriod = ProductionDashboard['period'];

export function defaultHomePeriod(now = new Date()): HomePeriod {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: HOME_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const to = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    from: new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY).toISOString().slice(0, 10),
    to,
  };
}

export function homePeriodError({ from, to }: HomePeriod): string | null {
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01')
      return 'Ingresá fechas válidas (YYYY-MM-DD).';
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      return 'Ingresá fechas válidas (YYYY-MM-DD).';
  }
  if (from > to) return 'Desde no puede ser posterior a Hasta.';
  if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > 366)
    return 'El período no puede superar 366 días.';
  return null;
}

export function compatibleHomePeriods(periods: SourcePeriod[], expected: HomePeriod) {
  return periods.every(
    (p) =>
      p.from === expected.from &&
      p.to === expected.to &&
      p.timeZone === HOME_TIME_ZONE &&
      p.granularity === periods[0]?.granularity,
  );
}
