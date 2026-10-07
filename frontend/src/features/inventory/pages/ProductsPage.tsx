import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { Product } from '../types';

export function ProductsPage() {
  const [page, setPage] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [statusTarget, setStatusTarget] = useState<Product | null>(null);
  const [message, setMessage] = useState('');

  const { data: session } = useSession();
  const canManage = session?.role === 'ADMIN' || session?.role === 'INVENTARIO';

  const products = useProducts(page);

  const totalPages = products.data
    ? Math.max(1, Math.ceil(products.data.meta.total / products.data.meta.limit))
    : 1;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gestión de Productos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta las materias primas, productos intermedios y productos terminados.
          </p>
        </div>

        {canManage && (
          <Button
            onClick={() => {
              setMessage('');
              setIsCreating(true);
            }}
          >
            Nuevo producto
          </Button>
        )}
      </div>

      {message && (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
          {message}
        </p>
      )}

      {products.isPending && <p role="status">Cargando productos…</p>}

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
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
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
                    <Badge variant={product.isActive ? 'secondary' : 'outline'}>
                      {product.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
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
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No hay productos en esta página.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <nav
        aria-label="Paginación de productos"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {products.data
            ? `Página ${page} de ${totalPages} · ${products.data.meta.total} productos`
            : `Página ${page}`}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || products.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>

          <Button
            variant="outline"
            disabled={
              !products.data || products.isError || products.isFetching || page >= totalPages
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </nav>

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
