import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS } from '@/features/auth/types';
import { HomeDashboard } from '@/features/home/HomeDashboard';
import { navigation } from '@/layouts/navigation';
export function HomePage() {
  const { data: user } = useSession();
  return (
    <section className="space-y-8">
      <PageHeader
        title={`Bienvenido, ${user?.fullName}`}
        description={`Resumen operativo de EcoSoap · ${user ? ROLE_LABELS[user.role] : ''}`}
      />
      <HomeDashboard />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Accesos de tu cuenta</h2>
        <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {user &&
            navigation
              .filter((item) => item.to !== '/' && item.roles.includes(user.role))
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 border-b py-4 text-sm hover:underline"
                >
                  <Icon aria-hidden className="size-4 text-muted-foreground" />
                  <span className="flex-1">Abrir {label.toLowerCase()}</span>
                  <ArrowUpRight aria-hidden className="size-4" />
                </Link>
              ))}
        </div>
      </section>
    </section>
  );
}
