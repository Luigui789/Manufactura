import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge, LoadingState, Pagination, PageHeader, SuccessNotice } from '@/components/erp';
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
import { useCustomers } from '../hooks/useCustomers';
import {
  CreateCustomerDialog,
  EditCustomerDialog,
  CustomerStatusDialog,
} from '../components/customers/CustomerDialogs';
import type { Customer } from '../types';

type Action = { type: 'create' } | { type: 'edit' | 'status'; customer: Customer };

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');

  const { data: session } = useSession();
  const canManage = session?.role === 'ADMIN' || session?.role === 'VENTAS';

  const customers = useCustomers(page);

  const totalPages = customers.data
    ? Math.max(1, Math.ceil(customers.data.meta.total / customers.data.meta.limit))
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
      <PageHeader
        title="Gestión de Clientes"
        description="Consulta y administra los clientes que compran los productos terminados."
        actions={
          <>
            {' '}
            {canManage && (
              <Button onClick={() => openAction({ type: 'create' })}>Nuevo cliente</Button>
            )}{' '}
          </>
        }
      />

      {message && <SuccessNotice>{message}</SuccessNotice>}

      {customers.isPending && <LoadingState label="Cargando clientes…" />}

      <ErrorNotice error={customers.error} />

      {customers.isError && (
        <Button
          variant="outline"
          disabled={customers.isFetching}
          onClick={() => void customers.refetch()}
        >
          Reintentar
        </Button>
      )}

      {customers.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Clientes">
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
              {customers.data.data.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.code}</TableCell>
                  <TableCell>
                    <div>{customer.name}</div>
                    {customer.taxId && (
                      <div className="text-sm text-muted-foreground">RUC {customer.taxId}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{customer.email ?? '—'}</div>
                    <div className="text-sm text-muted-foreground">{customer.phone ?? '—'}</div>
                  </TableCell>
                  <TableCell>{customer.address ?? '—'}</TableCell>
                  <TableCell className="min-w-[6rem]">
                    <StatusBadge status={customer.isActive} />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Editar ${customer.code}`}
                          onClick={() => openAction({ type: 'edit', customer })}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`${customer.isActive ? 'Desactivar' : 'Activar'} ${customer.code}`}
                          onClick={() => openAction({ type: 'status', customer })}
                        >
                          {customer.isActive ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}

              {customers.data.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No hay clientes en esta página. Usá el botón de alta para registrar una nueva
                    cuenta o entidad cuando tu rol lo permita.
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
        total={customers.data?.meta.total}
        label="Paginación de resultados"
        onPageChange={setPage}
        busy={customers.isFetching}
        unavailable={customers.isError || !customers.data}
      />

      {canManage && action?.type === 'create' && (
        <CreateCustomerDialog
          onClose={onClose}
          onSuccess={(notice) => {
            onSuccess(notice);
            setPage(1);
          }}
        />
      )}

      {canManage && action?.type === 'edit' && (
        <EditCustomerDialog
          key={action.customer.id}
          customer={action.customer}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}

      {canManage && action?.type === 'status' && (
        <CustomerStatusDialog
          key={action.customer.id}
          customer={action.customer}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </section>
  );
}
