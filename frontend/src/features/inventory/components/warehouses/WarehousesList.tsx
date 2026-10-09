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
import { useWarehouses } from '../../api/hooks';
import type { Warehouse } from '../../types';
import {
  CreateWarehouseDialog,
  EditWarehouseDialog,
  WarehouseStatusDialog,
} from './WarehouseDialogs';

type Action = { type: 'create' } | { type: 'edit' | 'status'; warehouse: Warehouse };

export function WarehousesList() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const warehouses = useWarehouses(page);
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

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => openAction({ type: 'create' })}>Nuevo almacén</Button>
        </div>
      )}

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
                    No hay almacenes en esta página.
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
