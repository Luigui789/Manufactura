import { PageHeader, StatusBadge, Pagination, LoadingState, EmptyState } from '@/components/erp';
import { formatCalendarDate } from '@/lib/calendar-date';
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
      <PageHeader
        title="Órdenes de compra"
        description="Prepará compras, registrá recepciones y consultá lo pendiente por proveedor."
      />

      {canManage && (
        <Button asChild>
          <Link to="/purchases/orders/new">Nueva orden de compra</Link>
        </Button>
      )}

      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <label htmlFor="purchase-search">Número de orden</label>
        <Input
          placeholder="Ej. OC-2026-000009"
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
        <Button type="submit" variant="outline">
          Buscar
        </Button>
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

      {(input || search || status || supplierId) && (
        <Button
          variant="ghost"
          onClick={() => {
            setInput('');
            setSearch('');
            setStatus('');
            setSupplier('');
            setPage(1);
          }}
        >
          Limpiar filtros
        </Button>
      )}
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

      {orders.isPending && <LoadingState label="Cargando compras…" />}
      <ErrorNotice error={orders.error} />
      {orders.isError && <Button onClick={() => void orders.refetch()}>Reintentar</Button>}

      {orders.data && orders.data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table aria-label="Órdenes de compra">
            <thead>
              <tr>
                <th>Número</th>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Fecha esperada</th>
                <th className="numeric">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.data.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link
                      className="font-medium underline underline-offset-4"
                      to={'/purchases/orders/' + order.id}
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td>
                    {order.supplier.name}
                    <p className="text-xs text-muted-foreground">{order.supplier.code}</p>
                  </td>
                  <td>
                    {new Date(order.orderedAt).toLocaleDateString('es-NI', {
                      timeZone: 'America/Managua',
                    })}
                  </td>
                  <td>
                    {order.expectedDate ? formatCalendarDate(order.expectedDate) : 'Sin fecha'}
                  </td>
                  <td className="numeric">{order.total}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {orders.data?.data.length === 0 && (
        <EmptyState
          title="No hay órdenes que coincidan."
          description="Probá otros filtros o creá una orden de compra con los productos que necesitás."
        />
      )}
      <Pagination
        page={page}
        pages={pages}
        total={orders.data?.meta.total}
        label="Paginación de compras"
        onPageChange={setPage}
        busy={orders.isFetching}
        unavailable={!orders.data || orders.isError}
      />
    </section>
  );
}
