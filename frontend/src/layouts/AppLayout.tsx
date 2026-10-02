import { Link, NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS } from '@/features/auth/types';
import { SessionActions } from '@/features/auth/components/SessionActions';
import { navigation } from './navigation';

export function AppLayout() {
  const { data: user } = useSession();
  if (!user) return null;
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            EcoSoap <span className="text-muted-foreground">ERP</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{user.fullName}</span>
            <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
            <Button asChild variant="ghost">
              <Link to="/account/password">Cambiar contraseña</Link>
            </Button>
            <SessionActions />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:grid-cols-[160px_1fr] sm:px-8">
        <nav aria-label="Menú principal" className="flex gap-2 sm:flex-col">
          {navigation
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-medium ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
