import { useState } from 'react';

import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { ErrorNotice } from '@/components/ErrorNotice';

import { useSession } from '@/features/auth/hooks/use-auth';

import { PURCHASE_STATUS, usePurchaseOrders } from '../api/orders';

import { OrderCatalogPicker } from '../components/OrderCatalogPicker';

export function PurchaseOrdersPage() {
  const session = useSession();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [supplierId, setSupplier] = useState('');

  const orders = usePurchaseOrders(page, { search, status, supplierId });

  const pages = Math.max(1, Math.ceil((orders.data?.meta.total ?? 0) / 20));

  const canManage = ['ADMIN', 'COMPRAS'].includes(session.data?.role ?? '');

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Órdenes de compra</h1>

      {canManage && (
        <Button asChild>
          <Link to="/purchases/orders/new">Nueva orden de compra</Link>
        </Button>
      )}

      <form
        role="search"
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <label htmlFor="purchase-search">Número de orden</label>
        <Input
          id="purchase-search"
          maxLength={100}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <label htmlFor="purchase-status">Estado</label>
        <select
          id="purchase-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos</option>
          {Object.entries(PURCHASE_STATUS).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit">Buscar</Button>
      </form>

      <OrderCatalogPicker
        kind="supplier"
        value={supplierId}
        allowInactive
        onChange={(id) => {
          setSupplier(id);
          setPage(1);
        }}
      />

      {supplierId && (
        <Button
          variant="outline"
          onClick={() => {
            setSupplier('');
            setPage(1);
          }}
        >
          Todos los proveedores
        </Button>
      )}

      {orders.isPending && <p role="status">Cargando compras…</p>}
      <ErrorNotice error={orders.error} />
      {orders.isError && <Button onClick={() => void orders.refetch()}>Reintentar</Button>}

      <ul className="space-y-3">
        {orders.data?.data.map((order) => (
          <li key={order.id} className="rounded border p-4">
            <Link className="underline font-medium" to={'/purchases/orders/' + order.id}>
              {order.number}
            </Link>
            <p>
              {order.supplier.code} · {order.supplier.name} · {PURCHASE_STATUS[order.status]}
            </p>
            <p>
              Total: {order.total} · {order.itemsCount} líneas · Fecha esperada:{' '}
              {order.expectedDate ?? 'Sin fecha'}
            </p>
          </li>
        ))}
      </ul>

      {orders.data?.data.length === 0 && <p>No hay órdenes que coincidan.</p>}

      <nav aria-label="Paginación de compras" className="flex gap-3">
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
