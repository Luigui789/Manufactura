import { useId } from 'react';
import { Link } from 'react-router';
import { DetailGrid, EmptyState, LoadingState } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useIiotAlerts, useIiotOverview } from '../api/monitoring';
import { METRIC_LABELS, monitoringDate } from '../presentation';

/** Production evidence only: inspection state and mutations belong to Quality. */
export function QualityIiotContext({ productionOrderId }: { productionOrderId: string }) {
  const id = useId();
  const overview = useIiotOverview(productionOrderId);
  const alerts = useIiotAlerts(productionOrderId, {}, { status: 'COMPLETED' });
  const current = overview.data;
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-4 rounded-md border p-4">
      <h3 id={id} className="font-semibold">
        Contexto IIoT de producción
      </h3>
      <p className="text-sm text-muted-foreground">
        Los datos IIoT son información de apoyo para la inspección. La aprobación o rechazo del lote
        requiere una decisión explícita del inspector. Una alerta CRITICAL no implica rechazo
        automático; la ausencia de alertas no sustituye la inspección.
      </p>
      <p className="text-xs text-muted-foreground">
        DEMO / SYNTHETIC · Reglas académicas; no representan límites industriales certificados.
      </p>
      {overview.isPending && <LoadingState label="Cargando contexto IIoT…" />}
      <ErrorNotice error={overview.error} />
      {current && !overview.isError && (
        <>
          <DetailGrid>
            {[
              ['Total de lecturas', current.telemetry.totalReadings],
              ['Alertas WARNING', current.alerts.warning],
              ['Alertas CRITICAL', current.alerts.critical],
              ['Total de alertas', current.alerts.total],
              ['Última lectura · Managua', monitoringDate(current.telemetry.lastReadingAt)],
              ['Última alerta · Managua', monitoringDate(current.alerts.lastAlertAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </DetailGrid>
          {current.alerts.critical > 0 && (
            <p role="note" className="rounded-md border border-destructive/50 p-3 text-sm">
              Se registraron {current.alerts.critical} alertas críticas durante la producción.
              Revisá las desviaciones antes de registrar el resultado de Calidad.
            </p>
          )}
          {current.alerts.total === 0 && (
            <p className="text-sm">No se registraron alertas IIoT durante la producción.</p>
          )}
          {current.telemetry.totalReadings === 0 ? (
            <EmptyState
              title="No hay telemetría IIoT registrada para esta orden."
              description="La inspección de Calidad continúa siendo manual."
            />
          ) : (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Últimas métricas · Managua</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                {current.telemetry.latestByMetric.map((reading) => (
                  <div key={reading.metric} className="min-w-0 rounded-md bg-muted/30 p-3 text-sm">
                    <dt className="font-medium">{METRIC_LABELS[reading.metric]}</dt>
                    <dd className="break-words tabular-nums">
                      {reading.value} {reading.unit}
                    </dd>
                    <dd>
                      {reading.device.code} · {reading.device.name}
                    </dd>
                    <dd>
                      <time dateTime={reading.recordedAt}>
                        {monitoringDate(reading.recordedAt)}
                      </time>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </>
      )}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Hasta 5 alertas recientes · Managua</h4>
        {alerts.isPending && <LoadingState label="Cargando alertas IIoT…" />}
        <ErrorNotice error={alerts.error} />
        {alerts.data && !alerts.isError && (
          <ul className="space-y-2">
            {alerts.data.data.slice(0, 5).map((alert) => (
              <li key={alert.id} className="space-y-1 rounded-md border p-3 text-sm">
                <p className="break-words font-medium">
                  {alert.severity} · {alert.type}
                </p>
                <p>
                  {alert.reading ? METRIC_LABELS[alert.reading.metric] : '—'} ·{' '}
                  {alert.reading ? `${alert.reading.value} ${alert.reading.unit}` : '—'}
                </p>
                <p>{alert.reading?.device.code ?? '—'}</p>
                <time dateTime={alert.createdAt}>{monitoringDate(alert.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Link
        className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        to={'/production/orders/' + productionOrderId + '/iiot'}
      >
        Ver monitoreo IIoT completo
      </Link>
    </section>
  );
}
