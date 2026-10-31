import { useState } from 'react';
import { Link } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { Label } from '@/components/ui/label';
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

  return (
    <section className="space-y-6">
      <PageHeader
        title="Dashboard de producción"
        description="Resumen de órdenes, cantidades por producto y actividad reciente. Las fechas se interpretan en hora de Managua."
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
          <Label htmlFor="dashboard-from">Desde</Label>
          <input
            id="dashboard-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dashboard-to">Hasta</Label>
          <input
            id="dashboard-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" disabled={dashboard.isFetching}>
          Aplicar
        </Button>
      </form>

      <InventoryEntityPicker
        kind="product"
        value={productId}
        allowClear
        activeOnly
        productType="FINISHED_GOOD"
        onChange={(id) => setProductId(id)}
      />

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricLabels.map(([key, label]) => (
              <Card key={key}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{nf.format(data.orders[key])}</CardTitle>
                </CardHeader>
              </Card>
            ))}
            <Card>
              <CardHeader>
                <CardDescription>Cantidad planificada</CardDescription>
                <CardTitle>
                  {data.quantity
                    ? `${formatQuantity(data.quantity.planned)} ${unitLabel(data.quantity.unit)}`
                    : '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Cantidad producida</CardDescription>
                <CardTitle>
                  {data.quantity
                    ? `${formatQuantity(data.quantity.produced)} ${unitLabel(data.quantity.unit)}`
                    : '—'}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Avance</CardDescription>
                <CardTitle>
                  {!data.quantity || data.quantity.completionRate === null
                    ? '—'
                    : `${nf.format(Number(data.quantity.completionRate))}%`}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
          {!data.selectedProduct && (
            <p className="text-sm text-muted-foreground">
              Seleccioná un producto para comparar cantidades; no se suman unidades incompatibles.
            </p>
          )}

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
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
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
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="planned"
                            name="Planificado"
                            stroke="var(--color-chart-1)"
                          />
                          <Line
                            type="monotone"
                            dataKey="produced"
                            name="Producido"
                            stroke="var(--color-chart-2)"
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
                <p className="text-sm text-muted-foreground">No hay órdenes recientes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <caption className="sr-only">Órdenes recientes de producción</caption>
                    <thead>
                      <tr>
                        <th>Número</th>
                        <th>Producto</th>
                        <th>Estado</th>
                        <th>Planificado</th>
                        <th>Producido</th>
                        <th>Actividad · Managua</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <Link
                              className="font-medium underline underline-offset-4"
                              to={`/production/orders/${order.id}`}
                            >
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
                          <td>
                            {order.quantityPlanned} {order.unit}
                          </td>
                          <td>
                            {order.quantityProduced} {order.unit}
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
