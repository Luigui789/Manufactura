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
import { useInventoryMovements } from '../api/inventory-hooks';
export function MovementsPage() {
  const [page, setPage] = useState(1),
    [productId, setProductId] = useState(''),
    [warehouseId, setWarehouseId] = useState(''),
    [lotId, setLotId] = useState(''),
    [type, setType] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const q = useInventoryMovements(
    {
      productId,
      warehouseId,
      lotId,
      type,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
    },
    page,
  );
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.limit)) : 1;
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historial inmutable de entradas y salidas.
        </p>
      </header>
      <form
        role="search"
        aria-label="Filtros de movimientos"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        {[
          ['Producto ID', productId, setProductId],
          ['Almacén ID', warehouseId, setWarehouseId],
          ['Lote ID', lotId, setLotId],
        ].map(([label, value, setter]) => (
          <label key={label as string} className="space-y-1 text-sm">
            {label as string}
            <Input
              value={value as string}
              onChange={(e) => (setter as (s: string) => void)(e.target.value)}
              placeholder="UUID"
            />
          </label>
        ))}
        <label className="space-y-1 text-sm">
          Tipo
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Todos</option>
            {['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Desde
          <input
            aria-label="Desde"
            type="datetime-local"
            className="h-9 rounded-md border bg-background px-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          Hasta
          <input
            aria-label="Hasta"
            type="datetime-local"
            className="h-9 rounded-md border bg-background px-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>
      {q.isPending && <p role="status">Cargando movimientos…</p>}
      <ErrorNotice error={q.error} />
      {q.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Movimientos">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Referencia empresarial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.occurredAt).toLocaleString('es-NI')}</TableCell>
                  <TableCell>{m.type}</TableCell>
                  <TableCell>
                    {m.product.code} · {m.product.name}
                  </TableCell>
                  <TableCell>{m.warehouse.code}</TableCell>
                  <TableCell>{m.lot?.code ?? '—'}</TableCell>
                  <TableCell>
                    {m.quantity} {m.product.unit}
                  </TableCell>
                  <TableCell>{m.reason ?? '—'}</TableCell>
                  <TableCell>{m.performedByUser.fullName}</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
              ))}
              {q.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No hay movimientos para estos filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <nav aria-label="Paginación de movimientos" className="flex items-center justify-between">
        <span>
          Página {page} de {pages} · {q.data?.meta.total ?? 0} movimientos
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
    </section>
  );
}
