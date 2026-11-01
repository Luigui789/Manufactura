import type { FormEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { formatMetric, isZeroMetric } from '@/lib/dashboard';

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <dl className="min-w-0 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
        {label}
      </dt>
      <dd
        className={`mt-1.5 break-words text-2xl font-semibold tracking-tight tabular-nums ${isZeroMetric(value) ? 'text-muted-foreground' : ''}`}
      >
        {formatMetric(value)}
      </dd>
      {helper && <dd className="mt-1 text-xs text-muted-foreground">{helper}</dd>}
    </dl>
  );
}

export function MetricGrid({
  children,
  columns = 4,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  const layout = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  }[columns];
  return <div className={`grid gap-3 ${layout}`}>{children}</div>;
}

/** Visually separates "current state" from "period activity" and similar blocks. */
export function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Methodology notes: kept visible for the defense, but discreet next to the data. */
export function DashboardNote({ children }: { children: ReactNode }) {
  return <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

export function DashboardFilterBar({
  idPrefix,
  label = 'Filtrar dashboard por fecha',
  from,
  to,
  onFromChange,
  onToChange,
  onSubmit,
  busy,
  invalid,
  errorId,
  actions,
  children,
}: {
  idPrefix: string;
  label?: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  invalid?: boolean;
  errorId?: string;
  actions?: ReactNode;
  /** Extra catalog filters (product, warehouse, supplier, customer). */
  children?: ReactNode;
}) {
  const input = 'h-10 w-full rounded-md border bg-background px-3 text-sm sm:w-auto';
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4"
        aria-label={label}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor={`${idPrefix}-from`}>Desde</Label>
          <input
            id={`${idPrefix}-from`}
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={input}
          />
        </div>
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor={`${idPrefix}-to`}>Hasta</Label>
          <input
            id={`${idPrefix}-to`}
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={input}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="outline" className="h-10" disabled={busy}>
            Aplicar
          </Button>
          {actions}
        </div>
      </form>
      {children && <div className="grid items-start gap-3 md:grid-cols-2">{children}</div>}
    </div>
  );
}
