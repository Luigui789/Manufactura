import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ErrorNotice';
import { EmptyState, LoadingState, PageHeader, Pagination, StatusBadge } from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { ORDER_STATUS, useOrders } from '../api/orders';
import { formatPlanningDate } from '../planning-dates';
import { OrderCatalogFilter } from '../components/OrderCatalogFilter';

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [filterRevision, setFilterRevision] = useState(0);
  const session = useSession();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const orders = useOrders(page, { search, status, productId, warehouseId });
  const pages = orders.data
    ? Math.max(1, Math.ceil(orders.data.meta.total / orders.data.meta.limit))
    : 1;
  const hasFilters = !!(input || search || status || productId || warehouseId);
  const appliedFilters = [search, status, productId, warehouseId].filter(Boolean).length;
  const clearFilters = () => {
    setInput('');
    setSearch('');
    setStatus('');
    setProductId('');
    setWarehouseId('');
    setPage(1);
    setFilterRevision((revision) => revision + 1);
  };
  const createAction = canManage ? (
    <Button asChild>
      <Link to="/production/orders/new">
        <Plus aria-hidden className="size-4" />
        Nueva orden
      </Link>
    </Button>
  ) : undefined;
  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Producción' }, { label: 'Órdenes' }]}
        title="Órdenes de producción"
        description="Planificá la fabricación, consultá los materiales y seguí la ejecución de cada orden. Fechas en hora de Managua."
        actions={createAction}
      />
      <div className="filter-bar space-y-4">
        <form
          role="search"
          aria-label="Buscar órdenes"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(input.trim());
            setPage(1);
          }}
        >
          <div className="min-w-52 flex-1 space-y-2">
            <Label htmlFor="order-search">Número o producto</Label>
            <Input
              id="order-search"
              type="search"
              placeholder="Buscar por número de orden o producto…"
              value={input}
              maxLength={100}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-status">Estado</Label>
            <select
              id="order-status"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(ORDER_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </form>
        <div className="flex flex-wrap items-start gap-3">
          <OrderCatalogFilter
            key={'product-' + filterRevision}
            kind="product"
            onChange={(value) => {
              setProductId(value);
              setPage(1);
            }}
          />
          <OrderCatalogFilter
            key={'warehouse-' + filterRevision}
            kind="warehouse"
            onChange={(value) => {
              setWarehouseId(value);
              setPage(1);
            }}
          />
        </div>
        {appliedFilters > 0 && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {appliedFilters} {appliedFilters === 1 ? 'filtro aplicado' : 'filtros aplicados'}
          </p>
        )}
      </div>
      {orders.isPending && <LoadingState label="Cargando órdenes…" />}
      <ErrorNotice error={orders.error} />
      {orders.isError && (
        <Button variant="outline" onClick={() => void orders.refetch()}>
          Reintentar
        </Button>
      )}
      {orders.data?.data.length === 0 && (
        <EmptyState
          title={
            appliedFilters
              ? 'No hay órdenes que coincidan.'
              : 'No hay órdenes de producción todavía.'
          }
          description={
            appliedFilters
              ? 'Probá otros criterios o limpiá los filtros para consultar todas las órdenes.'
              : 'Creá un borrador con la fórmula, el almacén y la cantidad que querés fabricar.'
          }
          action={
            appliedFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : (
              createAction
            )
          }
        />
      )}
      {!!orders.data?.data.length && (
        <div className="overflow-x-auto rounded-md border">
          <table>
            <caption className="sr-only">
              Órdenes de producción con cantidad planificada, almacén y estado
            </caption>
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Producto</th>
                <th scope="col" className="text-right">
                  Cantidad
                </th>
                <th scope="col">Unidad</th>
                <th scope="col">Almacén</th>
                <th scope="col">Inicio · Managua</th>
                <th scope="col">Fin · Managua</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.data.map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap">
                    <Link className="table-link" to={'/production/orders/' + order.id}>
                      {order.number}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fórmula v{order.bomVersion.version}
                    </p>
                  </td>
                  <td>
                    <span className="text-xs text-muted-foreground">{order.product.code}</span>
                    <p className="font-medium">{order.product.name}</p>
                  </td>
                  <td className="text-right tabular-nums">{order.quantityPlanned}</td>
                  <td>{PRODUCT_UNIT_LABELS[order.product.unit]}</td>
                  <td>
                    <span className="text-xs text-muted-foreground">{order.warehouse.code}</span>
                    <p>{order.warehouse.name}</p>
                  </td>
                  <td className="whitespace-nowrap">{formatPlanningDate(order.plannedStartAt)}</td>
                  <td className="whitespace-nowrap">{formatPlanningDate(order.plannedEndAt)}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {orders.data && (
        <Pagination
          page={page}
          pages={pages}
          total={orders.data.meta.total}
          label="Paginación de órdenes"
          onPageChange={setPage}
          busy={orders.isFetching}
          unavailable={orders.isError}
        />
      )}
    </section>
  );
}
