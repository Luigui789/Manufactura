import { Link, useNavigate } from 'react-router';

import { PageHeader } from '@/components/erp';

import { Button } from '@/components/ui/button';

import { RouteForm } from '../components/RouteForm';

import { useCreateProductionRoute } from '../api/routes';

export function NewRoutePage() {
  const mutation = useCreateProductionRoute();
  const navigate = useNavigate();

  return (
    <section className="space-y-6">
      <PageHeader
        title="Crear ruta de producción"
        description="Define operaciones estándar; no ejecuta una orden de producción."
        breadcrumbs={[
          { label: 'Producción' },
          { label: 'Rutas', to: '/production/routes' },
          { label: 'Crear' },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link to="/production/routes">Volver a rutas</Link>
          </Button>
        }
      />
      <RouteForm
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(value) =>
          mutation.mutate(value, {
            onSuccess: (route) => void navigate('/production/routes/' + route.id),
          })
        }
      />
    </section>
  );
}
