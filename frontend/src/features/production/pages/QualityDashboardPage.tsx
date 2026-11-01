import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CatalogPicker } from '@/components/CatalogPicker';
import { ErrorNotice } from '@/components/ErrorNotice';
import { EmptyState, LoadingState, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DashboardFilterBar,
  DashboardNote,
  DashboardSection,
  MetricCard,
  MetricGrid,
} from '@/components/dashboard';
import { chartAxis, chartGrid, chartLegend, chartTooltip, periodText } from '@/lib/dashboard';
import { lotStatusLabel } from '@/features/inventory/inventory-labels';
import { useQualityDashboard } from '../api/quality-dashboard';

const resultLabels = { APPROVED: 'Aprobada', REJECTED: 'Rechazada' };
const dispositionLabels = {
  RELEASE: 'Liberación excepcional',
  REWORK: 'Reproceso',
  SCRAP: 'Descarte',
};
const attentionLabels = {
  REJECTED_AWAITING_DISPOSITION: 'Rechazado sin disposición',
  PENDING_INSPECTION: 'Pendiente de inspección',
};
const dateFormat = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'short',
});
function PeriodChart({
  title,
  description,
  data,
  series,
}: {
  title: string;
  description: string;
  data: { period: string; [key: string]: string | number }[];
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={title} className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="period" {...chartAxis} minTickGap={16} />
              <YAxis allowDecimals={false} {...chartAxis} />
              <Tooltip {...chartTooltip} />
              <Legend {...chartLegend} />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Ver datos en tabla
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th>Período</th>
                  {series.map((s) => (
                    <th key={s.key} className="text-right">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    {series.map((s) => (
                      <td key={s.key} className="numeric">
                        {row[s.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
export function QualityDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productId, setProductId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = useQualityDashboard({ ...applied, ...(productId ? { productId } : {}) });
  const data = dashboard.data;
  const filtered = !!(from || to || productId || applied.from || applied.to);
  return (
    <section className="space-y-8">
      <PageHeader
        title="Dashboard de calidad"
        description="Estado actual y actividad de inspección. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Calidad' }, { label: 'Resumen' }]}
      />
      <DashboardFilterBar
        idPrefix="quality"
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        busy={dashboard.isFetching}
        onSubmit={() => setApplied({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}
        actions={
          filtered && (
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              onClick={() => {
                setFrom('');
                setTo('');
                setApplied({});
                setProductId('');
              }}
            >
              Limpiar filtros
            </Button>
          )
        }
      >
        <details className="rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Producto:{' '}
            {data?.selectedProduct
              ? `${data.selectedProduct.code} · ${data.selectedProduct.name}`
              : 'Todos'}
          </summary>
          <div className="mt-3">
            <CatalogPicker
              kind="product"
              value={productId}
              onChange={setProductId}
              allowInactive
              allProductTypes
            />
          </div>
        </details>
      </DashboardFilterBar>
      {dashboard.isPending && <LoadingState label="Cargando dashboard de calidad…" />}
      <ErrorNotice error={dashboard.error} />
      {dashboard.isError && (
        <Button
          variant="outline"
          disabled={dashboard.isFetching}
          onClick={() => void dashboard.refetch()}
        >
          Reintentar
        </Button>
      )}
      {data && (
        <>
          <DashboardSection
            title="Estado actual"
            description="Independiente de las fechas. El filtro de producto sí se aplica."
          >
            <MetricGrid columns={3}>
              <MetricCard label="Pendientes de inspección" value={data.current.pendingInspection} />
              <MetricCard
                label="Rechazados sin disposición"
                value={data.current.rejectedAwaitingDisposition}
              />
              <MetricCard label="Lotes marcados para reproceso" value={data.current.rework} />
            </MetricGrid>
            <Card>
              <CardHeader>
                <CardTitle>Requieren atención</CardTitle>
                <CardDescription>
                  Cola actual. Rechazos primero; los más antiguos de cada grupo primero. Hasta 5
                  lotes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.attention.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CircleCheck aria-hidden className="size-4 shrink-0" />
                    No hay lotes pendientes de atención.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Cola actual de calidad</caption>
                      <thead>
                        <tr>
                          <th>Lote</th>
                          <th>Producto</th>
                          <th>OP</th>
                          <th>Situación</th>
                          <th>Desde</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.attention.map((row) => (
                          <tr key={row.lot.id}>
                            <td>
                              <Link
                                className="table-link"
                                to={`/inventory/lots?lotId=${row.lot.id}`}
                              >
                                {row.lot.code}
                              </Link>
                            </td>
                            <td>
                              {row.product.code} · {row.product.name}
                            </td>
                            <td>
                              <Link
                                className="table-link"
                                to={`/production/orders/${row.productionOrder.id}`}
                              >
                                {row.productionOrder.number}
                              </Link>
                            </td>
                            <td>{attentionLabels[row.kind]}</td>
                            <td>{dateFormat.format(new Date(row.since))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </DashboardSection>
          <DashboardSection title="Actividad del período" description={periodText(data.period)}>
            <MetricGrid>
              <MetricCard label="Inspecciones" value={data.inspections.total} />
              <MetricCard label="Aprobadas" value={data.inspections.approved} />
              <MetricCard label="Rechazadas" value={data.inspections.rejected} />
              <MetricCard
                label="Tasa de aprobación"
                value={
                  data.inspections.approvalRatePct === null
                    ? '—'
                    : `${data.inspections.approvalRatePct}%`
                }
              />
            </MetricGrid>
            <DashboardNote>
              Porcentaje de inspecciones/lotes aprobados; cada inspección cuenta una vez,
              independientemente de la cantidad del lote.
            </DashboardNote>
            <h3 className="pt-2 text-base font-semibold">Disposiciones</h3>
            <MetricGrid>
              <MetricCard label="Disposiciones" value={data.dispositions.total} />
              <MetricCard label="Liberación excepcional" value={data.dispositions.release} />
              <MetricCard label="Reproceso" value={data.dispositions.rework} />
              <MetricCard label="Descarte" value={data.dispositions.scrap} />
            </MetricGrid>
            {data.inspections.total === 0 && data.dispositions.total === 0 ? (
              <EmptyState
                title="Sin actividad de calidad en este período."
                description="El estado actual y su cola de atención se muestran independientemente del período."
              />
            ) : (
              <div className="grid gap-6 xl:grid-cols-2">
                <PeriodChart
                  title="Aprobadas vs rechazadas por período"
                  description="Por fecha de inspección (inspectedAt)."
                  data={data.inspectionsByPeriod}
                  series={[
                    { key: 'approved', label: 'Aprobadas', color: 'var(--color-primary)' },
                    { key: 'rejected', label: 'Rechazadas', color: 'var(--color-chart-2)' },
                  ]}
                />
                <PeriodChart
                  title="Disposiciones por período"
                  description="Por fecha de decisión (decidedAt), independiente de la fecha de inspección."
                  data={data.dispositionsByPeriod}
                  series={[
                    {
                      key: 'release',
                      label: 'Liberación excepcional',
                      color: 'var(--color-primary)',
                    },
                    { key: 'rework', label: 'Reproceso', color: 'var(--color-chart-2)' },
                    { key: 'scrap', label: 'Descarte', color: 'var(--color-chart-3)' },
                  ]}
                />
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Inspecciones recientes</CardTitle>
                <CardDescription>
                  Hasta 5 inspecciones del período. La disposición y el estado del lote son contexto
                  actual; una liberación excepcional conserva el rechazo original.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentInspections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay inspecciones en este período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Inspecciones recientes del período</caption>
                      <thead>
                        <tr>
                          <th>Lote</th>
                          <th>Producto</th>
                          <th>OP</th>
                          <th>Resultado</th>
                          <th>Estado actual del lote</th>
                          <th>Inspector</th>
                          <th>Fecha</th>
                          <th>Disposición actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentInspections.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Link
                                className="table-link"
                                to={`/inventory/lots?lotId=${row.lot.id}`}
                              >
                                {row.lot.code}
                              </Link>
                            </td>
                            <td>
                              {row.product.code} · {row.product.name}
                            </td>
                            <td>
                              {row.productionOrder ? (
                                <Link
                                  className="table-link"
                                  to={`/production/orders/${row.productionOrder.id}`}
                                >
                                  {row.productionOrder.number}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{resultLabels[row.result]}</td>
                            <td>{lotStatusLabel(row.lot.status)}</td>
                            <td>{row.inspectedBy.fullName}</td>
                            <td>{dateFormat.format(new Date(row.inspectedAt))}</td>
                            <td>
                              {row.disposition ? (
                                <>
                                  {dispositionLabels[row.disposition.type]} ·{' '}
                                  {dateFormat.format(new Date(row.disposition.decidedAt))}
                                </>
                              ) : (
                                'Sin disposición'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </DashboardSection>
        </>
      )}
    </section>
  );
}
