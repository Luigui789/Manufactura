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
import { useInventoryStock } from '../api/inventory-hooks';
import { useWarehouses } from '../api/hooks';
import { AdjustmentDialog } from '../components/stock/AdjustmentDialog';
import { useSession } from '@/features/auth/hooks/use-auth';
export function StockPage() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [warehouseId, setWarehouseId] = useState(''),
    [productType, setProductType] = useState(''),
    [hasStock, setHasStock] = useState(false),
    [adjust, setAdjust] = useState(false),
    [notice, setNotice] = useState('');
  const { data: session } = useSession();
  const warehouses = useWarehouses(1, { isActive: true }, 100);
  const canAdjust = session?.role === 'ADMIN' || session?.role === 'INVENTARIO';
  const query = useInventoryStock(
    {
      ...(search ? { search } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(productType ? { productType } : {}),
      ...(hasStock ? { hasStock: true } : {}),
    },
    page,
  );
  const pages = query.data
    ? Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))
    : 1;
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Existencias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta el saldo físico por producto y almacén.
          </p>
        </div>
        {canAdjust && <Button onClick={() => setAdjust(true)}>Nuevo ajuste</Button>}
      </header>
      <form
        role="search"
        aria-label="Filtros de existencias"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="space-y-1 text-sm">
          Buscar producto
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Código o nombre"
          />
        </label>
        <label className="space-y-1 text-sm">
          Almacén
          <select
            aria-label="Almacén"
            className="h-9 rounded-md border bg-background px-2"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">Todos</option>
            {warehouses.data?.data.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} · {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          Tipo
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
          >
            <option value="">Todos</option>
            {['RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED_GOOD', 'CONSUMABLE'].map((v) => (
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
      {notice && <p role="status">{notice}</p>}
      {query.isPending && <p role="status">Cargando existencias…</p>}
      <ErrorNotice error={query.error} />
      {query.isError && (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      )}
      {query.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Existencias">
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Actualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.product.code} · {row.product.name}
                  </TableCell>
                  <TableCell>{row.product.type}</TableCell>
                  <TableCell>
                    {row.warehouse.code} · {row.warehouse.name}
                  </TableCell>
                  <TableCell>
                    {row.quantity} {row.product.unit}
                  </TableCell>
                  <TableCell>{new Date(row.updatedAt).toLocaleString('es-NI')}</TableCell>
                </TableRow>
              ))}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No hay existencias para estos filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <nav aria-label="Paginación de existencias" className="flex items-center justify-between">
        <span>
          Página {page} de {pages} · {query.data?.meta.total ?? 0} registros
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={!query.data || page >= pages || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </nav>
      {canAdjust && adjust && (
        <AdjustmentDialog
          onClose={() => setAdjust(false)}
          onSuccess={(msg) => {
            setNotice(msg);
            setAdjust(false);
          }}
        />
      )}
    </section>
  );
}
