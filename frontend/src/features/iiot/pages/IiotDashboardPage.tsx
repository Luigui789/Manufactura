import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailGrid, EmptyState, LoadingState, PageHeader, StatusBadge } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  isMonitoringNotFound,
  monitoringInterval,
  useIiotAlerts,
  useIiotOverview,
  useIiotReadings,
} from '../api/monitoring';
import { AlertSeverityFilter, AlertsTable } from '../components/AlertsTable';
import { MetricCard } from '../components/MetricCard';
import { TelemetryChart } from '../components/TelemetryChart';
import { METRIC_LABELS, monitoringDate } from '../presentation';
import { IIOT_METRICS, type IiotAlertSeverity, type IiotMetric } from '../types';

export function IiotDashboardPage() {
  const { id = '' } = useParams();
  return <Dashboard key={id} orderId={id} />;
}
function Dashboard({ orderId }: { orderId: string }) {
  const client = useQueryClient();
  const overview = useIiotOverview(orderId);
  const [selectedMetric, setSelectedMetric] = useState<IiotMetric>();
  const [severity, setSeverity] = useState<IiotAlertSeverity | ''>('');
  const current = overview.data;
  const notFound = isMonitoringNotFound(overview.error);
  const metrics = IIOT_METRICS.filter((metric) =>
    current?.telemetry.latestByMetric.some((reading) => reading.metric === metric),
  );
  const metric = metrics.find((value) => value === selectedMetric) ?? metrics[0];
  const status = overview.isError ? undefined : current?.productionOrder.status;
  const readings = useIiotReadings(
    orderId,
    { metric: metric ?? 'TEMPERATURE', limit: 100 },
    { status, enabled: Boolean(current && metric && !notFound) },
  );
  const alerts = useIiotAlerts(
    orderId,
    { severity: severity || undefined, limit: 20 },
    { status, enabled: Boolean(current && !notFound) },
  );
  const refreshing = overview.isFetching || readings.isFetching || alerts.isFetching;
  const order = current?.productionOrder;
  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title={'Monitoreo IIoT' + (order ? ' · ' + order.number : '')}
        description={
          order
            ? order.product.code + ' · ' + order.product.name
            : 'Telemetría de la orden de producción'
        }
        status={order && !notFound ? <StatusBadge status={order.status} /> : undefined}
        breadcrumbs={[
          { label: 'Producción', to: '/production/orders' },
          { label: order?.number ?? 'Orden', to: '/production/orders/' + orderId },
          { label: 'Monitoreo IIoT' },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/production/orders">Volver a órdenes de producción</Link>
            </Button>
            <Button
              variant="outline"
              disabled={refreshing}
              onClick={() =>
                void client.refetchQueries({ queryKey: ['iiot', orderId], type: 'active' })
              }
            >
              <RefreshCw aria-hidden className="size-4" />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </Button>
          </>
        }
      />
      {overview.isPending && <LoadingState label="Cargando monitoreo IIoT…" />}
      <ErrorNotice error={overview.error} />
      {notFound && (
        <p className="text-sm">La orden de producción no existe o ya no está disponible.</p>
      )}
      {current && !notFound && (
        <>
          <section className="surface space-y-4" aria-labelledby="iiot-order-summary">
            <h2 id="iiot-order-summary" className="font-semibold">
              Resumen de la orden
            </h2>
            <DetailGrid>
              <div>
                <dt>Inicio · Managua</dt>
                <dd>{monitoringDate(order!.startedAt)}</dd>
              </div>
              <div>
                <dt>Finalización · Managua</dt>
                <dd>{monitoringDate(order!.completedAt)}</dd>
              </div>
              <div>
                <dt>Última actualización del resumen · Managua</dt>
                <dd>{monitoringDate(new Date(overview.dataUpdatedAt).toISOString())}</dd>
              </div>
              <div>
                <dt>Actualización automática</dt>
                <dd>{monitoringInterval(status) ? 'Cada 5 segundos' : 'Detenida'}</dd>
              </div>
            </DetailGrid>
            {overview.isError && (
              <p className="text-sm text-muted-foreground">
                Se conserva el último resumen disponible. Usá Actualizar para reintentar.
              </p>
            )}
            {order?.status === 'COMPLETED' && (
              <p className="text-sm text-muted-foreground">
                Orden completada. El histórico permanece disponible para consulta.
              </p>
            )}
          </section>
          <section aria-labelledby="iiot-counts" className="space-y-3">
            <h2 id="iiot-counts" className="text-base font-semibold">
              Indicadores de telemetría
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total de lecturas', current.telemetry.totalReadings],
                ['Alertas WARNING', current.alerts.warning],
                ['Alertas CRITICAL', current.alerts.critical],
                ['Alertas sin reconocer', current.alerts.unacknowledged],
              ].map(([label, count]) => (
                <div key={label} className="surface space-y-2">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-3xl font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="iiot-latest" className="space-y-3">
            <h2 id="iiot-latest" className="font-semibold">
              Últimas métricas · Managua
            </h2>
            {current.telemetry.totalReadings === 0 ? (
              <EmptyState
                title="Todavía no hay telemetría para esta orden."
                description="Las lecturas aparecerán cuando un dispositivo publique datos IIoT."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((value) => (
                  <MetricCard
                    key={value}
                    reading={current.telemetry.latestByMetric.find(
                      (reading) => reading.metric === value,
                    )!}
                  />
                ))}
              </div>
            )}
          </section>
          {metric && (
            <section
              className="surface min-w-0 space-y-4"
              aria-labelledby="iiot-history"
              aria-busy={readings.isFetching}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="iiot-history" className="font-semibold">
                  Histórico · {METRIC_LABELS[metric]}
                </h2>
                <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
                  Métrica
                  <select
                    value={metric}
                    onChange={(event) => setSelectedMetric(event.target.value as IiotMetric)}
                  >
                    {metrics.map((value) => (
                      <option key={value} value={value}>
                        {METRIC_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-sm text-muted-foreground">
                Últimas 100 lecturas como máximo, en orden cronológico. Horas de Managua.
              </p>
              {readings.isLoading && <LoadingState label="Cargando histórico…" />}
              {readings.isFetching && !readings.isLoading && (
                <p role="status" className="text-sm text-muted-foreground">
                  Actualizando histórico…
                </p>
              )}
              <ErrorNotice error={readings.error} />
              {readings.data && <TelemetryChart metric={metric} readings={readings.data.data} />}
            </section>
          )}
          <section
            className="surface min-w-0 space-y-4"
            aria-labelledby="iiot-alerts"
            aria-busy={alerts.isFetching}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="iiot-alerts" className="font-semibold">
                Alertas recientes
              </h2>
              <AlertSeverityFilter value={severity} onChange={setSeverity} />
            </div>
            <p className="text-sm text-muted-foreground">
              Hasta 20 alertas recientes del filtro seleccionado · {current.alerts.total} alertas en
              total.
            </p>
            {alerts.isLoading && <LoadingState label="Cargando alertas…" />}
            {alerts.isFetching && !alerts.isLoading && (
              <p role="status" className="text-sm text-muted-foreground">
                Actualizando alertas…
              </p>
            )}
            <ErrorNotice error={alerts.error} />
            {alerts.data && <AlertsTable alerts={alerts.data.data} />}
          </section>
        </>
      )}
    </section>
  );
}
