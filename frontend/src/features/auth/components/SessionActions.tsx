import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useLogout } from '../hooks/use-auth';

export function SessionActions() {
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={logout.isPending}
        onClick={() =>
          logout.mutate(undefined, {
            onSuccess: () => navigate('/login', { replace: true }),
          })
        }
      >
        {logout.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </Button>
      <ErrorNotice error={logout.error} />
    </div>
  );
}
