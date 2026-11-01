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
import { Label } from '@/components/ui/label';
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

export function PurchasesDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = usePurchasesDashboard({ ...applied, ...(supplierId ? { supplierId } : {}) });
  const data = dashboard.data;
  return (
    <section className="space-y-6">
      <PageHeader
        title="Dashboard de compras"
        description="Pipeline actual y actividad del período. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Compras', to: '/purchases/orders' }, { label: 'Dashboard' }]}
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
          <Label htmlFor="purchases-from">Desde</Label>
          <input
            id="purchases-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="purchases-to">Hasta</Label>
          <input
            id="purchases-to"
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
        {supplierId && (
          <Button variant="outline" onClick={() => setSupplierId('')}>
            Todos los proveedores
          </Button>
        )}
      </div>
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
          <div>
            <h2 className="text-lg font-semibold">Estado actual</h2>
            <p className="text-sm text-muted-foreground">
              Independiente del período. El pipeline respeta el proveedor; proveedores activos es
              global.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Proveedores activos" value={data.suppliers.active} />
            <Metric label="Pendientes de recepción" value={data.pipeline.awaitingReceipt} />
            <Metric label="Vencidas" value={data.pipeline.overdue} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Actividad del período</h2>
            <p className="text-sm text-muted-foreground">
              {data.period.from} — {data.period.to} · Managua · Por{' '}
              {{ day: 'día', week: 'semana', month: 'mes' }[data.period.granularity]}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Órdenes emitidas" value={data.orders.total} />
            <Metric label="Recepciones" value={data.receipts.total} />
            <Metric label="Valor comprometido" value={data.amounts.committed} />
            <Metric label="Proveedores con actividad" value={data.suppliers.usedInPeriod} />
          </div>
          <p className="text-sm text-muted-foreground">
            {nf.format(data.receipts.lines)} líneas recibidas. Valor comprometido: importes
            registrados de órdenes confirmadas, parcialmente recibidas o recibidas, sin moneda
            definida.
          </p>
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
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis type="category" dataKey="name" width={155} />
                          <Tooltip />
                          <Bar
                            dataKey="count"
                            name="Órdenes"
                            fill="var(--color-primary)"
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      {Object.entries(statusKeys).map(([status, key]) => (
                        <div key={status} className="flex justify-between gap-2">
                          <dt>{PURCHASE_STATUS[status as keyof typeof PURCHASE_STATUS]}</dt>
                          <dd>{nf.format(data.orders[key])}</dd>
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
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend
                            formatter={(value) => <span className="text-foreground">{value}</span>}
                          />
                          <Line
                            dataKey="orders"
                            name="Órdenes"
                            stroke="var(--color-primary)"
                            isAnimationActive={false}
                          />
                          <Line
                            dataKey="receipts"
                            name="Recepciones"
                            stroke="var(--color-chart-2)"
                            strokeDasharray="5 3"
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer">Ver actividad en tabla</summary>
                      <div className="max-h-72 overflow-auto">
                        <table>
                          <caption className="sr-only">Actividad de compras por período</caption>
                          <thead>
                            <tr>
                              <th>Período</th>
                              <th>Órdenes</th>
                              <th>Recepciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.activityByPeriod.map((row) => (
                              <tr key={row.period}>
                                <td>{row.period}</td>
                                <td>{row.orders}</td>
                                <td>{row.receipts}</td>
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
                        <th>Órdenes</th>
                        <th>Valor comprometido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topSuppliers.map((row) => (
                        <tr key={row.supplier.id}>
                          <td>
                            {row.supplier.code} · {row.supplier.name}
                          </td>
                          <td>{row.orders}</td>
                          <td>{row.committedAmount}</td>
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
                <p className="text-sm text-muted-foreground">No hay órdenes recientes.</p>
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
                        <th>Total registrado</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentOrders.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <Link
                              className="text-primary underline"
                              to={`/purchases/orders/${row.id}`}
                            >
                              {row.number}
                            </Link>
                          </td>
                          <td>
                            {row.supplier.code} · {row.supplier.name}
                          </td>
                          <td>{dateFormat.format(new Date(row.orderedAt))}</td>
                          <td>{row.expectedDate ?? '—'}</td>
                          <td>{row.total}</td>
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
        </>
      )}
    </section>
  );
}
