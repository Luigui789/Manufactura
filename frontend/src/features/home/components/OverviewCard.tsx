import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { formatMetric, isZeroMetric } from '@/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { compatibleHomePeriods, type HomePeriod } from '../period';
import type { ProductionDashboard } from '@/features/production/api/dashboard';

/** Same wording and shape on every module card; the hidden suffix keeps names unique. */
export function OpenLink({
  to,
  children,
  context,
}: {
  to: string;
  children: string;
  context?: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium underline-offset-4 hover:underline"
    >
      {children}
      {context && (
        <>
          {' '}
          <span className="sr-only">de {context}</span>
        </>
      )}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}

export function OverviewCard<T extends { period: ProductionDashboard['period'] }>({
  title,
  scope,
  icon: Icon,
  to,
  query,
  period,
  children,
}: {
  title: string;
  /** Whether the card shows current state or period activity. */
  scope: string;
  icon: LucideIcon;
  to: string;
  query: UseQueryResult<T, Error>;
  period: HomePeriod;
  children: (data: T) => ReactNode;
}) {
  const mismatch = query.data && !compatibleHomePeriods([query.data.period], period);
  const error =
    query.error ??
    (mismatch ? new Error(`${title}: el período recibido no coincide con el solicitado.`) : null);
  return (
    <Card role="region" aria-label={title} className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>{scope}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {query.isPending && (
          <>
            <p role="status" className="sr-only">
              Cargando {title.toLowerCase()}…
            </p>
            <div aria-hidden className="space-y-3 motion-safe:animate-pulse">
              <div className="h-9 w-20 rounded bg-muted" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 rounded bg-muted/70" />
                <div className="h-10 rounded bg-muted/70" />
              </div>
            </div>
          </>
        )}
        <ErrorNotice error={error} />
        {error && (
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Reintentar {title.toLowerCase()}
          </Button>
        )}
        {query.data && !error && children(query.data)}
      </CardContent>
      <div className="border-t px-4 pt-1">
        <OpenLink to={to} context={title.toLowerCase()}>
          Abrir dashboard
        </OpenLink>
      </div>
    </Card>
  );
}

const valueTone = (value: string | number) =>
  isZeroMetric(value) ? 'text-muted-foreground' : 'text-foreground';

/** One dominant KPI and up to two secondary KPIs, identical structure in every module. */
export function Metrics({
  primary,
  secondary,
}: {
  primary: [string, string | number];
  secondary: [string, string | number][];
}) {
  return (
    <dl className="space-y-3">
      <div>
        <dt className="text-sm text-muted-foreground">{primary[0]}</dt>
        <dd
          className={`text-3xl font-semibold tracking-tight tabular-nums ${valueTone(primary[1])}`}
        >
          {formatMetric(primary[1])}
        </dd>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {secondary.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`break-words text-lg font-semibold tabular-nums ${valueTone(value)}`}>
              {formatMetric(value)}
            </dd>
          </div>
        ))}
      </div>
    </dl>
  );
}

/** Small secondary indicators that must stay visible without competing with the KPIs. */
export function MinorMetrics({ items }: { items: [string, number][] }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      {items.map(([label, value]) => (
        <div key={label} className="flex gap-1">
          <dt>{label}</dt>
          <dd className={`font-medium tabular-nums ${valueTone(value)}`}>{formatMetric(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
