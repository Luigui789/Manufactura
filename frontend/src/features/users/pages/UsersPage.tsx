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
import { ROLE_LABELS } from '@/features/auth/types';
import { useUsers } from '../hooks/use-users';
import type { User } from '../services/users-api';
import {
  CreateUserDialog,
  ChangeRoleDialog,
  ResetPasswordDialog,
  SetActiveDialog,
} from '../components/UserDialogs';

type Action = { type: 'create' } | { type: 'role' | 'password' | 'active'; user: User };
export function UsersPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const session = useSession();
  const users = useUsers(page);
  const onClose = () => setAction(null);
  const onSuccess = (notice: string) => {
    setAction(null);
    setMessage(notice);
  };
  const openAction = (next: Action) => {
    setMessage('');
    setAction(next);
  };
  const totalPages = Math.max(1, Math.ceil((users.data?.meta.total ?? 0) / 20));
  return (
    <section className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Administración' }, { label: 'Usuarios' }]}
        title="Usuarios"
        description="Administrá las cuentas y el acceso al ERP."
        actions={
          <>
            {' '}
            <Button onClick={() => openAction({ type: 'create' })}>Crear usuario</Button>{' '}
          </>
        }
      />
      {message && <SuccessNotice>{message}</SuccessNotice>}
      {users.isPending && <LoadingState label="Cargando usuarios…" />}
      <ErrorNotice error={users.error} />
      {users.isError && (
        <Button variant="outline" onClick={() => void users.refetch()}>
          Reintentar
        </Button>
      )}
      {users.data && (
        <>
          <div className="rounded-lg border bg-background">
            <Table aria-label="Usuarios">
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.data.map((user) => {
                  const own = user.id === session.data?.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="font-medium">
                          {user.fullName}
                          {own && ' (tú)'}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </TableCell>
                      <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={user.isActive} />
                          {user.mustChangePassword && (
                            <span className="text-xs text-muted-foreground">
                              Cambio de contraseña pendiente
                            </span>
                          )}
                        </div>
                        {own && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Tu cuenta: cambiá tu contraseña desde el menú de sesión. Otra persona
                            administradora gestiona tu rol y estado.
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={own && user.isActive}
                            onClick={() => openAction({ type: 'active', user })}
                          >
                            {user.isActive ? 'Desactivar' : 'Activar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={own}
                            onClick={() => openAction({ type: 'role', user })}
                          >
                            Cambiar rol
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={own}
                            onClick={() => openAction({ type: 'password', user })}
                          >
                            Restablecer contraseña
                          </Button>
                        </div>
                        {own && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Tu cuenta: cambiá tu contraseña desde el menú de sesión. Otra persona
                            administradora gestiona tu rol y estado.
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.data.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No hay usuarios en esta página. Usá el botón de alta para registrar una nueva
                      cuenta o entidad cuando tu rol lo permita.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pages={totalPages}
            total={users.data.meta.total}
            label="Paginación de usuarios"
            onPageChange={setPage}
            busy={users.isFetching}
          />
        </>
      )}
      {action?.type === 'create' && <CreateUserDialog onClose={onClose} onSuccess={onSuccess} />}
      {action?.type === 'role' && (
        <ChangeRoleDialog user={action.user} onClose={onClose} onSuccess={onSuccess} />
      )}
      {action?.type === 'password' && (
        <ResetPasswordDialog user={action.user} onClose={onClose} onSuccess={onSuccess} />
      )}
      {action?.type === 'active' && (
        <SetActiveDialog user={action.user} onClose={onClose} onSuccess={onSuccess} />
      )}
    </section>
  );
}
