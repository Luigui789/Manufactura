import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { Boxes, ClipboardCheck, Factory, Leaf, ShoppingCart, Store } from 'lucide-react';
import { useProductionDashboard } from '@/features/production/api/dashboard';
import { useInventoryDashboard } from '@/features/inventory/api/dashboard';
import { usePurchasesDashboard } from '@/features/purchases/api/dashboard';
import { useSalesDashboard } from '@/features/sales/api/dashboard';
import { useQualityDashboard } from '@/features/production/api/quality-dashboard';
import { DashboardFilterBar, DashboardNote } from '@/components/dashboard';
import { isZeroMetric } from '@/lib/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
const ActivityChart = lazy(() =>
  import('./components/ActivityChart').then((m) => ({ default: m.ActivityChart })),
);
import { OverviewCard, Metrics, MinorMetrics, OpenLink } from './components/OverviewCard';
import { commercialActivity } from './commercial-activity';
import { compatibleHomePeriods, defaultHomePeriod, homePeriodError } from './period';

const nf = new Intl.NumberFormat('es-NI');

export function HomeDashboard() {
  // Resolve Managua's calendar only once, before any query. Every source gets both dates.
  const [period, setPeriod] = useState(defaultHomePeriod);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [validation, setValidation] = useState<string | null>(null);
  const production = useProductionDashboard(period);
  const inventory = useInventoryDashboard(period);
  const purchases = usePurchasesDashboard(period);
  const sales = useSalesDashboard(period);
  const quality = useQualityDashboard(period);
  const queries = [production, inventory, purchases, sales, quality];
  const periods = queries.flatMap((q) => (q.data ? [q.data.period] : []));
  const compatible = compatibleHomePeriods(periods, period);
  const usable = (q: typeof purchases | typeof sales | typeof quality) =>
    q.data && !q.isError && compatibleHomePeriods([q.data.period], period);
  const attention = [
    {
      domain: 'Compras',
      to: '/purchases/dashboard',
      query: purchases,
      items: [
        ['Pendientes de recepción', purchases.data?.pipeline.awaitingReceipt],
        ['Vencidas', purchases.data?.pipeline.overdue],
      ],
    },
    {
      domain: 'Ventas',
      to: '/sales/dashboard',
      query: sales,
      items: [['Pendientes de despacho', sales.data?.pipeline.awaitingDispatch]],
    },
    {
      domain: 'Calidad',
      to: '/quality/dashboard',
      query: quality,
      items: [
        ['Pendientes de inspección', quality.data?.current.pendingInspection],
        ['Rechazados sin disposición', quality.data?.current.rejectedAwaitingDisposition],
        ['Marcados para reproceso', quality.data?.current.rework],
      ],
    },
  ] as const;
  const attentionClear = attention.every(
    (group) => usable(group.query) && group.items.every(([, value]) => value === 0),
  );
  const commercial =
    purchases.data && sales.data && usable(purchases) && usable(sales)
      ? commercialActivity(purchases.data, sales.data, period)
      : null;
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <DashboardFilterBar
          idPrefix="home"
          label="Período común de los dashboards"
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          invalid={!!validation}
          errorId="home-period-error"
          onSubmit={() => {
            const next = { from, to };
            const error = homePeriodError(next);
            setValidation(error);
            if (!error) setPeriod(next);
          }}
          actions={
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={queries.every((q) => q.isFetching)}
              onClick={() => {
                for (const query of queries) void query.refetch();
              }}
            >
              Actualizar
            </Button>
          }
        />
        {validation && (
          <p id="home-period-error" role="alert" className="text-sm text-destructive">
            {validation}
          </p>
        )}
        <DashboardNote>
          Período común: {period.from} — {period.to} · America/Managua. Las colas y existencias
          actuales no dependen de estas fechas.
        </DashboardNote>
        {!compatible && (
          <p role="alert" className="text-sm text-destructive">
            Los dashboards devolvieron períodos, zonas o granularidades incompatibles. Revisá cada
            módulo; no se combinan series incompatibles.
          </p>
        )}
      </div>

      <section aria-labelledby="home-attention" className="space-y-3">
        <div className="space-y-1">
          <h2 id="home-attention" className="text-lg font-semibold">
            Requieren atención
          </h2>
          <p className="text-sm text-muted-foreground">
            {attentionClear
              ? 'Sin pendientes en este momento.'
              : 'Estado actual por dominio. Los conteos pueden solaparse y se muestran por separado.'}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attention.map((group) => (
            <div key={group.domain} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h3 className="text-sm font-semibold">{group.domain}</h3>
              <dl className="mt-2 divide-y">
                {group.items.map(([label, value]) => {
                  const shown = group.query.isPending
                    ? 'Cargando…'
                    : usable(group.query)
                      ? nf.format(value ?? 0)
                      : 'No disponible';
                  const active = typeof value === 'number' && !isZeroMetric(value);
                  return (
                    <div key={label} className="flex items-center justify-between gap-3 py-1.5">
                      <dt className="text-sm">
                        <Link
                          to={group.to}
                          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          <span className="sr-only">{group.domain} ·</span> {label}
                        </Link>
                      </dt>
                      <dd
                        className={`tabular-nums ${active && usable(group.query) ? 'text-lg font-semibold text-foreground' : 'text-sm text-muted-foreground'}`}
                      >
                        {shown}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-summary" className="space-y-3">
        <h2 id="home-summary" className="text-lg font-semibold">
          Resumen operativo
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <OverviewCard
            title="Producción"
            scope="Actividad del período"
            icon={Factory}
            to="/production/dashboard"
            query={production}
            period={period}
          >
            {(d) => (
              <Metrics
                primary={['Órdenes', d.orders.total]}
                secondary={[
                  ['Completadas', d.orders.completed],
                  ['En proceso', d.orders.inProgress],
                ]}
              />
            )}
          </OverviewCard>
          <OverviewCard
            title="Inventario"
            scope="Estado actual"
            icon={Boxes}
            to="/inventory/dashboard"
            query={inventory}
            period={period}
          >
            {(d) => (
              <>
                <Metrics
                  primary={['Posiciones con existencia', d.stockPositions.withOnHand]}
                  secondary={[
                    ['Lotes con existencia', d.lotsOnHand.total],
                    ['Lotes liberados', d.lotsOnHand.released],
                  ]}
                />
                <MinorMetrics
                  items={[
                    ['En cuarentena', d.lotsOnHand.quarantined],
                    ['Rechazados', d.lotsOnHand.rejected],
                    ['Reproceso', d.lotsOnHand.rework],
                  ]}
                />
              </>
            )}
          </OverviewCard>
          <OverviewCard
            title="Calidad"
            scope="Actividad del período"
            icon={ClipboardCheck}
            to="/quality/dashboard"
            query={quality}
            period={period}
          >
            {(d) => (
              <Metrics
                primary={['Inspecciones', d.inspections.total]}
                secondary={[
                  [
                    'Tasa de aprobación',
                    d.inspections.approvalRatePct === null
                      ? '—'
                      : `${d.inspections.approvalRatePct}%`,
                  ],
                  ['Rechazadas', d.inspections.rejected],
                ]}
              />
            )}
          </OverviewCard>
          <OverviewCard
            title="Compras"
            scope="Actividad del período"
            icon={ShoppingCart}
            to="/purchases/dashboard"
            query={purchases}
            period={period}
          >
            {(d) => (
              <Metrics
                primary={['Órdenes del período', d.orders.total]}
                secondary={[
                  ['Recepciones', d.receipts.total],
                  ['Valor comprometido', d.amounts.committed],
                ]}
              />
            )}
          </OverviewCard>
          <OverviewCard
            title="Ventas"
            scope="Actividad del período"
            icon={Store}
            to="/sales/dashboard"
            query={sales}
            period={period}
          >
            {(d) => (
              <Metrics
                primary={['Órdenes del período', d.orders.total]}
                secondary={[
                  ['Despachos', d.dispatches.total],
                  ['Valor confirmado', d.amounts.confirmed],
                ]}
              />
            )}
          </OverviewCard>
          <Card role="region" aria-label="Sostenibilidad" className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf aria-hidden className="size-4 text-muted-foreground" />
                <h3>Sostenibilidad</h3>
              </CardTitle>
              <CardDescription>Huella parcial de carbono y circularidad</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="max-w-prose text-sm leading-relaxed">
                Consultá la huella por orden de producción completada y los materiales circulares
                registrados.
              </p>
            </CardContent>
            <div className="border-t px-4 pt-1">
              <OpenLink to="/sustainability">Abrir sostenibilidad</OpenLink>
            </div>
          </Card>
        </div>
        <DashboardNote>
          Valores de compras y ventas tal como están registrados, sin moneda definida y con
          significados distintos.
        </DashboardNote>
      </section>

      <section aria-labelledby="home-activity" className="space-y-3">
        <h2 id="home-activity" className="text-lg font-semibold">
          Actividad del período
        </h2>
        <Suspense
          fallback={
            <p role="status" className="text-sm text-muted-foreground">
              Cargando gráficas…
            </p>
          }
        >
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <ActivityChart
              title="Actividad comercial"
              description="Órdenes de compra y venta, recepciones y despachos. Cada serie conserva su significado."
              rows={commercial}
              unavailable="La gráfica requiere datos compatibles de Compras y Ventas. Consultá el estado y reintento de cada módulo arriba."
              series={[
                {
                  key: 'purchaseOrders',
                  label: 'Órdenes de compra',
                  color: 'var(--color-primary)',
                },
                {
                  key: 'receipts',
                  label: 'Recepciones',
                  color: 'var(--color-chart-2)',
                  dash: '5 3',
                },
                {
                  key: 'saleOrders',
                  label: 'Órdenes de venta',
                  color: 'var(--color-chart-3)',
                  dash: '2 3',
                },
                {
                  key: 'dispatches',
                  label: 'Despachos',
                  color: 'var(--color-chart-4)',
                  dash: '8 3',
                },
              ]}
            />
            <ActivityChart
              title="Inspecciones de calidad"
              description="Aprobadas y rechazadas por fecha de inspección. Una disposición posterior conserva el resultado original."
              rows={quality.data && usable(quality) ? quality.data.inspectionsByPeriod : null}
              unavailable="La gráfica requiere los datos de Calidad. Consultá su estado y reintento arriba."
              series={[
                { key: 'approved', label: 'Aprobadas', color: 'var(--color-primary)' },
                {
                  key: 'rejected',
                  label: 'Rechazadas',
                  color: 'var(--color-chart-2)',
                  dash: '5 3',
                },
              ]}
            />
          </div>
        </Suspense>
      </section>
    </div>
  );
}
