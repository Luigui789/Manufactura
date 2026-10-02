import { Navigate, useLocation } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { useSession } from '../hooks/use-auth';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const from: unknown = (location.state as { from?: unknown } | null)?.from;
  if (session.isPending)
    return (
      <main className="p-8" role="status">
        Cargando sesión…
      </main>
    );
  if (session.data)
    return (
      <Navigate
        to={
          session.data.mustChangePassword
            ? '/account/password'
            : typeof from === 'string' &&
                from.startsWith('/') &&
                !from.startsWith('//') &&
                from !== '/login'
              ? from
              : '/'
        }
        replace
      />
    );
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            EcoSoap Nicaragua
          </p>
          <CardTitle className="text-2xl">EcoSoap ERP</CardTitle>
          <CardDescription>Ingresa con tu cuenta para continuar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!!from && (
            <p role="status" className="text-sm text-muted-foreground">
              Tu sesión expiró o fue cerrada
            </p>
          )}
          <ErrorNotice error={session.error} />
          {session.isError && (
            <Button variant="outline" onClick={() => void session.refetch()}>
              Reintentar conexión
            </Button>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
