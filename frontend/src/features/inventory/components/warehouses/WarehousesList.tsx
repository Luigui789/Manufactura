import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useWarehouses } from '../../api/hooks';
import type { WarehouseFilters } from '../../api/warehouses';
import type { Warehouse } from '../../types';
import {
  CreateWarehouseDialog,
  EditWarehouseDialog,
  WarehouseStatusDialog,
} from './WarehouseDialogs';

type Action = { type: 'create' } | { type: 'edit' | 'status'; warehouse: Warehouse };
type StatusFilter = 'all' | 'active' | 'inactive';

export function WarehousesList() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const filters: WarehouseFilters = {
    ...(status !== 'all' ? { isActive: status === 'active' } : {}),
    ...(search ? { search } : {}),
  };
  const hasFilters = status !== 'all' || search !== '';

  const warehouses = useWarehouses(page, filters);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');

  const canManage = session?.role === 'ADMIN' || session?.role === 'INVENTARIO';
  const totalPages = warehouses.data
    ? Math.max(1, Math.ceil(warehouses.data.meta.total / warehouses.data.meta.limit))
    : 1;

  const openAction = (next: Action) => {
    if (!canManage) return;
    setMessage('');
    setAction(next);
  };

  const onClose = () => setAction(null);

  const onSuccess = (notice: string) => {
    setAction(null);
    setMessage(notice);
  };

  const changePage = (nextPage: number) => {
    setMessage('');
    setPage(nextPage);
  };

  const clearFilters = () => {
    setStatus('all');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => openAction({ type: 'create' })}>Nuevo almacén</Button>
        </div>
      )}

      <form
        role="search"
        aria-label="Filtros de almacenes"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="warehouse-filter-search">Buscar almacén</Label>
          <Input
            id="warehouse-filter-search"
            type="search"
            placeholder="Código, nombre o ubicación"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="warehouse-filter-status">Filtrar por estado</Label>
          <select
            id="warehouse-filter-status"
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

        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {(hasFilters || searchInput) && (
          <Button type="button" variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </form>

      {message && (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
          {message}
        </p>
      )}

      {warehouses.isPending && (
        <p role="status" className="p-8 text-center text-muted-foreground">
          Cargando almacenes…
        </p>
      )}

      <ErrorNotice error={warehouses.error} />

      {warehouses.isError && (
        <Button variant="outline" onClick={() => void warehouses.refetch()}>
          Reintentar
        </Button>
      )}

      {warehouses.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Almacenes">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {warehouses.data.data.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell className="font-medium">{warehouse.code}</TableCell>
                  <TableCell>{warehouse.name}</TableCell>
                  <TableCell>{warehouse.location || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={warehouse.isActive ? 'secondary' : 'outline'}>
                      {warehouse.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>

                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Editar ${warehouse.code}`}
                          onClick={() => openAction({ type: 'edit', warehouse })}
                        >
                          Editar
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`${
                            warehouse.isActive ? 'Desactivar' : 'Activar'
                          } ${warehouse.code}`}
                          onClick={() => openAction({ type: 'status', warehouse })}
                        >
                          {warehouse.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {warehouses.data.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 5 : 4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {hasFilters
                      ? 'No hay almacenes que coincidan con los filtros.'
                      : 'No hay almacenes en esta página.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <nav
        aria-label="Paginación de almacenes"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {warehouses.data
            ? `Página ${page} de ${totalPages} · ${warehouses.data.meta.total} almacenes`
            : `Página ${page}`}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || warehouses.isFetching}
            onClick={() => changePage(page - 1)}
          >
            Anterior
          </Button>

          <Button
            variant="outline"
            disabled={
              !warehouses.data || warehouses.isError || warehouses.isFetching || page >= totalPages
            }
            onClick={() => changePage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      </nav>

      {canManage && action?.type === 'create' && (
        <CreateWarehouseDialog onClose={onClose} onSuccess={onSuccess} />
      )}

      {canManage && action?.type === 'edit' && (
        <EditWarehouseDialog
          key={action.warehouse.id}
          warehouse={action.warehouse}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}

      {canManage && action?.type === 'status' && (
        <WarehouseStatusDialog
          key={action.warehouse.id}
          warehouse={action.warehouse}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}
