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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Administra las cuentas y el acceso al ERP.
          </p>
        </div>
        <Button onClick={() => openAction({ type: 'create' })}>Crear usuario</Button>
      </div>
      {message && (
        <p role="status" className="rounded-lg border bg-background p-3 text-sm">
          {message}
        </p>
      )}
      {users.isPending && <p role="status">Cargando usuarios…</p>}
      <ErrorNotice error={users.error} />
      {users.isError && (
        <Button variant="outline" onClick={() => void users.refetch()}>
          Reintentar
        </Button>
      )}
      {users.data && (
        <>
          <div className="rounded-lg border bg-background">
            <Table>
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
                          <Badge variant={user.isActive ? 'secondary' : 'outline'}>
                            {user.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                          {user.mustChangePassword && (
                            <span className="text-xs text-muted-foreground">
                              Cambio de contraseña pendiente
                            </span>
                          )}
                        </div>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
                {users.data.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No hay usuarios en esta página.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Página {page} de {totalPages} · {users.data.meta.total} usuarios
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1 || users.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={page >= totalPages || users.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
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
