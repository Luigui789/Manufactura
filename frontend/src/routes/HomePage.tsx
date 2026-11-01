import { Link } from 'react-router';
import { PageHeader } from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS } from '@/features/auth/types';
import { HomeDashboard } from '@/features/home/HomeDashboard';
import { navigation } from '@/layouts/navigation';
export function HomePage() {
  const { data: user } = useSession();
  // Same role filter as the sidebar: the shortcuts never expose a route the menu hides.
  const allowed = user
    ? navigation.filter((item) => item.to !== '/' && item.roles.includes(user.role))
    : [];
  const groups = [...new Set(allowed.map((item) => item.module ?? item.group))];
  return (
    <section className="space-y-8">
      <PageHeader
        title={`Bienvenido, ${user?.fullName}`}
        description={`Resumen operativo de EcoSoap · ${user ? ROLE_LABELS[user.role] : ''}`}
      />
      <HomeDashboard />
      <section aria-labelledby="home-shortcuts" className="space-y-3">
        <h2 id="home-shortcuts" className="text-lg font-semibold">
          Accesos rápidos
        </h2>
        <div className="grid gap-x-6 gap-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group} className="min-w-0">
              <h3 className="text-sm font-semibold">{group}</h3>
              <ul className="mt-1">
                {allowed
                  .filter((item) => (item.module ?? item.group) === group)
                  .map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className="inline-flex min-h-8 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {/* Distinct from the sidebar link that shares the visible label. */}
                        <span className="sr-only">
                          {item.module ? `Abrir ${item.module} ·` : 'Abrir'}
                        </span>{' '}
                        {item.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
