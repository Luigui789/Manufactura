import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, LoadingState, Pagination, PageHeader, SuccessNotice } from '@/components/erp';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import { useProducts } from '../api/product-hooks';
import { CreateProductDialog } from '../components/products/CreateProductDialog';
import { EditProductDialog } from '../components/products/EditProductDialog';
import { ProductDetailDialog } from '../components/products/ProductDetailDialog';
import { ProductStatusDialog } from '../components/products/ProductStatusDialog';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '../product-labels';
import { PRODUCT_TYPES } from '../schemas';
import type { Product, ProductFilters } from '../types';

type StatusFilter = 'all' | 'active' | 'inactive';

export function ProductsPage() {
  const [page, setPage] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [statusTarget, setStatusTarget] = useState<Product | null>(null);
  const [message, setMessage] = useState('');

  const [status, setStatus] = useState<StatusFilter>('all');
  const [type, setType] = useState<Product['type'] | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data: session } = useSession();
  const canManage = session?.role === 'ADMIN' || session?.role === 'INVENTARIO';

  const filters: ProductFilters = {
    ...(status !== 'all' ? { isActive: status === 'active' } : {}),
    ...(type ? { type } : {}),
    ...(search ? { search } : {}),
  };
  const hasFilters = status !== 'all' || type !== '' || search !== '';

  const products = useProducts(page, filters);

  const totalPages = products.data
    ? Math.max(1, Math.ceil(products.data.meta.total / products.data.meta.limit))
    : 1;

  const clearFilters = () => {
    setStatus('all');
    setType('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="Gestión de Productos"
        description="Consulta las materias primas, productos intermedios y productos terminados."
        actions={
          <>
            {' '}
            {canManage && (
              <Button
                onClick={() => {
                  setMessage('');
                  setIsCreating(true);
                }}
              >
                Nuevo producto
              </Button>
            )}{' '}
          </>
        }
      />

      <form
        role="search"
        aria-label="Filtros de productos"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="product-filter-search">Buscar producto</Label>
          <Input
            id="product-filter-search"
            type="search"
            placeholder="Código o nombre"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="product-filter-status">Filtrar por estado</Label>
          <select
            id="product-filter-status"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Solo activos</option>
            <option value="inactive">Solo inactivos</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="product-filter-type">Filtrar por tipo</Label>
          <select
            id="product-filter-type"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={type}
            onChange={(event) => {
              setType(event.target.value as Product['type'] | '');
              setPage(1);
            }}
          >
            <option value="">Todos los tipos</option>
            {PRODUCT_TYPES.map((value) => (
              <option key={value} value={value}>
                {PRODUCT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {(hasFilters || searchInput) && (
          <Button type="button" variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </form>

      {message && <SuccessNotice>{message}</SuccessNotice>}

      {products.isPending && <LoadingState label="Cargando productos…" />}

      <ErrorNotice error={products.error} />

      {products.isError && (
        <Button
          variant="outline"
          disabled={products.isFetching}
          onClick={() => void products.refetch()}
        >
          Reintentar
        </Button>
      )}

      {products.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Productos">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Lotes / calidad</TableHead>
                <TableHead className="min-w-[6rem]">Estado</TableHead>
                <TableHead className="whitespace-nowrap">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {products.data.data.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{PRODUCT_UNIT_LABELS[product.unit]}</TableCell>
                  <TableCell>{PRODUCT_TYPE_LABELS[product.type]}</TableCell>
                  <TableCell>
                    <span className="text-xs">
                      Lotes: {product.isLotTracked ? 'Sí' : 'No'}
                      <br />
                      Calidad: {product.requiresQualityInspection ? 'Sí' : 'No'}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[6rem]">
                    <StatusBadge status={product.isActive} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setViewingId(product.id)}>
                        Ver
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMessage('');
                              setEditTarget(product);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMessage('');
                              setStatusTarget(product);
                            }}
                          >
                            {product.isActive ? 'Desactivar' : 'Activar'}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {products.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {hasFilters
                      ? 'No hay productos que coincidan con los filtros.'
                      : 'No hay productos en esta página.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination
        page={page}
        pages={totalPages}
        total={products.data?.meta.total}
        label="Paginación de resultados"
        onPageChange={setPage}
        busy={products.isFetching}
        unavailable={products.isError || !products.data}
      />

      {canManage && isCreating && (
        <CreateProductDialog
          onClose={() => setIsCreating(false)}
          onSuccess={(notice) => {
            setIsCreating(false);
            setMessage(notice);
            setPage(1);
          }}
        />
      )}

      {viewingId && (
        <ProductDetailDialog productId={viewingId} onClose={() => setViewingId(null)} />
      )}

      {canManage && editTarget && (
        <EditProductDialog
          product={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(notice) => {
            setEditTarget(null);
            setMessage(notice);
          }}
        />
      )}

      {canManage && statusTarget && (
        <ProductStatusDialog
          product={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSuccess={(notice) => {
            setStatusTarget(null);
            setMessage(notice);
          }}
        />
      )}
    </section>
  );
}
