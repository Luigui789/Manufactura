const PLANNING_TIME_ZONE = 'America/Managua';

const civilFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLANNING_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const displayFormatter = new Intl.DateTimeFormat('es-NI', {
  timeZone: PLANNING_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
});

type CivilDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function invalidDate(): never {
  throw new RangeError('La fecha de planificación no es válida.');
}

function instantDate(iso: string): Date {
  // Require an explicit offset so a malformed API value cannot use the host zone.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso)) invalidDate();
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) invalidDate();
  return date;
}

function civilDate(date: Date): CivilDate {
  const parts = new Map(civilFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    hour: Number(parts.get('hour')),
    minute: Number(parts.get('minute')),
    second: Number(parts.get('second')),
  };
}

function civilEpoch({ year, month, day, hour, minute, second }: CivilDate): number {
  const date = new Date(0);
  // setUTCFullYear avoids Date.UTC's special treatment of years 0–99.
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function planningInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const { year, month, day, hour, minute } = civilDate(instantDate(iso));
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function planningInstant(value: string): string | null {
  if (value === '') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) invalidDate();
  const [, year, month, day, hour, minute] = match;
  const civil: CivilDate = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: 0,
  };
  const wallTime = civilEpoch(civil);
  const wallDate = new Date(wallTime);
  if (
    civil.year < 1 ||
    wallDate.getUTCFullYear() !== civil.year ||
    wallDate.getUTCMonth() + 1 !== civil.month ||
    wallDate.getUTCDate() !== civil.day ||
    wallDate.getUTCHours() !== civil.hour ||
    wallDate.getUTCMinutes() !== civil.minute
  ) {
    invalidDate();
  }

  // Resolve Managua's offset for this date using Intl, including historical changes.
  // Only numeric UTC dates are constructed; datetime-local never uses the host zone.
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const difference = wallTime - civilEpoch(civilDate(new Date(instant)));
    if (difference === 0) return new Date(instant).toISOString();
    instant += difference;
  }

  // A historical clock change can make a local time nonexistent.
  return invalidDate();
}

export function formatPlanningDate(iso: string | null | undefined): string {
  return iso ? displayFormatter.format(instantDate(iso)) : '—';
}
