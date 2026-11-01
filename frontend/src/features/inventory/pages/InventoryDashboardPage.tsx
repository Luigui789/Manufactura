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
import {
  DashboardFilterBar,
  DashboardNote,
  DashboardSection,
  MetricCard,
  MetricGrid,
} from '@/components/dashboard';
import { chartAxis, chartGrid, chartLegend, chartTooltip, periodText } from '@/lib/dashboard';
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

function CountChart({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={`Gráfico de ${title.toLowerCase()}`} className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16 }}>
              <CartesianGrid {...chartGrid} vertical horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...chartAxis} />
              <YAxis type="category" dataKey="name" width={150} {...chartAxis} />
              <Tooltip {...chartTooltip} />
              <Bar
                dataKey="count"
                name="Conteo"
                fill="var(--color-primary)"
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.name} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{row.name}</dt>
              <dd className="font-medium tabular-nums">{nf.format(row.count)}</dd>
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
  const filtered = !!(from || to || productId || warehouseId || applied.from || applied.to);
  return (
    <section className="space-y-8">
      <PageHeader
        title="Dashboard de inventario"
        description="Existencia actual y actividad del período. Fechas en America/Managua."
        breadcrumbs={[{ label: 'Inventario', to: '/inventory/stock' }, { label: 'Resumen' }]}
      />
      <DashboardFilterBar
        idPrefix="inventory"
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
                setWarehouseId('');
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
          onChange={setProductId}
        />
        <InventoryEntityPicker
          kind="warehouse"
          value={warehouseId}
          allowClear
          onChange={setWarehouseId}
        />
      </DashboardFilterBar>
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
          <DashboardSection
            title="Existencia actual"
            description="Estado de hoy, no una reconstrucción histórica: las fechas no lo cambian. El catálogo activo es global; posiciones y lotes respetan producto y almacén."
          >
            <MetricGrid>
              <MetricCard label="Productos activos" value={data.catalog.activeProducts} />
              <MetricCard label="Almacenes activos" value={data.catalog.activeWarehouses} />
              <MetricCard
                label="Posiciones con existencia"
                value={data.stockPositions.withOnHand}
              />
              <MetricCard label="Lotes con existencia" value={data.lotsOnHand.total} />
            </MetricGrid>
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
                <h3 className="pt-2 text-base font-semibold">
                  Producto seleccionado · {data.selectedProduct?.name}
                </h3>
                <MetricGrid columns={2}>
                  <MetricCard
                    label="Existencia física"
                    value={quantity(data.stock.onHand, data.stock.unit)}
                  />
                  <MetricCard
                    label="Consumible"
                    value={quantity(data.stock.consumable, data.stock.unit)}
                  />
                </MetricGrid>
                <p className="text-xs text-muted-foreground">
                  La existencia física incluye todos los estados. En productos trazables, solo los
                  lotes liberados son consumibles.
                </p>
                <Card>
                  <CardHeader>
                    <CardTitle>Stock por almacén</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.stock.byWarehouse.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin stock registrado para este producto.
                      </p>
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
                              <CartesianGrid {...chartGrid} />
                              <XAxis dataKey="name" {...chartAxis} />
                              <YAxis {...chartAxis} />
                              <Tooltip {...chartTooltip} />
                              <Legend {...chartLegend} />
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
                                <th className="text-right">Existencia física</th>
                                <th className="text-right">Consumible</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.stock.byWarehouse.map((row) => (
                                <tr key={row.warehouse.id}>
                                  <td>
                                    {row.warehouse.code} · {row.warehouse.name}
                                  </td>
                                  <td className="numeric">
                                    {quantity(row.onHand, data.stock!.unit)}
                                  </td>
                                  <td className="numeric">
                                    {quantity(row.consumable, data.stock!.unit)}
                                  </td>
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
              <DashboardNote>
                Seleccioná un producto para consultar cantidades físicas; no se suman unidades
                incompatibles.
              </DashboardNote>
            )}
          </DashboardSection>
          <DashboardSection title="Actividad del período" description={periodText(data.period)}>
            <MetricGrid>
              <MetricCard label="Movimientos" value={data.movements.total} />
              {data.movementQuantity && (
                <>
                  <MetricCard
                    label="Entradas"
                    value={quantity(data.movementQuantity.in, data.movementQuantity.unit)}
                  />
                  <MetricCard
                    label="Salidas"
                    value={quantity(data.movementQuantity.out, data.movementQuantity.unit)}
                  />
                  <MetricCard
                    label="Neto"
                    value={quantity(data.movementQuantity.net, data.movementQuantity.unit)}
                  />
                </>
              )}
            </MetricGrid>
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
                    <div
                      role="img"
                      aria-label="Gráfico de movimientos por período"
                      className="h-72"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.movementsByPeriod}>
                          <CartesianGrid {...chartGrid} />
                          <XAxis dataKey="period" {...chartAxis} minTickGap={16} />
                          <YAxis allowDecimals={false} {...chartAxis} />
                          <Tooltip {...chartTooltip} />
                          <Line
                            dataKey="count"
                            name="Movimientos"
                            stroke="var(--color-primary)"
                            strokeWidth={2}
                            dot={false}
                          />
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
                          <th className="text-right">Cantidad</th>
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
                              {row.lot
                                ? `${row.lot.code} · ${lotStatusLabel(row.lot.status)}`
                                : '—'}
                            </td>
                            <td className="numeric">{quantity(row.quantity, row.product.unit)}</td>
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
          </DashboardSection>
        </>
      )}
    </section>
  );
}
