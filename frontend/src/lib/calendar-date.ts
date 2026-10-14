/** PostgreSQL DATE is a calendar date, independent of the viewer's timezone. */
export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid calendar date');
  return `${match[3]}/${match[2]}/${match[1]}`;
}
