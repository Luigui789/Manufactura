import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader, StatusBadge, Pagination, LoadingState, EmptyState } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/features/auth/hooks/use-auth';
import { SALE_STATUS, useSalesOrders } from '../api/sales-orders';
export function SalesOrdersPage() {
  const session = useSession();
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const orders = useSalesOrders(page, { search, status });
  const canManage = ['ADMIN', 'VENTAS'].includes(session.data?.role ?? '');
  const pages = Math.max(1, Math.ceil((orders.data?.meta.total ?? 0) / 20));
  return (
    <section className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Ventas' }, { label: 'Órdenes' }]}
        title="Órdenes de venta"
        description="Prepará borradores y confirmá pedidos después de revisar la disponibilidad informativa."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/sales/orders/new">Nueva orden de venta</Link>
            </Button>
          ) : undefined
        }
      />
      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <label className="space-y-1 text-sm" htmlFor="sales-order-search">
          Número de orden
          <Input
            id="sales-order-search"
            placeholder="Ej. OV-2026-000001"
            maxLength={100}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm" htmlFor="sales-order-status">
          Estado
          <select
            id="sales-order-status"
            className="block h-10 rounded-md border bg-background px-3"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(SALE_STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {orders.isPending && <LoadingState label="Cargando órdenes de venta…" />}
      <ErrorNotice error={orders.error} />
      {orders.isError && (
        <Button variant="outline" onClick={() => void orders.refetch()}>
          Reintentar
        </Button>
      )}
      {orders.data?.data.length ? (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table aria-label="Órdenes de venta">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Líneas</th>
                <th className="numeric">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.data.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link className="table-link" to={`/sales/orders/${order.id}`}>
                      {order.number}
                    </Link>
                  </td>
                  <td>
                    {order.customer.name}
                    <p className="text-xs text-muted-foreground">{order.customer.code}</p>
                  </td>
                  <td>
                    {new Date(order.orderedAt).toLocaleDateString('es-NI', {
                      timeZone: 'America/Managua',
                    })}
                  </td>
                  <td>{order.itemsCount}</td>
                  <td className="numeric">{order.total}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        orders.data && (
          <EmptyState
            title="No hay órdenes de venta que coincidan."
            description="Ajusta la búsqueda o crea un borrador nuevo."
          />
        )
      )}
      <Pagination
        page={page}
        pages={pages}
        total={orders.data?.meta.total}
        label="Paginación de órdenes de venta"
        onPageChange={setPage}
        busy={orders.isFetching}
        unavailable={!orders.data || orders.isError}
      />
    </section>
  );
}
