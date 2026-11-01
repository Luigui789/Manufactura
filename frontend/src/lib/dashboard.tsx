// Non-component dashboard helpers live apart from components so Fast Refresh keeps working.
const numberFormat = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 4 });

/** Numbers are localized; strings (Decimal amounts, percentages, units) are shown verbatim. */
export const formatMetric = (value: string | number) =>
  typeof value === 'number' ? numberFormat.format(value) : value;

const granularityLabels = { day: 'día', week: 'semana', month: 'mes' } as const;
/** Same period wording on every dashboard: "2026-10-01 — 2026-10-30 · Managua · Por día". */
export const periodText = (period: {
  from: string;
  to: string;
  granularity: keyof typeof granularityLabels;
}) => `${period.from} — ${period.to} · Managua · Por ${granularityLabels[period.granularity]}`;

/** A zero stays visible but must not compete with real activity. */
export const isZeroMetric = (value: string | number) =>
  value === 0 || (typeof value === 'string' && /^0(?:\.0+)?$/.test(value));

/** Shared Recharts styling: quiet grid, readable ticks and tooltips on theme tokens. */
export const chartGrid = {
  strokeDasharray: '3 3',
  vertical: false,
  stroke: 'var(--color-border)',
} as const;
export const chartAxis = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 12, fill: 'var(--color-muted-foreground)' },
} as const;
export const chartTooltip = {
  cursor: { fill: 'var(--color-muted)', stroke: 'var(--color-border)' },
  contentStyle: {
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    background: 'var(--color-popover)',
    color: 'var(--color-popover-foreground)',
    fontSize: 12,
  },
} as const;
export const chartLegend = {
  iconSize: 10,
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  formatter: (value: string) => <span className="text-foreground">{value}</span>,
};
