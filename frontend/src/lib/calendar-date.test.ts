import { describe, expect, it } from 'vitest';
import { formatCalendarDate } from './calendar-date';
describe('calendar dates', () => {
  it('preserves October 14 when an instant would display October 13 in Managua', () => {
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Managua' }).format(
      new Date('2026-10-14'),
    );
    expect(local).toBe('2026-10-13');
    expect(formatCalendarDate('2026-10-14')).toBe('14/10/2026');
    expect(formatCalendarDate('2028-02-29')).toBe('29/02/2028');
  });
});
