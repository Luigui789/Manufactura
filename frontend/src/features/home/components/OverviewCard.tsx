import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { compatibleHomePeriods, type HomePeriod } from '../period';
import type { ProductionDashboard } from '@/features/production/api/dashboard';

export function OverviewCard<T extends { period: ProductionDashboard['period'] }>({
  title,
  to,
  query,
  period,
  children,
}: {
  title: string;
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
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>
          <Link className="text-primary underline" to={to}>
            Ver dashboard de {title.toLowerCase()}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando {title.toLowerCase()}…
          </p>
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
    </Card>
  );
}
export function Metrics({ items }: { items: [string, string | number][] }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map(([label, value]) => (
        <div className="flex justify-between gap-4" key={label}>
          <dt>{label}</dt>
          <dd className="text-right font-medium tabular-nums">
            {typeof value === 'number' ? new Intl.NumberFormat('es-NI').format(value) : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function MetricScope({ children }: { children: ReactNode }) {
  return (
    <h4 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}
