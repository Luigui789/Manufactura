import { Link } from 'react-router';
import { PageHeader, LoadingState, Pagination } from '@/components/erp';
import { unitLabel, reasonLabel } from '@/lib/presentation';
import { InventoryEntityPicker } from '../components/InventoryEntityPicker';
import { MOVEMENT_LABELS, movementLabel } from '../inventory-labels';
import { useState } from 'react';
import { BusinessReference } from '../components/BusinessReference';
import { Button } from '@/components/ui/button';
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
      <PageHeader
        title="Movimientos"
        description="Qué cambió y por qué: historial inmutable de entradas, salidas y su referencia empresarial. Fechas y horas de Managua."
      />
      <form
        role="search"
        aria-label="Filtros de movimientos"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <InventoryEntityPicker
          kind="product"
          value={productId}
          allowClear
          onChange={(id) => {
            setProductId(id);
            setPage(1);
          }}
        />
        <InventoryEntityPicker
          kind="warehouse"
          value={warehouseId}
          allowClear
          onChange={(id) => {
            setWarehouseId(id);
            setPage(1);
          }}
        />
        <InventoryEntityPicker
          kind="lot"
          value={lotId}
          allowClear
          onChange={(id) => {
            setLotId(id);
            setPage(1);
          }}
        />
        <label className="space-y-1 text-sm">
          Tipo
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
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
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Hasta
          <input
            aria-label="Hasta"
            type="datetime-local"
            className="h-9 rounded-md border bg-background px-2"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        {(productId || warehouseId || lotId || type || from || to) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setProductId('');
              setWarehouseId('');
              setLotId('');
              setType('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </form>
      {q.isPending && <LoadingState label="Cargando movimientos…" />}
      <ErrorNotice error={q.error} />
      {q.isError && (
        <Button variant="outline" onClick={() => void q.refetch()}>
          Reintentar
        </Button>
      )}
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
                <TableHead className="numeric">Cantidad</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Referencia empresarial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    {new Date(m.occurredAt).toLocaleString('es-NI', {
                      timeZone: 'America/Managua',
                    })}
                  </TableCell>
                  <TableCell>{movementLabel(m.type)}</TableCell>
                  <TableCell>
                    {m.product.code} · {m.product.name}
                  </TableCell>
                  <TableCell>{m.warehouse.code}</TableCell>
                  <TableCell>
                    {m.lot ? (
                      <Link className="underline" to={'/inventory/lots?lotId=' + m.lot.id}>
                        {m.lot.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="numeric">
                    {m.quantity.startsWith('-')
                      ? m.quantity
                      : (['ADJUSTMENT_OUT', 'PRODUCTION_CONSUMPTION'].includes(m.type)
                          ? '-'
                          : '+') + m.quantity}{' '}
                    {unitLabel(m.product.unit)}
                  </TableCell>
                  <TableCell>{reasonLabel(m.reason)}</TableCell>
                  <TableCell>{m.performedByUser.fullName}</TableCell>
                  <TableCell>
                    <BusinessReference reference={m.businessReference} />
                  </TableCell>
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
      <Pagination
        page={page}
        pages={pages}
        total={q.data?.meta.total}
        label="Paginación de movimientos"
        onPageChange={setPage}
        busy={q.isFetching}
        unavailable={!q.data || q.isError}
      />
    </section>
  );
}
