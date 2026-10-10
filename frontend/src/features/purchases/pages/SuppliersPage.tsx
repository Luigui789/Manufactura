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
import { useSuppliers } from '../hooks/useSuppliers';
import {
  CreateSupplierDialog,
  EditSupplierDialog,
  SupplierStatusDialog,
} from '../components/suppliers/SupplierDialogs';
import type { Supplier } from '../types';

type Action = { type: 'create' } | { type: 'edit' | 'status'; supplier: Supplier };

export default function SuppliersPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');

  const { data: session } = useSession();
  const canManage = session?.role === 'ADMIN' || session?.role === 'COMPRAS';

  const suppliers = useSuppliers(page);

  const totalPages = suppliers.data
    ? Math.max(1, Math.ceil(suppliers.data.meta.total / suppliers.data.meta.limit))
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

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gestión de Proveedores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta y administra los proveedores de materias primas e insumos.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => openAction({ type: 'create' })}>Nuevo proveedor</Button>
        )}
      </div>

      {message && (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
          {message}
        </p>
      )}

      {suppliers.isPending && <p role="status">Cargando proveedores…</p>}

      <ErrorNotice error={suppliers.error} />

      {suppliers.isError && (
        <Button
          variant="outline"
          disabled={suppliers.isFetching}
          onClick={() => void suppliers.refetch()}
        >
          Reintentar
        </Button>
      )}

      {suppliers.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Proveedores">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Razón social</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead className="min-w-[6rem]">Estado</TableHead>
                {canManage && <TableHead className="whitespace-nowrap">Acciones</TableHead>}
              </TableRow>
            </TableHeader>

            <TableBody>
              {suppliers.data.data.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.code}</TableCell>
                  <TableCell>
                    <div>{supplier.name}</div>
                    {supplier.taxId && (
                      <div className="text-sm text-muted-foreground">RUC {supplier.taxId}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{supplier.email ?? '—'}</div>
                    <div className="text-sm text-muted-foreground">{supplier.phone ?? '—'}</div>
                  </TableCell>
                  <TableCell>{supplier.address ?? '—'}</TableCell>
                  <TableCell className="min-w-[6rem]">
                    <Badge variant={supplier.isActive ? 'secondary' : 'outline'}>
                      {supplier.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Editar ${supplier.code}`}
                          onClick={() => openAction({ type: 'edit', supplier })}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`${supplier.isActive ? 'Desactivar' : 'Activar'} ${supplier.code}`}
                          onClick={() => openAction({ type: 'status', supplier })}
                        >
                          {supplier.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {suppliers.data.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No hay proveedores en esta página.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <nav
        aria-label="Paginación de proveedores"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {suppliers.data
            ? `Página ${page} de ${totalPages} · ${suppliers.data.meta.total} proveedores`
            : `Página ${page}`}
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || suppliers.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={
              !suppliers.data || suppliers.isError || suppliers.isFetching || page >= totalPages
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </nav>

      {canManage && action?.type === 'create' && (
        <CreateSupplierDialog
          onClose={onClose}
          onSuccess={(notice) => {
            onSuccess(notice);
            setPage(1);
          }}
        />
      )}

      {canManage && action?.type === 'edit' && (
        <EditSupplierDialog
          key={action.supplier.id}
          supplier={action.supplier}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}

      {canManage && action?.type === 'status' && (
        <SupplierStatusDialog
          key={action.supplier.id}
          supplier={action.supplier}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </section>
  );
}
