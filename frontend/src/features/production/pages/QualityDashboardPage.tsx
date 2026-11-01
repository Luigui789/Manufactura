import { useState } from 'react';
import { Link } from 'react-router';
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
import { Label } from '@/components/ui/label';
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
const nf = new Intl.NumberFormat('es-NI');
const dateFormat = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'short',
});
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{typeof value === 'number' ? nf.format(value) : value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
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
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend formatter={(value) => <span className="text-foreground">{value}</span>} />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer">Ver datos en tabla</summary>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th>Período</th>
                  {series.map((s) => (
                    <th key={s.key}>{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.period}>
                    <td>{row.period}</td>
                    {series.map((s) => (
                      <td key={s.key}>{row[s.key]}</td>
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
  return (
    <section className="space-y-6">
      <PageHeader
        title="Dashboard de calidad"
        description="Estado actual y actividad de inspección. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Producción', to: '/production/orders' }, { label: 'Dashboard' }]}
      />
      <form
        className="filter-bar flex flex-wrap items-end gap-3"
        aria-label="Filtrar dashboard por fecha"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="quality-from">Desde</Label>
          <input
            id="quality-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quality-to">Hasta</Label>
          <input
            id="quality-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" disabled={dashboard.isFetching}>
          Aplicar
        </Button>
      </form>
      <div className="space-y-3">
        <details>
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
        {productId && (
          <Button variant="outline" onClick={() => setProductId('')}>
            Todos los productos
          </Button>
        )}
      </div>
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
          <div>
            <h2 className="text-lg font-semibold">Estado actual</h2>
            <p className="text-sm text-muted-foreground">
              Independiente de las fechas. El filtro de producto sí se aplica.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Pendientes de inspección" value={data.current.pendingInspection} />
            <Metric
              label="Rechazados sin disposición"
              value={data.current.rejectedAwaitingDisposition}
            />
            <Metric label="Lotes marcados para reproceso" value={data.current.rework} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Actividad del período</h2>
            <p className="text-sm text-muted-foreground">
              {data.period.from} — {data.period.to} · Managua · Por{' '}
              {{ day: 'día', week: 'semana', month: 'mes' }[data.period.granularity]}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Inspecciones" value={data.inspections.total} />
            <Metric label="Aprobadas" value={data.inspections.approved} />
            <Metric label="Rechazadas" value={data.inspections.rejected} />
            <Metric
              label="Tasa de aprobación"
              value={
                data.inspections.approvalRatePct === null
                  ? '—'
                  : `${data.inspections.approvalRatePct}%`
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Porcentaje de inspecciones/lotes aprobados; cada inspección cuenta una vez,
            independientemente de la cantidad del lote.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Disposiciones" value={data.dispositions.total} />
            <Metric label="Liberación excepcional" value={data.dispositions.release} />
            <Metric label="Reproceso" value={data.dispositions.rework} />
            <Metric label="Descarte" value={data.dispositions.scrap} />
          </div>
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
              <CardTitle>Requieren atención</CardTitle>
              <CardDescription>
                Cola actual. Rechazos primero; los más antiguos de cada grupo primero. Hasta 5
                lotes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
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
                        <tr key={row.lot.id} className="border-t">
                          <td className="py-3">
                            <Link
                              className="text-primary underline"
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
                              className="text-primary underline"
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
                        <tr key={row.id} className="border-t">
                          <td className="py-3">
                            <Link
                              className="text-primary underline"
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
                                className="text-primary underline"
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
        </>
      )}
    </section>
  );
}
