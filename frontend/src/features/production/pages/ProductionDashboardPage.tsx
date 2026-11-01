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
  DashboardSection,
  MetricCard,
  MetricGrid,
} from '@/components/dashboard';
import { chartAxis, chartGrid, chartLegend, chartTooltip } from '@/lib/dashboard';
import { InventoryEntityPicker } from '@/features/inventory/components/InventoryEntityPicker';
import { unitLabel } from '@/lib/presentation';
import { useProductionDashboard } from '../api/dashboard';

const nf = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
});
const metricLabels = [
  ['draft', 'Borradores'],
  ['inProgress', 'En proceso'],
  ['completed', 'Completadas'],
  ['cancelled', 'Canceladas'],
] as const;

function formatQuantity(value: string) {
  return nf.format(Number(value));
}

export function ProductionDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productId, setProductId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = useProductionDashboard({ ...applied, ...(productId ? { productId } : {}) });
  const data = dashboard.data;
  const statusData = data
    ? metricLabels.map(([key, label]) => ({ name: label, orders: data.orders[key] }))
    : [];

  const filtered = !!(from || to || productId || applied.from || applied.to);

  return (
    <section className="space-y-8">
      <PageHeader
        title="Dashboard de producción"
        description="Órdenes, cantidades por producto y actividad reciente. Fechas en hora de Managua."
        breadcrumbs={[{ label: 'Producción', to: '/production/orders' }, { label: 'Resumen' }]}
      />
      <DashboardFilterBar
        idPrefix="dashboard"
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
        <InventoryEntityPicker
          kind="product"
          value={productId}
          allowClear
          activeOnly
          productType="FINISHED_GOOD"
          onChange={(id) => setProductId(id)}
        />
      </DashboardFilterBar>

      {dashboard.isPending && <LoadingState label="Cargando dashboard de producción…" />}
      <ErrorNotice error={dashboard.error} />
      {dashboard.isError && (
        <Button
          variant="outline"
          onClick={() => void dashboard.refetch()}
          disabled={dashboard.isFetching}
        >
          Reintentar
        </Button>
      )}
      {data && (
        <>
          <DashboardSection
            title="Órdenes del período"
            description={`${data.period.from} — ${data.period.to} · Managua`}
          >
            <MetricGrid>
              {metricLabels.map(([key, label]) => (
                <MetricCard key={key} label={label} value={data.orders[key]} />
              ))}
            </MetricGrid>
          </DashboardSection>
          <DashboardSection
            title="Cantidades"
            description={
              data.selectedProduct
                ? `${data.selectedProduct.code} · ${data.selectedProduct.name}`
                : 'Seleccioná un producto para comparar cantidades; no se suman unidades incompatibles.'
            }
          >
            <MetricGrid columns={3}>
              <MetricCard
                label="Cantidad planificada"
                value={
                  data.quantity
                    ? `${formatQuantity(data.quantity.planned)} ${unitLabel(data.quantity.unit)}`
                    : '—'
                }
              />
              <MetricCard
                label="Cantidad producida"
                value={
                  data.quantity
                    ? `${formatQuantity(data.quantity.produced)} ${unitLabel(data.quantity.unit)}`
                    : '—'
                }
              />
              <MetricCard
                label="Avance"
                value={
                  !data.quantity || data.quantity.completionRate === null
                    ? '—'
                    : `${nf.format(Number(data.quantity.completionRate))}%`
                }
              />
            </MetricGrid>
          </DashboardSection>

          {data.orders.total === 0 ? (
            <EmptyState
              title="Sin actividad en este período"
              description="No hay órdenes de producción para las fechas seleccionadas."
            />
          ) : (
            <div className={`grid gap-6 ${data.quantity ? 'xl:grid-cols-2' : ''}`}>
              <Card>
                <CardHeader>
                  <CardTitle>Órdenes por estado</CardTitle>
                  <CardDescription>Conteo dentro del período seleccionado</CardDescription>
                </CardHeader>
                <CardContent>
                  <div role="img" aria-label="Gráfico de órdenes por estado" className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={statusData}
                        margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                      >
                        <CartesianGrid {...chartGrid} />
                        <XAxis dataKey="name" {...chartAxis} />
                        <YAxis allowDecimals={false} {...chartAxis} />
                        <Tooltip {...chartTooltip} />
                        <Bar
                          dataKey="orders"
                          name="Órdenes"
                          fill="var(--color-primary)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              {data.quantity && (
                <Card>
                  <CardHeader>
                    <CardTitle>Planificado y producido</CardTitle>
                    <CardDescription>
                      Por período ·{' '}
                      {data.period.granularity === 'day'
                        ? 'día'
                        : data.period.granularity === 'week'
                          ? 'semana'
                          : 'mes'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      role="img"
                      aria-label="Gráfico de cantidades planificadas y producidas"
                      className="h-72"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={data.productionByPeriod.map((point) => ({
                            ...point,
                            planned: Number(point.planned),
                            produced: Number(point.produced),
                          }))}
                          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                        >
                          <CartesianGrid {...chartGrid} />
                          <XAxis dataKey="period" {...chartAxis} />
                          <YAxis {...chartAxis} />
                          <Tooltip {...chartTooltip} />
                          <Legend {...chartLegend} />
                          <Line
                            type="monotone"
                            dataKey="planned"
                            name="Planificado"
                            stroke="var(--color-chart-3)"
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="produced"
                            name="Producido"
                            stroke="var(--color-primary)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Órdenes recientes</CardTitle>
              <CardDescription>
                Hasta cinco órdenes ordenadas por su fecha de actividad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hubo órdenes de producción en este período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <caption className="sr-only">Órdenes recientes de producción</caption>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Producto</th>
                        <th>Estado</th>
                        <th className="text-right">Planificado</th>
                        <th className="text-right">Producido</th>
                        <th>Actividad · Managua</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link className="table-link" to={`/production/orders/${order.id}`}>
                              {order.number}
                            </Link>
                          </td>
                          <td>
                            <span className="text-xs text-muted-foreground">
                              {order.product.code}
                            </span>
                            <p>{order.product.name}</p>
                          </td>
                          <td>
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="numeric">
                            {formatQuantity(order.quantityPlanned)} {unitLabel(order.unit)}
                          </td>
                          <td className="numeric">
                            {formatQuantity(order.quantityProduced)} {unitLabel(order.unit)}
                          </td>
                          <td>{dateFormatter.format(new Date(order.activityAt))}</td>
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
