import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '../hooks/use-auth';
import type { RoleCode } from '../types';

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending)
    return (
      <main className="p-8" role="status">
        Cargando sesión…
      </main>
    );
  if (session.isError)
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8">
        <ErrorNotice error={session.error} />
        <Button onClick={() => void session.refetch()}>Reintentar</Button>
      </main>
    );
  if (!session.data) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
export function RequirePasswordCurrent() {
  const { data } = useSession();
  return data?.mustChangePassword ? <Navigate to="/account/password" replace /> : <Outlet />;
}
export function RequireRole({ roles }: { roles: RoleCode[] }) {
  const { data } = useSession();
  return data && roles.includes(data.role) ? (
    <Outlet />
  ) : (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">403 · Acceso denegado</h1>
      <p className="text-muted-foreground">Tu rol no permite acceder a esta página.</p>
    </section>
  );
}
