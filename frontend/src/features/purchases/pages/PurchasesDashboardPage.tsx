import { useState } from 'react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorNotice } from '@/components/ErrorNotice';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@/components/erp';
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
import { usePurchasesDashboard } from '../api/dashboard';
import { PURCHASE_STATUS } from '../api/orders';
import { OrderCatalogPicker } from '../components/OrderCatalogPicker';

const statusKeys = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PARTIALLY_RECEIVED: 'partiallyReceived',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
} as const;
const nf = new Intl.NumberFormat('es-NI');
const dateFormat = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function PurchasesDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = usePurchasesDashboard({ ...applied, ...(supplierId ? { supplierId } : {}) });
  const data = dashboard.data;
  const filtered = !!(from || to || supplierId || applied.from || applied.to);
  return (
    <section className="space-y-8">
      <PageHeader
        title="Dashboard de compras"
        description="Pipeline actual y actividad del período. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Compras', to: '/purchases/orders' }, { label: 'Resumen' }]}
      />
      <DashboardFilterBar
        idPrefix="purchases"
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
                setSupplierId('');
              }}
            >
              Limpiar filtros
            </Button>
          )
        }
      >
        <details className="rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Proveedor:{' '}
            {data?.selectedSupplier
              ? `${data.selectedSupplier.code} · ${data.selectedSupplier.name}`
              : 'Todos'}
          </summary>
          <div className="mt-3">
            <OrderCatalogPicker
              kind="supplier"
              value={supplierId}
              onChange={setSupplierId}
              allowInactive
            />
          </div>
        </details>
      </DashboardFilterBar>
      {dashboard.isPending && <LoadingState label="Cargando dashboard de compras…" />}
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
            title="Pipeline actual"
            description="Independiente del período. El pipeline respeta el proveedor; proveedores activos es global."
          >
            <MetricGrid columns={3}>
              <MetricCard label="Proveedores activos" value={data.suppliers.active} />
              <MetricCard label="Pendientes de recepción" value={data.pipeline.awaitingReceipt} />
              <MetricCard label="Vencidas" value={data.pipeline.overdue} />
            </MetricGrid>
          </DashboardSection>
          <DashboardSection title="Actividad del período" description={periodText(data.period)}>
            <MetricGrid>
              <MetricCard label="Órdenes emitidas" value={data.orders.total} />
              <MetricCard label="Recepciones" value={data.receipts.total} />
              <MetricCard label="Valor comprometido" value={data.amounts.committed} />
              <MetricCard label="Proveedores con actividad" value={data.suppliers.usedInPeriod} />
            </MetricGrid>
            <DashboardNote>
              {nf.format(data.receipts.lines)} líneas recibidas. Valor comprometido: importes
              registrados de órdenes confirmadas, parcialmente recibidas o recibidas, sin moneda
              definida.
            </DashboardNote>
            {data.orders.total === 0 && data.receipts.total === 0 ? (
              <EmptyState
                title="Sin actividad de compras en este período."
                description="No hay órdenes ni recepciones para los filtros seleccionados. El estado actual se muestra arriba."
              />
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Órdenes por estado</CardTitle>
                      <CardDescription>
                        Estado actual de las órdenes emitidas en el período.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div role="img" aria-label="Gráfico de órdenes por estado" className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={Object.entries(statusKeys).map(([status, key]) => ({
                              name: PURCHASE_STATUS[status as keyof typeof PURCHASE_STATUS],
                              count: data.orders[key],
                            }))}
                            layout="vertical"
                            margin={{ right: 20 }}
                          >
                            <CartesianGrid {...chartGrid} vertical horizontal={false} />
                            <XAxis type="number" allowDecimals={false} {...chartAxis} />
                            <YAxis type="category" dataKey="name" width={155} {...chartAxis} />
                            <Tooltip {...chartTooltip} />
                            <Bar
                              dataKey="count"
                              name="Órdenes"
                              fill="var(--color-primary)"
                              radius={[0, 4, 4, 0]}
                              maxBarSize={28}
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                        {Object.entries(statusKeys).map(([status, key]) => (
                          <div key={status} className="flex justify-between gap-2">
                            <dt>{PURCHASE_STATUS[status as keyof typeof PURCHASE_STATUS]}</dt>
                            <dd className="font-medium tabular-nums">
                              {nf.format(data.orders[key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Órdenes vs recepciones por período</CardTitle>
                      <CardDescription>
                        Órdenes por fecha de emisión; recepciones por fecha de recepción.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        role="img"
                        aria-label="Gráfico de órdenes y recepciones por período"
                        className="h-72"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data.activityByPeriod}>
                            <CartesianGrid {...chartGrid} />
                            <XAxis dataKey="period" {...chartAxis} minTickGap={16} />
                            <YAxis allowDecimals={false} {...chartAxis} />
                            <Tooltip {...chartTooltip} />
                            <Legend {...chartLegend} />
                            <Line
                              dataKey="orders"
                              name="Órdenes"
                              stroke="var(--color-primary)"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              dataKey="receipts"
                              name="Recepciones"
                              stroke="var(--color-chart-2)"
                              strokeWidth={2}
                              strokeDasharray="5 3"
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Ver actividad en tabla
                        </summary>
                        <div className="mt-2 max-h-72 overflow-auto rounded-md border">
                          <table>
                            <caption className="sr-only">Actividad de compras por período</caption>
                            <thead>
                              <tr>
                                <th>Período</th>
                                <th className="text-right">Órdenes</th>
                                <th className="text-right">Recepciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.activityByPeriod.map((row) => (
                                <tr key={row.period}>
                                  <td>{row.period}</td>
                                  <td className="numeric">{row.orders}</td>
                                  <td className="numeric">{row.receipts}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Proveedores principales</CardTitle>
                <CardDescription>
                  Hasta cinco por valor comprometido, cantidad de órdenes y código.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.topSuppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin proveedores con órdenes en el período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table>
                      <caption className="sr-only">Proveedores con actividad</caption>
                      <thead>
                        <tr>
                          <th>Proveedor</th>
                          <th className="text-right">Órdenes</th>
                          <th className="text-right">Valor comprometido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topSuppliers.map((row) => (
                          <tr key={row.supplier.id}>
                            <td>
                              {row.supplier.code} · {row.supplier.name}
                            </td>
                            <td className="numeric">{row.orders}</td>
                            <td className="numeric">{row.committedAmount}</td>
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
                <CardTitle>Órdenes recientes</CardTitle>
                <CardDescription>
                  Hasta cinco órdenes emitidas en el período, con su estado actual.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.recentOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hubo órdenes de compra en este período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table>
                      <caption className="sr-only">Órdenes recientes de compras</caption>
                      <thead>
                        <tr>
                          <th>Número</th>
                          <th>Proveedor</th>
                          <th>Fecha · Managua</th>
                          <th>Esperada</th>
                          <th className="text-right">Total registrado</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentOrders.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Link className="table-link" to={`/purchases/orders/${row.id}`}>
                                {row.number}
                              </Link>
                            </td>
                            <td>
                              {row.supplier.code} · {row.supplier.name}
                            </td>
                            <td>{dateFormat.format(new Date(row.orderedAt))}</td>
                            <td>{row.expectedDate ?? '—'}</td>
                            <td className="numeric">{row.total}</td>
                            <td>
                              <StatusBadge status={row.status} />
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
