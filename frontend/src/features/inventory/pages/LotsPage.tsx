import { formatCalendarDate } from '@/lib/calendar-date';
import type { InventoryLotOrigin } from '../api/inventory-data';
import { Link, useSearchParams } from 'react-router';
import { BusinessReference } from '../components/BusinessReference';
import { LotProductionDetail } from '@/features/production/components/LotProductionDetail';
import { movementLabel } from '../inventory-labels';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useInventoryLots, useInventoryLot } from '../api/inventory-hooks';
function LotOrigin({ origin }: { origin: InventoryLotOrigin | null }) {
  if (!origin) return <span>Sin origen empresarial</span>;
  if (origin.type === 'PRODUCTION_ORDER')
    return (
      <div className="space-y-1 text-sm">
        <Link className="underline" to={`/production/orders/${origin.productionOrder.id}`}>
          {origin.productionOrder.number}
        </Link>
        {origin.bomVersion && <p>BOM v{origin.bomVersion.version}</p>}
      </div>
    );
  return (
    <div className="space-y-1 text-sm">
      <div>Recepción {origin.purchaseReceipt.number}</div>
      <div>{origin.purchaseOrder.number}</div>
      <div>
        Proveedor: {origin.supplier.code} · {origin.supplier.name}
      </div>
    </div>
  );
}
function LotDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useInventoryLot(id);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lot-detail-title"
        className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-lg border bg-background p-5"
      >
        <div className="flex justify-between">
          <h2 id="lot-detail-title" className="text-lg font-semibold">
            Detalle del lote
          </h2>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
        {q.isPending && <p role="status">Cargando lote…</p>}
        <ErrorNotice error={q.error} />
        {q.isError && (
          <Button variant="outline" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        )}
        {q.data && (
          <>
            <p>
              <strong>{q.data.code}</strong> · {q.data.product.code} {q.data.product.name} ·{' '}
              {q.data.status}
            </p>
            <p>
              Fecha de origen: {new Date(q.data.originatedAt).toLocaleDateString('es-NI')} ·
              Vencimiento: {q.data.expiresAt ? formatCalendarDate(q.data.expiresAt) : '—'}
            </p>
            <LotOrigin origin={q.data.origin} />
            <h3 className="font-medium">Existencia por almacén</h3>
            {q.data.balances.map((b) => (
              <p key={b.warehouse.id}>
                {b.warehouse.code} · {b.warehouse.name}: {b.quantity} {q.data.product.unit}
              </p>
            ))}
            <h3 className="font-medium">Movimientos</h3>
            <ul className="space-y-1 text-sm">
              {q.data.movements.map((m) => (
                <li key={m.id}>
                  {new Date(m.occurredAt).toLocaleString('es-NI')} · {movementLabel(m.type)} ·{' '}
                  <BusinessReference reference={m.businessReference} /> · {m.quantity} ·{' '}
                  {m.warehouse.code} · {m.performedByUser.fullName}
                </li>
              ))}
            </ul>
            {q.data.origin?.type === 'PRODUCTION_ORDER' && (
              <LotProductionDetail lotId={q.data.id} status={q.data.status} />
            )}
          </>
        )}
      </section>
    </div>
  );
}
export function LotsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('lotId') ?? '';
  const setSelected = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('lotId', id);
    else next.delete('lotId');
    setParams(next);
  };
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [productId, setProductId] = useState(''),
    [warehouseId, setWarehouseId] = useState(''),
    [status, setStatus] = useState(''),
    [hasStock, setHasStock] = useState(false);
  const q = useInventoryLots(
    {
      ...(search ? { search } : {}),
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(status ? { status } : {}),
      ...(hasStock ? { hasStock: true } : {}),
    },
    page,
  );
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.limit)) : 1;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Lotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta lotes, existencias y su origen en compras o producción.
        </p>
      </header>
      <form
        role="search"
        aria-label="Filtros de lotes"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="space-y-1 text-sm">
          Buscar código
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          Producto ID
          <Input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="UUID"
          />
        </label>
        <label className="space-y-1 text-sm">
          Almacén ID
          <Input
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            placeholder="UUID"
          />
        </label>
        <label className="space-y-1 text-sm">
          Estado
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos</option>
            {['QUARANTINED', 'RELEASED', 'REJECTED'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasStock}
            onChange={(e) => setHasStock(e.target.checked)}
          />
          Solo con existencia
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>
      {q.isPending && <p role="status">Cargando lotes…</p>}
      <ErrorNotice error={q.error} />
      {q.isError && (
        <Button variant="outline" onClick={() => void q.refetch()}>
          Reintentar
        </Button>
      )}
      {q.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Lotes">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Fecha de origen</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Existencia</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.code}</TableCell>
                  <TableCell>
                    {l.product.code} · {l.product.name}
                  </TableCell>
                  <TableCell>{l.status}</TableCell>
                  <TableCell>
                    <LotOrigin origin={l.origin} />
                  </TableCell>
                  <TableCell>{new Date(l.originatedAt).toLocaleDateString('es-NI')}</TableCell>
                  <TableCell>{l.expiresAt ? formatCalendarDate(l.expiresAt) : '—'}</TableCell>
                  <TableCell>
                    {l.quantityOnHand} {l.product.unit}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(l.id)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No hay lotes para estos filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <nav aria-label="Paginación de lotes" className="flex items-center justify-between">
        <span>
          Página {page} de {pages} · {q.data?.meta.total ?? 0} lotes
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || q.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={!q.data || page >= pages || q.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </nav>
      {selected && <LotDetail id={selected} onClose={() => setSelected('')} />}
    </section>
  );
}
