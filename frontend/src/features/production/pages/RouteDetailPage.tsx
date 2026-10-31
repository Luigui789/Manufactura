import { useState } from 'react';

import { Link, useParams } from 'react-router';

import { Button } from '@/components/ui/button';

import { LoadingState, PageHeader, StatusBadge, FormSection } from '@/components/erp';

import { ErrorNotice } from '@/components/ErrorNotice';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useSession } from '@/features/auth/hooks/use-auth';

import {
  useProductionRoute,
  useUpdateProductionRoute,
  useSetProductionRouteStatus,
  useReplaceRouteOperations,
} from '../api/routes';

import { RouteMetadataForm, RouteOperationsForm } from '../components/RouteForm';

import { formatStandardMinutes } from '../route-schemas';

export function RouteDetailPage() {
  const { id = '' } = useParams();
  const query = useProductionRoute(id);
  const update = useUpdateProductionRoute(id);
  const status = useSetProductionRouteStatus(id);
  const operations = useReplaceRouteOperations(id);

  const [editing, setEditing] = useState(false);
  const [editingOps, setEditingOps] = useState(false);

  const session = useSession();
  const manage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';

  if (query.isPending) return <LoadingState label="Cargando ruta…" />;

  if (!query.data)
    return (
      <div className="space-y-4">
        <ErrorNotice error={query.error} />
        <Button onClick={() => void query.refetch()}>Reintentar</Button>
        <Link to="/production/routes">Volver a rutas</Link>
      </div>
    );

  const route = query.data;

  return (
    <section className="space-y-6">
      <PageHeader
        title={route.name}
        description={route.code}
        breadcrumbs={[
          { label: 'Producción' },
          { label: 'Rutas', to: '/production/routes' },
          { label: route.code },
        ]}
        actions={
          <Button asChild variant="outline">
            <Link to="/production/routes">Volver a rutas</Link>
          </Button>
        }
      />

      <ErrorNotice error={query.error} />
      <FormSection title="Configuración">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={route.isActive} />
          <span>
            {route.product.code} · {route.product.name}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-muted-foreground">
          {route.description || 'Sin descripción'}
        </p>
        <p>
          Tiempo estándar total:{' '}
          <strong>{formatStandardMinutes(route.totalStandardMinutes)}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          {route.operationCount} operaciones estándar. Esta ruta no registra ejecución real.
        </p>

        {manage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)}>
              Editar datos
            </Button>
            <Button
              variant="outline"
              disabled={status.isPending}
              onClick={() => status.mutate({ isActive: !route.isActive })}
            >
              {status.isPending ? 'Actualizando…' : route.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        )}
        <ErrorNotice error={status.error} />

        {manage && editing && (
          <RouteMetadataForm
            key={route.code + route.name + route.description}
            route={route}
            pending={update.isPending}
            error={update.error}
            onCancel={() => setEditing(false)}
            onSubmit={(value) => update.mutate(value, { onSuccess: () => setEditing(false) })}
          />
        )}
      </FormSection>

      <FormSection title="Operaciones">
        <div className="flex flex-wrap gap-2">
          {manage && (
            <Button variant="outline" onClick={() => setEditingOps(!editingOps)}>
              Editar operaciones
            </Button>
          )}
        </div>

        {manage && editingOps ? (
          <RouteOperationsForm
            route={route}
            pending={operations.isPending}
            error={operations.error}
            onCancel={() => setEditingOps(false)}
            onSubmit={(value) =>
              operations.mutate(value, { onSuccess: () => setEditingOps(false) })
            }
          />
        ) : (
          <Table aria-label="Operaciones de la ruta">
            <TableHeader>
              <TableRow>
                <TableHead>Secuencia</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Tiempo estándar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...route.operations]
                .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
                .map((op) => (
                  <TableRow key={op.id}>
                    <TableCell>{op.sequence}</TableCell>
                    <TableCell>{op.name}</TableCell>
                    <TableCell className="whitespace-normal">{op.description || '—'}</TableCell>
                    <TableCell>{formatStandardMinutes(op.standardMinutes)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </FormSection>
    </section>
  );
}
