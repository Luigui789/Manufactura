import { useState } from 'react';
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
import { EmptyState, LoadingState, PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { unitLabel } from '@/lib/presentation';
import { useInventoryDashboard } from '../api/dashboard';
import { InventoryEntityPicker } from '../components/InventoryEntityPicker';
import { BusinessReference } from '../components/BusinessReference';
import { lotStatusLabel, movementLabel } from '../inventory-labels';
import { PRODUCT_TYPE_LABELS } from '../product-labels';

const productKeys = {
  RAW_MATERIAL: 'rawMaterial',
  INTERMEDIATE: 'intermediate',
  FINISHED_GOOD: 'finishedGood',
  CONSUMABLE: 'consumable',
} as const;
const lotKeys = {
  QUARANTINED: 'quarantined',
  RELEASED: 'released',
  REJECTED: 'rejected',
  REWORK: 'rework',
  SCRAPPED: 'scrapped',
} as const;
const movementKeys = {
  ADJUSTMENT_IN: 'adjustmentIn',
  ADJUSTMENT_OUT: 'adjustmentOut',
  PURCHASE_RECEIPT: 'purchaseReceipt',
  PRODUCTION_CONSUMPTION: 'productionConsumption',
  PRODUCTION_OUTPUT: 'productionOutput',
  SALE_DISPATCH: 'saleDispatch',
  QUALITY_SCRAP: 'qualityScrap',
} as const;
const nf = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 4 });
const dateFormat = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const quantity = (value: string, unit: string) => `${nf.format(Number(value))} ${unitLabel(unit)}`;

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
function CountChart({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={`Gráfico de ${title.toLowerCase()}`} className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} />
              <Tooltip />
              <Bar dataKey="count" name="Conteo" fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.name} className="flex justify-between gap-2">
              <dt>{row.name}</dt>
              <dd>{nf.format(row.count)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function InventoryDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const dashboard = useInventoryDashboard({
    ...applied,
    ...(productId ? { productId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
  });
  const data = dashboard.data;
  return (
    <section className="space-y-6">
      <PageHeader
        title="Dashboard de inventario"
        description="Estado actual y actividad del período. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Inventario', to: '/inventory/stock' }, { label: 'Dashboard' }]}
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
          <Label htmlFor="inventory-from">Desde</Label>
          <input
            id="inventory-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventory-to">Hasta</Label>
          <input
            id="inventory-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" disabled={dashboard.isFetching}>
          Aplicar
        </Button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        <InventoryEntityPicker
          kind="product"
          value={productId}
          allowClear
          onChange={setProductId}
        />
        <InventoryEntityPicker
          kind="warehouse"
          value={warehouseId}
          allowClear
          onChange={setWarehouseId}
        />
      </div>
      {dashboard.isPending && <LoadingState label="Cargando dashboard de inventario…" />}
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
          <div>
            <h2 className="text-lg font-semibold">Existencia actual</h2>
            <p className="text-sm text-muted-foreground">
              El catálogo activo es global. Las posiciones y lotes respetan producto y almacén; las
              fechas no cambian el estado actual.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Productos activos" value={data.catalog.activeProducts} />
            <Metric label="Almacenes activos" value={data.catalog.activeWarehouses} />
            <Metric label="Posiciones con existencia" value={data.stockPositions.withOnHand} />
            <Metric label="Lotes con existencia" value={data.lotsOnHand.total} />
          </div>
          {data.catalog.activeProducts === 0 && (
            <EmptyState
              title="Sin productos activos"
              description="El catálogo no contiene productos activos; los filtros permiten consultar registros inactivos."
            />
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <CountChart
              title="Productos activos por tipo"
              rows={Object.entries(productKeys).map(([type, key]) => ({
                name: PRODUCT_TYPE_LABELS[type as keyof typeof productKeys],
                count: data.catalog.productsByType[key],
              }))}
            />
            <CountChart
              title="Lotes actuales por estado"
              rows={Object.entries(lotKeys).map(([status, key]) => ({
                name: lotStatusLabel(status),
                count: data.lotsOnHand[key],
              }))}
            />
          </div>
          {data.lotsOnHand.scrapped > 0 && (
            <p role="alert" className="text-sm text-destructive">
              Hay lotes descartados con saldo físico positivo. Revisá la conciliación del
              inventario.
            </p>
          )}
          {data.stock ? (
            <>
              <h2 className="text-lg font-semibold">
                Producto seleccionado · {data.selectedProduct?.name}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Metric
                  label="Existencia física"
                  value={quantity(data.stock.onHand, data.stock.unit)}
                />
                <Metric
                  label="Consumible"
                  value={quantity(data.stock.consumable, data.stock.unit)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                La existencia física incluye todos los estados. En productos trazables, solo los
                lotes liberados son consumibles.
              </p>
              <Card>
                <CardHeader>
                  <CardTitle>Stock por almacén</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.stock.byWarehouse.length === 0 ? (
                    <p>Sin stock registrado para este producto.</p>
                  ) : (
                    <>
                      <div role="img" aria-label="Gráfico de stock por almacén" className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={data.stock.byWarehouse.map((row) => ({
                              name: row.warehouse.code,
                              onHand: Number(row.onHand),
                              consumable: Number(row.consumable),
                            }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend
                              formatter={(value) => (
                                <span className="text-foreground">{value}</span>
                              )}
                            />
                            <Bar
                              dataKey="onHand"
                              name="Existencia física"
                              fill="var(--color-primary)"
                            />
                            <Bar
                              dataKey="consumable"
                              name="Consumible"
                              fill="var(--color-chart-2)"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="overflow-x-auto">
                        <table>
                          <caption className="sr-only">Stock actual por almacén</caption>
                          <thead>
                            <tr>
                              <th>Almacén</th>
                              <th>Existencia física</th>
                              <th>Consumible</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.stock.byWarehouse.map((row) => (
                              <tr key={row.warehouse.id}>
                                <td>
                                  {row.warehouse.code} · {row.warehouse.name}
                                </td>
                                <td>{quantity(row.onHand, data.stock!.unit)}</td>
                                <td>{quantity(row.consumable, data.stock!.unit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Seleccioná un producto para consultar cantidades físicas; no se suman unidades
              incompatibles.
            </p>
          )}
          <div>
            <h2 className="text-lg font-semibold">Actividad del período</h2>
            <p className="text-sm text-muted-foreground">
              {data.period.from} — {data.period.to} · Managua · Por{' '}
              {{ day: 'día', week: 'semana', month: 'mes' }[data.period.granularity]}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Movimientos" value={data.movements.total} />
            {data.movementQuantity && (
              <>
                <Metric
                  label="Entradas"
                  value={quantity(data.movementQuantity.in, data.movementQuantity.unit)}
                />
                <Metric
                  label="Salidas"
                  value={quantity(data.movementQuantity.out, data.movementQuantity.unit)}
                />
                <Metric
                  label="Neto"
                  value={quantity(data.movementQuantity.net, data.movementQuantity.unit)}
                />
              </>
            )}
          </div>
          {data.movements.total === 0 ? (
            <EmptyState
              title="Sin actividad en este período"
              description="No hay movimientos para los filtros seleccionados. La existencia actual se muestra arriba."
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Movimientos por período</CardTitle>
                  <CardDescription>
                    Conteo de movimientos; no representa cantidades físicas.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div role="img" aria-label="Gráfico de movimientos por período" className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.movementsByPeriod}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line dataKey="count" name="Movimientos" stroke="var(--color-primary)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <CountChart
                title="Movimientos por tipo"
                rows={Object.entries(movementKeys).map(([type, key]) => ({
                  name: movementLabel(type),
                  count: data.movements.byType[key],
                }))}
              />
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Movimientos recientes</CardTitle>
              <CardDescription>
                Hasta cinco movimientos del período, producto y almacén seleccionados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentMovements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay movimientos recientes.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <caption className="sr-only">Movimientos recientes de inventario</caption>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Producto</th>
                        <th>Almacén</th>
                        <th>Lote</th>
                        <th>Cantidad</th>
                        <th>Fecha · Managua</th>
                        <th>Responsable</th>
                        <th>Motivo</th>
                        <th>Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentMovements.map((row) => (
                        <tr key={row.id}>
                          <td>{movementLabel(row.type)}</td>
                          <td>
                            {row.product.code} · {row.product.name}
                          </td>
                          <td>{row.warehouse.code}</td>
                          <td>
                            {row.lot ? `${row.lot.code} · ${lotStatusLabel(row.lot.status)}` : '—'}
                          </td>
                          <td>{quantity(row.quantity, row.product.unit)}</td>
                          <td>{dateFormat.format(new Date(row.occurredAt))}</td>
                          <td>{row.performedByUser.fullName}</td>
                          <td>{row.reason ?? '—'}</td>
                          <td>
                            <BusinessReference reference={row.businessReference} />
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
