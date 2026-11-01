import { useId, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { ChevronDown, Menu, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS, type RoleCode } from '@/features/auth/types';
import { SessionActions } from '@/features/auth/components/SessionActions';
import {
  activeNavigation,
  navigation,
  navigationGroups,
  navigationModules,
  type NavigationItem,
} from './navigation';

const itemClass = (isActive: boolean) =>
  isActive
    ? 'bg-primary text-primary-foreground'
    : 'text-muted-foreground hover:bg-muted hover:text-foreground';

function NavModule({
  name,
  items,
  open,
  current,
  onToggle,
  onNavigate,
}: {
  name: string;
  items: NavigationItem[];
  open: boolean;
  current: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const id = useId();
  const Icon = navigationModules[name];
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors duration-150 hover:bg-muted hover:text-foreground ${current ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        <span className="flex-1">{name}</span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul id={id} className="mt-1 ml-5 space-y-0.5 border-l pl-2">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex min-h-9 items-center rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${isActive ? 'font-medium' : ''} ${itemClass(isActive)}`
                }
              >
                {/* The module name keeps the accessible name unambiguous ("Producción · Órdenes"). */}
                <span className="sr-only">{name} ·</span> {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Navigation({ role, onNavigate }: { role: RoleCode; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const activeModule = activeNavigation(pathname)?.module;
  const [expanded, setExpanded] = useState<string[]>(activeModule ? [activeModule] : []);
  const [revealed, setRevealed] = useState(activeModule);
  // Arriving at a module (link, deep link, back/forward) always reveals where the user is.
  if (revealed !== activeModule) {
    setRevealed(activeModule);
    if (activeModule && !expanded.includes(activeModule)) setExpanded([...expanded, activeModule]);
  }
  const allowed = navigation.filter((item) => item.roles.includes(role));
  return (
    <nav aria-label="Menú principal" className="space-y-6">
      {navigationGroups.map((group) => {
        const items = allowed.filter((item) => item.group === group);
        const modules = [...new Set(items.flatMap((item) => item.module ?? []))];
        return (
          items.length > 0 && (
            <div key={group}>
              <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{group}</p>
              <ul className="space-y-1">
                {items
                  .filter((item) => !item.module)
                  .map(({ to, label, icon: Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={to === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${itemClass(isActive)}`
                        }
                      >
                        <Icon aria-hidden className="size-4 shrink-0" />
                        {label}
                      </NavLink>
                    </li>
                  ))}
                {modules.map((module) => (
                  <NavModule
                    key={module}
                    name={module}
                    items={items.filter((item) => item.module === module)}
                    open={expanded.includes(module)}
                    current={module === activeModule}
                    onNavigate={onNavigate}
                    onToggle={() =>
                      setExpanded((open) =>
                        open.includes(module)
                          ? open.filter((m) => m !== module)
                          : [...open, module],
                      )
                    }
                  />
                ))}
              </ul>
            </div>
          )
        );
      })}
    </nav>
  );
}
export function AppLayout() {
  const { data: user } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  if (!user) return null;
  const active = activeNavigation(location.pathname);
  const trail =
    !active || active.to === '/' ? ['Inicio'] : [active.module ?? active.group, active.label];
  return (
    <div className="min-h-svh bg-muted/50">
      <a href="#main-content" className="skip-link">
        Saltar al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-background lg:flex">
        <Link
          to="/"
          className="flex h-16 items-center border-b px-6 text-lg font-semibold tracking-tight"
        >
          EcoSoap <span className="ml-1.5 font-normal text-muted-foreground">ERP</span>
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-6">
          <Navigation role={user.role} />
        </div>
        <p className="border-t px-6 py-4 text-xs text-muted-foreground">Manufactura sostenible</p>
      </aside>
      <div className="lg:pl-60">
        <header className="border-b bg-background">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Abrir menú"
                    className="size-10 lg:hidden"
                  >
                    <Menu aria-hidden />
                  </Button>
                </DialogTrigger>
                <DialogContent className="!inset-y-0 !left-0 !top-0 !max-h-svh !w-72 !max-w-[90vw] !translate-x-0 !translate-y-0 content-start overflow-y-auto !rounded-none">
                  <DialogTitle>EcoSoap ERP</DialogTitle>
                  <DialogDescription>Navegación por módulos</DialogDescription>
                  <Navigation role={user.role} onNavigate={() => setMobileOpen(false)} />
                </DialogContent>
              </Dialog>
              <p className="truncate text-sm font-medium">
                {trail.map((part, index) => (
                  <span
                    key={part}
                    className={index < trail.length - 1 ? 'text-muted-foreground' : undefined}
                  >
                    {index > 0 && (
                      <span aria-hidden className="mx-2">
                        /
                      </span>
                    )}
                    {part}
                  </span>
                ))}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-2 text-right">
                <p className="text-sm font-medium">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
              <Button asChild variant="ghost" size="icon" title="Cambiar contraseña">
                <Link to="/account/password" aria-label="Cambiar contraseña">
                  <KeyRound aria-hidden />
                </Link>
              </Button>
              <SessionActions />
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] min-w-0 px-4 py-6 outline-none sm:px-6 sm:py-8 xl:px-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
