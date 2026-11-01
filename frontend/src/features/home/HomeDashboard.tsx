import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { useProductionDashboard } from '@/features/production/api/dashboard';
import { useInventoryDashboard } from '@/features/inventory/api/dashboard';
import { usePurchasesDashboard } from '@/features/purchases/api/dashboard';
import { useSalesDashboard } from '@/features/sales/api/dashboard';
import { useQualityDashboard } from '@/features/production/api/quality-dashboard';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
const ActivityChart = lazy(() =>
  import('./components/ActivityChart').then((m) => ({ default: m.ActivityChart })),
);
import { OverviewCard, Metrics, MetricScope } from './components/OverviewCard';
import { commercialActivity } from './commercial-activity';
import { compatibleHomePeriods, defaultHomePeriod, homePeriodError } from './period';

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
      label: 'Compras · Pendientes de recepción',
      value: purchases.data?.pipeline.awaitingReceipt,
      query: purchases,
      to: '/purchases/dashboard',
    },
    {
      label: 'Compras · Vencidas',
      value: purchases.data?.pipeline.overdue,
      query: purchases,
      to: '/purchases/dashboard',
    },
    {
      label: 'Ventas · Pendientes de despacho',
      value: sales.data?.pipeline.awaitingDispatch,
      query: sales,
      to: '/sales/dashboard',
    },
    {
      label: 'Calidad · Pendientes de inspección',
      value: quality.data?.current.pendingInspection,
      query: quality,
      to: '/quality/dashboard',
    },
    {
      label: 'Calidad · Rechazados sin disposición',
      value: quality.data?.current.rejectedAwaitingDisposition,
      query: quality,
      to: '/quality/dashboard',
    },
    {
      label: 'Calidad · Marcados para reproceso',
      value: quality.data?.current.rework,
      query: quality,
      to: '/quality/dashboard',
    },
  ];
  const commercial =
    purchases.data && sales.data && usable(purchases) && usable(sales)
      ? commercialActivity(purchases.data, sales.data, period)
      : null;
  return (
    <div className="space-y-6">
      <form
        className="filter-bar flex flex-wrap items-end gap-3"
        aria-label="Período común de los dashboards"
        onSubmit={(event) => {
          event.preventDefault();
          const next = { from, to };
          const error = homePeriodError(next);
          setValidation(error);
          if (!error) setPeriod(next);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="home-from">Desde</Label>
          <input
            id="home-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-invalid={!!validation}
            aria-describedby={validation ? 'home-period-error' : undefined}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="home-to">Hasta</Label>
          <input
            id="home-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={!!validation}
            aria-describedby={validation ? 'home-period-error' : undefined}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={queries.every((q) => q.isFetching)}
          onClick={() => {
            for (const query of queries) void query.refetch();
          }}
        >
          Actualizar
        </Button>
      </form>
      {validation && (
        <p id="home-period-error" role="alert" className="text-sm text-destructive">
          {validation}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Período común: {period.from} — {period.to} · America/Managua. Las colas y existencias
        actuales no dependen de estas fechas.
      </p>
      {!compatible && (
        <p role="alert" className="text-sm text-destructive">
          Los dashboards devolvieron períodos, zonas o granularidades incompatibles. Revisá cada
          módulo; no se combinan series incompatibles.
        </p>
      )}
      <section aria-labelledby="home-attention" className="space-y-3">
        <h2 id="home-attention" className="text-lg font-semibold">
          Requieren atención
        </h2>
        <p className="text-sm text-muted-foreground">
          Estado actual por dominio. Los conteos pueden solaparse y se muestran por separado.
        </p>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attention.map((item) => (
            <div key={item.label} className="rounded-lg border bg-card p-4">
              <dt className="text-sm text-muted-foreground">
                <Link to={item.to} className="hover:underline">
                  {item.label}
                </Link>
              </dt>
              <dd className="mt-2 font-semibold tabular-nums">
                {item.query.isPending
                  ? 'Cargando…'
                  : usable(item.query)
                    ? item.value
                    : 'No disponible'}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="home-summary" className="space-y-3">
        <h2 id="home-summary" className="text-lg font-semibold">
          Resumen operativo
        </h2>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          <OverviewCard
            title="Producción"
            to="/production/dashboard"
            query={production}
            period={period}
          >
            {(d) => (
              <>
                <MetricScope>Actividad del período</MetricScope>
                <Metrics
                  items={[
                    ['Órdenes de producción', d.orders.total],
                    ['Completadas', d.orders.completed],
                    ['En proceso', d.orders.inProgress],
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Estados de las órdenes que pertenecen al período según Producción.
                </p>
              </>
            )}
          </OverviewCard>
          <OverviewCard
            title="Inventario"
            to="/inventory/dashboard"
            query={inventory}
            period={period}
          >
            {(d) => (
              <>
                <MetricScope>Estado actual</MetricScope>
                <Metrics
                  items={[
                    ['Posiciones con existencia', d.stockPositions.withOnHand],
                    ['Lotes con existencia', d.lotsOnHand.total],
                    ['Lotes liberados', d.lotsOnHand.released],
                    ['En cuarentena', d.lotsOnHand.quarantined],
                    ['Rechazados', d.lotsOnHand.rejected],
                    ['Marcados para reproceso', d.lotsOnHand.rework],
                  ]}
                />
              </>
            )}
          </OverviewCard>
          <OverviewCard title="Compras" to="/purchases/dashboard" query={purchases} period={period}>
            {(d) => (
              <>
                <MetricScope>Estado actual</MetricScope>
                <Metrics
                  items={[
                    ['Pendientes de recepción', d.pipeline.awaitingReceipt],
                    ['Órdenes vencidas', d.pipeline.overdue],
                  ]}
                />
                <MetricScope>Actividad del período</MetricScope>
                <Metrics
                  items={[
                    ['Órdenes del período', d.orders.total],
                    ['Recepciones', d.receipts.total],
                    ['Valor comprometido', d.amounts.committed],
                    ['Proveedores con actividad', d.suppliers.usedInPeriod],
                  ]}
                />
              </>
            )}
          </OverviewCard>
          <OverviewCard title="Ventas" to="/sales/dashboard" query={sales} period={period}>
            {(d) => (
              <>
                <MetricScope>Estado actual</MetricScope>
                <Metrics items={[['Pendientes de despacho', d.pipeline.awaitingDispatch]]} />
                <MetricScope>Actividad del período</MetricScope>
                <Metrics
                  items={[
                    ['Órdenes del período', d.orders.total],
                    ['Despachos', d.dispatches.total],
                    ['Valor confirmado', d.amounts.confirmed],
                    ['Clientes con actividad', d.customers.usedInPeriod],
                  ]}
                />
              </>
            )}
          </OverviewCard>
          <OverviewCard title="Calidad" to="/quality/dashboard" query={quality} period={period}>
            {(d) => (
              <>
                <MetricScope>Estado actual</MetricScope>
                <Metrics
                  items={[
                    ['Pendientes de inspección', d.current.pendingInspection],
                    ['Rechazados sin disposición', d.current.rejectedAwaitingDisposition],
                    ['Marcados para reproceso', d.current.rework],
                  ]}
                />
                <MetricScope>Actividad del período</MetricScope>
                <Metrics
                  items={[
                    ['Inspecciones', d.inspections.total],
                    ['Aprobadas', d.inspections.approved],
                    ['Rechazadas', d.inspections.rejected],
                    [
                      'Tasa de aprobación',
                      d.inspections.approvalRatePct === null
                        ? '—'
                        : `${d.inspections.approvalRatePct}%`,
                    ],
                    ['Disposiciones de descarte', d.dispositions.scrap],
                  ]}
                />
              </>
            )}
          </OverviewCard>
          <Card role="region" aria-label="Sostenibilidad">
            <CardHeader>
              <CardTitle>
                <h3>Sostenibilidad</h3>
              </CardTitle>
              <CardDescription>Huella parcial de carbono y circularidad</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link className="text-primary underline" to="/sustainability">
                Ver sostenibilidad
              </Link>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          Valores de compras y ventas tal como están registrados, sin moneda definida y con
          significados distintos.
        </p>
      </section>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando gráficas…</p>}>
        <section aria-label="Gráficos del período" className="grid min-w-0 gap-4 xl:grid-cols-2">
          <ActivityChart
            title="Actividad comercial"
            description="Órdenes de compra y venta, recepciones y despachos. Cada serie conserva su significado."
            rows={commercial}
            unavailable="La gráfica requiere datos compatibles de Compras y Ventas. Consultá el estado y reintento de cada módulo arriba."
            series={[
              { key: 'purchaseOrders', label: 'Órdenes de compra', color: 'var(--color-primary)' },
              { key: 'receipts', label: 'Recepciones', color: 'var(--color-chart-2)', dash: '5 3' },
              {
                key: 'saleOrders',
                label: 'Órdenes de venta',
                color: 'var(--color-chart-3)',
                dash: '2 3',
              },
              { key: 'dispatches', label: 'Despachos', color: 'var(--color-chart-4)', dash: '8 3' },
            ]}
          />
          <ActivityChart
            title="Inspecciones de calidad"
            description="Aprobadas y rechazadas por fecha de inspección. Una disposición posterior conserva el resultado original."
            rows={quality.data && usable(quality) ? quality.data.inspectionsByPeriod : null}
            unavailable="La gráfica requiere los datos de Calidad. Consultá su estado y reintento arriba."
            series={[
              { key: 'approved', label: 'Aprobadas', color: 'var(--color-primary)' },
              { key: 'rejected', label: 'Rechazadas', color: 'var(--color-chart-2)', dash: '5 3' },
            ]}
          />
        </section>
      </Suspense>
    </div>
  );
}
