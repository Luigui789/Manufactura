import { useState } from 'react';

import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

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

import { EmptyState, LoadingState, PageHeader, Pagination, StatusBadge } from '@/components/erp';

import { ErrorNotice } from '@/components/ErrorNotice';

import { useSession } from '@/features/auth/hooks/use-auth';

import { PRODUCT_TYPE_LABELS } from '@/features/inventory/product-labels';

import { useProductionRoutes } from '../api/routes';

import { formatStandardMinutes } from '../route-schemas';

export function RoutesPage() {
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const session = useSession();
  const manage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';

  const query = useProductionRoutes({
    page,
    search,
    isActive: status === 'all' ? undefined : status === 'active',
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Rutas de producción"
        description="Configura las operaciones y tiempos estándar de fabricación."
        breadcrumbs={[{ label: 'Producción' }, { label: 'Rutas' }]}
        actions={
          manage && (
            <Button asChild>
              <Link to="/production/routes/new">Crear ruta</Link>
            </Button>
          )
        }
      />

      <form
        role="search"
        className="flex flex-wrap items-end gap-3 border-y py-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="route-search">Buscar ruta o producto</Label>
          <Input
            id="route-search"
            type="search"
            maxLength={100}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="route-status">Estado</Label>
          <select
            id="route-status"
            className="h-9 rounded-md border bg-background px-3"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {query.isPending && <LoadingState label="Cargando rutas…" />}
      <ErrorNotice error={query.error} />
      {query.isError && (
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
          Reintentar
        </Button>
      )}

      {query.data?.data.length === 0 && (
        <EmptyState
          title="No hay rutas de producción configuradas."
          description="Prueba otros filtros o configura una ruta para tu producto."
        />
      )}

      {!!query.data?.data.length && (
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label="Rutas de producción">
            <TableHeader>
              <TableRow>
                {[
                  'Código',
                  'Ruta',
                  'Producto',
                  'Tipo producto',
                  'Operaciones',
                  'Tiempo estándar',
                  'Estado',
                  'Acciones',
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>{route.code}</TableCell>
                  <TableCell className="whitespace-normal">{route.name}</TableCell>
                  <TableCell className="whitespace-normal">
                    {route.product.code} · {route.product.name}
                  </TableCell>
                  <TableCell>{PRODUCT_TYPE_LABELS[route.product.type]}</TableCell>
                  <TableCell>{route.operationCount}</TableCell>
                  <TableCell>{formatStandardMinutes(route.totalStandardMinutes)}</TableCell>
                  <TableCell>
                    <StatusBadge status={route.isActive} />
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost">
                      <Link to={'/production/routes/' + route.id}>Ver detalle</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {query.data && (
        <Pagination
          page={page}
          pages={Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))}
          total={query.data.meta.total}
          label="rutas"
          onPageChange={setPage}
          busy={query.isFetching}
          unavailable={query.isError}
        />
      )}
    </section>
  );
}
