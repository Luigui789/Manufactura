import { PageHeader, LoadingState, Pagination, SuccessNotice } from '@/components/erp';
import { unitLabel, productTypeLabel } from '@/lib/presentation';
import { InventoryEntityPicker } from '../components/InventoryEntityPicker';
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
      <PageHeader
        title="Existencias"
        description="Saldo físico por producto y almacén. Consultá qué tenés disponible antes de operar."
        actions={canAdjust && <Button onClick={() => setAdjust(true)}>Nuevo ajuste</Button>}
      />
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Código o nombre"
          />
        </label>
        <InventoryEntityPicker
          kind="warehouse"
          activeOnly
          value={warehouseId}
          allowClear
          onChange={(id) => {
            setWarehouseId(id);
            setPage(1);
          }}
        />
        <label className="space-y-1 text-sm">
          Tipo
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={productType}
            onChange={(e) => {
              setProductType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {['RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED_GOOD', 'CONSUMABLE'].map((v) => (
              <option key={v} value={v}>
                {productTypeLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasStock}
            onChange={(e) => {
              setHasStock(e.target.checked);
              setPage(1);
            }}
          />
          Solo con existencia
        </label>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        {(search || warehouseId || productType || hasStock) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setWarehouseId('');
              setProductType('');
              setHasStock(false);
              setPage(1);
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </form>
      {notice && <SuccessNotice>{notice}</SuccessNotice>}
      {query.isPending && <LoadingState label="Cargando existencias…" />}
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
                <TableHead className="numeric">Cantidad</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Actualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.product.code} · {row.product.name}
                  </TableCell>
                  <TableCell>{productTypeLabel(row.product.type)}</TableCell>
                  <TableCell>
                    {row.warehouse.code} · {row.warehouse.name}
                  </TableCell>
                  <TableCell className="numeric">{row.quantity}</TableCell>
                  <TableCell>{unitLabel(row.product.unit)}</TableCell>
                  <TableCell>
                    {new Date(row.updatedAt).toLocaleString('es-NI', {
                      timeZone: 'America/Managua',
                    })}
                  </TableCell>
                </TableRow>
              ))}
              {query.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No hay existencias para estos filtros.
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
        total={query.data?.meta.total}
        label="Paginación de existencias"
        onPageChange={setPage}
        busy={query.isFetching}
        unavailable={!query.data || query.isError}
      />
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
