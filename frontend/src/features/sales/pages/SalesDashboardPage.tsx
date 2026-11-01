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
import { useSalesDashboard } from '../api/dashboard';
import { SALE_STATUS } from '../orders/api/sales-orders';
import { CatalogPicker } from '@/components/CatalogPicker';

const statusKeys = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PARTIALLY_DISPATCHED: 'partiallyDispatched',
  DISPATCHED: 'dispatched',
  CANCELLED: 'cancelled',
} as const;
const nf = new Intl.NumberFormat('es-NI');
const dateFormat = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function SalesDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = useSalesDashboard({ ...applied, ...(customerId ? { customerId } : {}) });
  const data = dashboard.data;
  const filtered = !!(from || to || customerId || applied.from || applied.to);
  return (
    <section className="space-y-8">
      <PageHeader
        title="Dashboard de ventas"
        description="Pipeline actual y actividad del período. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Ventas', to: '/sales/orders' }, { label: 'Resumen' }]}
      />
      <DashboardFilterBar
        idPrefix="sales"
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
                setCustomerId('');
              }}
            >
              Limpiar filtros
            </Button>
          )
        }
      >
        <details className="rounded-md border bg-background p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Cliente:{' '}
            {data?.selectedCustomer
              ? `${data.selectedCustomer.code} · ${data.selectedCustomer.name}`
              : 'Todos'}
          </summary>
          <div className="mt-3">
            <CatalogPicker
              kind="customer"
              value={customerId}
              onChange={setCustomerId}
              allowInactive
            />
          </div>
        </details>
      </DashboardFilterBar>
      {dashboard.isPending && <LoadingState label="Cargando dashboard de ventas…" />}
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
            description="Independiente del período. El pipeline respeta el cliente; clientes activos es global."
          >
            <MetricGrid columns={2}>
              <MetricCard label="Clientes activos" value={data.customers.active} />
              <MetricCard label="Pendientes de despacho" value={data.pipeline.awaitingDispatch} />
            </MetricGrid>
          </DashboardSection>
          <DashboardSection title="Actividad del período" description={periodText(data.period)}>
            <MetricGrid>
              <MetricCard label="Órdenes emitidas" value={data.orders.total} />
              <MetricCard label="Despachos" value={data.dispatches.total} />
              <MetricCard label="Valor confirmado" value={data.amounts.confirmed} />
              <MetricCard label="Clientes con actividad" value={data.customers.usedInPeriod} />
            </MetricGrid>
            <DashboardNote>
              {nf.format(data.dispatches.lines)} líneas despachadas. Valor confirmado: importes
              registrados de órdenes confirmadas, parcialmente despachadas o despachadas, sin moneda
              definida.
            </DashboardNote>
            {data.orders.total === 0 && data.dispatches.total === 0 ? (
              <EmptyState
                title="Sin actividad de ventas en este período."
                description="No hay órdenes ni despachos para los filtros seleccionados. El estado actual se muestra arriba."
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
                              name: SALE_STATUS[status as keyof typeof SALE_STATUS],
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
                            <dt>{SALE_STATUS[status as keyof typeof SALE_STATUS]}</dt>
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
                      <CardTitle>Órdenes vs despachos por período</CardTitle>
                      <CardDescription>
                        Órdenes por fecha de emisión; despachos por fecha de despacho.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        role="img"
                        aria-label="Gráfico de órdenes y despachos por período"
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
                              dataKey="dispatches"
                              name="Despachos"
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
                            <caption className="sr-only">Actividad de ventas por período</caption>
                            <thead>
                              <tr>
                                <th>Período</th>
                                <th className="text-right">Órdenes</th>
                                <th className="text-right">Despachos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.activityByPeriod.map((row) => (
                                <tr key={row.period}>
                                  <td>{row.period}</td>
                                  <td className="numeric">{row.orders}</td>
                                  <td className="numeric">{row.dispatches}</td>
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
                <CardTitle>Clientes principales</CardTitle>
                <CardDescription>
                  Hasta cinco por valor confirmado, cantidad de órdenes y código.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.topCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin clientes con órdenes en el período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table>
                      <caption className="sr-only">Clientes con actividad</caption>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th className="text-right">Órdenes</th>
                          <th className="text-right">Valor confirmado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topCustomers.map((row) => (
                          <tr key={row.customer.id}>
                            <td>
                              {row.customer.code} · {row.customer.name}
                            </td>
                            <td className="numeric">{row.orders}</td>
                            <td className="numeric">{row.confirmedAmount}</td>
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
                    No hubo órdenes de venta en este período.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table>
                      <caption className="sr-only">Órdenes recientes de ventas</caption>
                      <thead>
                        <tr>
                          <th>Número</th>
                          <th>Cliente</th>
                          <th>Fecha · Managua</th>
                          <th className="text-right">Total registrado</th>
                          <th className="text-right">Despachos</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentOrders.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Link className="table-link" to={`/sales/orders/${row.id}`}>
                                {row.number}
                              </Link>
                            </td>
                            <td>
                              {row.customer.code} · {row.customer.name}
                            </td>
                            <td>{dateFormat.format(new Date(row.orderedAt))}</td>
                            <td className="numeric">{row.total}</td>
                            <td className="numeric">{row.dispatchesCount}</td>
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
