import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
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
  const session = useSession();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const orders = useOrders(page, { search, status, productId, warehouseId });
  const pages = orders.data
    ? Math.max(1, Math.ceil(orders.data.meta.total / orders.data.meta.limit))
    : 1;
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Órdenes de producción</h1>
      <p>Borradores y disponibilidad informativa de materiales. Fechas en hora de Managua.</p>
      {canManage && (
        <Button asChild>
          <Link to="/production/orders/new">Nueva orden</Link>
        </Button>
      )}
      <form
        role="search"
        aria-label="Buscar órdenes"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div>
          <Label htmlFor="order-search">Número o producto</Label>
          <Input
            id="order-search"
            value={input}
            maxLength={100}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="order-status">Estado</Label>
          <select
            id="order-status"
            className="h-9 rounded border px-3"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
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
      </form>
      <div className="flex flex-wrap gap-3">
        <OrderCatalogFilter
          kind="product"
          onChange={(value) => {
            setProductId(value);
            setPage(1);
          }}
        />
        <OrderCatalogFilter
          kind="warehouse"
          onChange={(value) => {
            setWarehouseId(value);
            setPage(1);
          }}
        />
      </div>
      {orders.isPending && <p role="status">Cargando órdenes…</p>}
      <ErrorNotice error={orders.error} />
      {orders.isError && (
        <Button variant="outline" onClick={() => void orders.refetch()}>
          Reintentar
        </Button>
      )}
      <ul className="space-y-3">
        {orders.data?.data.map((order) => (
          <li key={order.id} className="rounded border p-4">
            <Link className="font-medium underline" to={'/production/orders/' + order.id}>
              {order.number}
            </Link>
            <p>
              {order.product.code} · {order.product.name} · {order.quantityPlanned}{' '}
              {order.product.unit} · {ORDER_STATUS[order.status]}
            </p>
            <p>
              {order.warehouse.code} · {order.warehouse.name} · BOM v{order.bomVersion.version}
            </p>
            <p>
              Inicio: {formatPlanningDate(order.plannedStartAt)} · Fin:{' '}
              {formatPlanningDate(order.plannedEndAt)}
            </p>
          </li>
        ))}
      </ul>
      {orders.data?.data.length === 0 && <p>No hay órdenes que coincidan.</p>}
      <nav aria-label="Paginación de órdenes" className="flex gap-3 items-center">
        <Button
          variant="outline"
          disabled={page <= 1 || orders.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {pages}
        </span>
        <Button
          variant="outline"
          disabled={!orders.data || orders.isError || orders.isFetching || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </nav>
    </section>
  );
}
