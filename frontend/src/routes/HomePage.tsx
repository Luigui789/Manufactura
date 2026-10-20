import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS } from '@/features/auth/types';
import { navigation } from '@/layouts/navigation';
export function HomePage() {
  const { data: user } = useSession();
  return (
    <section className="space-y-8">
      <PageHeader
        title={`Bienvenido, ${user?.fullName}`}
        description={`Tu espacio de trabajo · ${user ? ROLE_LABELS[user.role] : ''}`}
      />
      <section className="surface space-y-5">
        <div>
          <h2 className="text-lg font-semibold">El flujo de EcoSoap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Del abastecimiento al lote terminado, con un origen que se puede consultar.
          </p>
        </div>
        <ol className="grid gap-4 md:grid-cols-4">
          {[
            ['Compras', 'Ordená insumos y registrá lo que recibís.'],
            ['Inventario', 'Consultá existencias, movimientos y lotes.'],
            ['Producción', 'Definí fórmulas y ejecutá las órdenes.'],
            ['Calidad', 'Inspeccioná los lotes pendientes y consultá su trazabilidad.'],
          ].map(([name, description], index) => (
            <li key={name} className="border-l-2 border-foreground/15 pl-4">
              <p className="mb-2 text-xs text-muted-foreground">0{index + 1}</p>
              <h3 className="font-medium">{name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </section>
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
