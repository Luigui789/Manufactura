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
        {q.data && (
          <>
            <p>
              <strong>{q.data.code}</strong> · {q.data.product.code} {q.data.product.name} ·{' '}
              {q.data.status}
            </p>
            <p>
              Origen: No registrado por el sistema actual. Fecha de origen:{' '}
              {new Date(q.data.originatedAt).toLocaleDateString('es-NI')} · Vencimiento:{' '}
              {q.data.expiresAt ? new Date(q.data.expiresAt).toLocaleDateString('es-NI') : '—'}
            </p>
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
                  {new Date(m.occurredAt).toLocaleString('es-NI')} · {m.type} · {m.quantity} ·{' '}
                  {m.warehouse.code} · {m.performedByUser.fullName}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
export function LotsPage() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [productId, setProductId] = useState(''),
    [warehouseId, setWarehouseId] = useState(''),
    [status, setStatus] = useState(''),
    [hasStock, setHasStock] = useState(false),
    [selected, setSelected] = useState('');
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
          Consulta lotes y su saldo calculado desde el ledger. El origen estará disponible al
          integrarse Compras.
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
                  <TableCell>No registrado</TableCell>
                  <TableCell>{new Date(l.originatedAt).toLocaleDateString('es-NI')}</TableCell>
                  <TableCell>
                    {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('es-NI') : '—'}
                  </TableCell>
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
