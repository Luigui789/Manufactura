import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  DetailGrid,
  EmptyState,
  FormSection,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSession } from '@/features/auth/hooks/use-auth';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import {
  CARBON_CATEGORIES,
  type CarbonActivity,
  type CircularMetric,
  type Footprint,
  useCreateFootprint,
  useDeleteManualActivity,
  useFootprint,
  useOrderSummary,
  useSyncFootprint,
} from '../api/sustainability';
import { CarbonDisclaimer } from '../components/CarbonDisclaimer';
import { FinalizeFootprint } from '../components/FinalizeFootprint';
import { ManualActivityForm } from '../components/ManualActivityForm';
import {
  CATEGORY_LABELS,
  FOOTPRINT_STATUS_LABELS,
  kg,
  quantity,
  trimDecimal,
  UNIT_SYMBOLS,
} from '../labels';

const CIRCULARITY_NOTICE =
  'Este indicador se presenta por separado y no se descuenta automáticamente de la huella de carbono.';

function FactorCell({ activity }: { activity: CarbonActivity }) {
  return (
    <>
      <TableCell className="whitespace-normal">
        {activity.factorCodeSnapshot} · {trimDecimal(activity.factorValueSnapshot)} kg CO₂e/
        {UNIT_SYMBOLS[activity.activityUnit]}
      </TableCell>
      <TableCell className="max-w-xs whitespace-normal text-sm">
        {activity.factorSourceNameSnapshot}
        {activity.factorSourceYearSnapshot ? ` (${activity.factorSourceYearSnapshot})` : ''}
        <span className="block break-words text-muted-foreground">
          {activity.factorSourceReferenceSnapshot}
        </span>
      </TableCell>
    </>
  );
}

function Circularity({ metrics }: { metrics: CircularMetric[] }) {
  return (
    <FormSection title="8. Circularidad" description={CIRCULARITY_NOTICE}>
      {metrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          La orden no consumió materiales configurados como circulares.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {metrics.map((metric) => (
            <li key={metric.profileId} className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{metric.displayName}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {quantity(metric.quantity, metric.reportingUnit)}
              </p>
              <p className="text-xs text-muted-foreground">
                {metric.productCode} · {quantity(metric.consumedQuantity, metric.consumedUnit)}{' '}
                consumidos según el ledger
              </p>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

function FootprintSections({
  footprint,
  canManage,
  isAdmin,
}: {
  footprint: Footprint;
  canManage: boolean;
  isAdmin: boolean;
}) {
  const orderId = footprint.productionOrderId;
  const draft = footprint.status === 'DRAFT';
  const editable = draft && canManage;
  const sync = useSyncFootprint(orderId);
  const remove = useDeleteManualActivity(orderId);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const automatic = footprint.activities.filter((a) => a.source === 'PRODUCTION_CONSUMPTION');
  const manual = footprint.activities.filter((a) => a.source === 'MANUAL');
  const unit = PRODUCT_UNIT_LABELS[footprint.outputUnit].toLowerCase();
  const total = footprint.totalKgCo2e ?? footprint.totalKgCo2ePreview;
  const intensity = footprint.kgCo2ePerOutputUnit ?? footprint.kgCo2ePerOutputUnitPreview;
  return (
    <>
      <FormSection
        title="2. Materias primas automáticas"
        description="Derivadas de los movimientos PRODUCTION_CONSUMPTION reales de la orden, no de la fórmula."
      >
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? 'Sincronizando…' : 'Sincronizar con consumos reales'}
            </Button>
            <ErrorNotice error={sync.error} />
          </div>
        )}
        {automatic.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividades automáticas calculadas.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Materias primas automáticas">
              <TableHeader>
                <TableRow>
                  {[
                    'Producto',
                    'Cantidad original',
                    'Cantidad normalizada',
                    'Factor',
                    'Fuente',
                    'kg CO₂e',
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {automatic.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="whitespace-normal">
                      {activity.inventoryMovement
                        ? `${activity.inventoryMovement.product.code} · ${activity.inventoryMovement.product.name}`
                        : activity.description}
                      {activity.inventoryMovement?.lot && (
                        <span className="block text-xs text-muted-foreground">
                          Lote {activity.inventoryMovement.lot.code}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {activity.originalQuantity && activity.originalUnit
                        ? quantity(activity.originalQuantity, activity.originalUnit)
                        : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {quantity(activity.activityQuantity, activity.activityUnit)}
                    </TableCell>
                    <FactorCell activity={activity} />
                    <TableCell className="tabular-nums">{kg(activity.emissionsKgCo2e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </FormSection>

      <FormSection title="3. Factores faltantes">
        {footprint.missingFactors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos los consumos reales tienen un factor aplicado.
          </p>
        ) : (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-4"
          >
            <p className="font-medium">
              Faltan factores para calcular la huella completa del alcance seleccionado
            </p>
            <ul className="space-y-2 text-sm">
              {footprint.missingFactors.map((missing) => (
                <li key={missing.productId} className="flex flex-wrap items-center gap-3">
                  <span>
                    {missing.code} · {missing.name} —{' '}
                    {quantity(missing.consumedQuantity, missing.unit)} consumidos
                  </span>
                  {isAdmin && (
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to={`/sustainability/emission-factors?${new URLSearchParams({
                          productId: missing.productId,
                          product: `${missing.code} · ${missing.name} (${UNIT_SYMBOLS[missing.unit]})`,
                        }).toString()}`}
                      >
                        Configurar factor
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Solo Administración puede configurar factores de emisión.
              </p>
            )}
          </div>
        )}
      </FormSection>

      <FormSection
        title="4. Actividades manuales"
        description="Energía, transporte de entrada, empaque y residuos registrados con un factor documentado."
      >
        {manual.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay actividades manuales.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Actividades manuales">
              <TableHeader>
                <TableRow>
                  {[
                    'Categoría',
                    'Descripción',
                    'Cantidad',
                    'Factor',
                    'Fuente',
                    'kg CO₂e',
                    ...(editable ? ['Acciones'] : []),
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {manual.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell>{CATEGORY_LABELS[activity.category]}</TableCell>
                    <TableCell className="whitespace-normal">{activity.description}</TableCell>
                    <TableCell className="tabular-nums">
                      {quantity(activity.activityQuantity, activity.activityUnit)}
                    </TableCell>
                    <FactorCell activity={activity} />
                    <TableCell className="tabular-nums">{kg(activity.emissionsKgCo2e)}</TableCell>
                    {editable && (
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" onClick={() => setEditing(activity.id)}>
                            Editar
                          </Button>
                          {confirmDelete === activity.id ? (
                            <>
                              <Button
                                variant="destructive"
                                disabled={remove.isPending}
                                onClick={() =>
                                  remove.mutate(activity.id, {
                                    onSettled: () => setConfirmDelete(null),
                                  })
                                }
                              >
                                Confirmar eliminación
                              </Button>
                              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                                Volver
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" onClick={() => setConfirmDelete(activity.id)}>
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <ErrorNotice error={remove.error} />
        {editable && editing && (
          <ManualActivityForm
            key={editing}
            orderId={orderId}
            activity={manual.find((a) => a.id === editing)}
            onDone={() => setEditing(null)}
          />
        )}
        {editable && !editing && <ManualActivityForm orderId={orderId} onDone={() => undefined} />}
      </FormSection>

      <FormSection title="5. Huella por categoría">
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Huella por categoría">
          {CARBON_CATEGORIES.map((category) => (
            <li key={category} className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{CATEGORY_LABELS[category]}</p>
              <p className="text-lg font-semibold tabular-nums">
                {kg(footprint.totalsByCategory[category])}
              </p>
            </li>
          ))}
        </ul>
      </FormSection>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Resultado">
        <div className="rounded-lg border p-5">
          <h2 className="text-sm text-muted-foreground">6. Huella parcial total</h2>
          <p className="text-3xl font-semibold tabular-nums">{kg(total)}</p>
          {draft && <p className="text-xs text-muted-foreground">Vista previa de borrador</p>}
        </div>
        <div className="rounded-lg border p-5">
          <h2 className="text-sm text-muted-foreground">7. Intensidad por unidad</h2>
          <p className="text-3xl font-semibold tabular-nums">
            {kg(intensity)} / {unit}
          </p>
          <p className="text-xs text-muted-foreground">
            {trimDecimal(footprint.quantityProduced, 0)} {unit}(es) producidas
          </p>
        </div>
      </section>

      <Circularity metrics={footprint.circularity} />

      <FormSection title="9. Finalización">
        {draft ? (
          canManage ? (
            <FinalizeFootprint footprint={footprint} unitLabel={unit} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Borrador pendiente de finalización por Producción o Administración.
            </p>
          )
        ) : (
          <div className="space-y-2">
            <p role="status" className="font-medium">
              Huella finalizada e inmutable.
            </p>
            <DetailGrid>
              <div>
                <dt>Finalizada por</dt>
                <dd>{footprint.finalizedBy?.fullName ?? '—'}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>
                  {footprint.finalizedAt
                    ? new Date(footprint.finalizedAt).toLocaleString('es-NI', {
                        timeZone: 'America/Managua',
                      })
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Límites del sistema</dt>
                <dd className="whitespace-pre-wrap">{footprint.boundaryNotes}</dd>
              </div>
            </DetailGrid>
          </div>
        )}
      </FormSection>
    </>
  );
}

export function FootprintDetailPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const role = session.data?.role;
  const canManage = role === 'ADMIN' || role === 'PRODUCCION';
  const summary = useOrderSummary(id);
  const footprint = useFootprint(id);
  const create = useCreateFootprint(id);
  const order = summary.data;
  const current = footprint.data;
  return (
    <section className="space-y-6">
      {(summary.isPending || footprint.isPending) && <LoadingState label="Cargando huella…" />}
      <ErrorNotice error={summary.error ?? footprint.error} />
      {(summary.isError || footprint.isError) && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void summary.refetch();
              void footprint.refetch();
            }}
          >
            Reintentar
          </Button>
          <Button asChild variant="ghost">
            <Link to="/sustainability">Volver a sostenibilidad</Link>
          </Button>
        </div>
      )}
      {order && footprint.isSuccess && (
        <>
          <PageHeader
            title={`Huella de carbono · ${order.number}`}
            description={`${order.product.code} · ${order.product.name}`}
            breadcrumbs={[
              { label: 'Análisis' },
              { label: 'Sostenibilidad', to: '/sustainability' },
              { label: order.number },
            ]}
            status={
              current ? (
                <StatusBadge status={current.status} />
              ) : (
                <span className="status-badge status-neutral">{FOOTPRINT_STATUS_LABELS.NONE}</span>
              )
            }
            actions={
              <Button asChild variant="outline">
                <Link to={`/production/orders/${order.id}`}>Ver orden de producción</Link>
              </Button>
            }
          />
          <FormSection title="1. Aviso metodológico">
            <CarbonDisclaimer />
            <DetailGrid>
              <div>
                <dt>Orden de producción</dt>
                <dd>{order.number}</dd>
              </div>
              <div>
                <dt>Producto</dt>
                <dd>
                  {order.product.code} · {order.product.name}
                </dd>
              </div>
              <div>
                <dt>Lote</dt>
                <dd>{order.lot?.code ?? '—'}</dd>
              </div>
              <div>
                <dt>Cantidad producida</dt>
                <dd className="tabular-nums">
                  {trimDecimal(current?.quantityProduced ?? order.quantityProduced, 0)}
                </dd>
              </div>
              <div>
                <dt>Unidad</dt>
                <dd>{PRODUCT_UNIT_LABELS[current?.outputUnit ?? order.product.unit]}</dd>
              </div>
              <div>
                <dt>Estado de huella</dt>
                <dd>{FOOTPRINT_STATUS_LABELS[current?.status ?? 'NONE']}</dd>
              </div>
              <div>
                <dt>Alcance</dt>
                <dd>Parcial de la cuna a la puerta (PARTIAL_CRADLE_TO_GATE)</dd>
              </div>
            </DetailGrid>
          </FormSection>
          {current ? (
            <FootprintSections
              footprint={current}
              canManage={canManage}
              isAdmin={role === 'ADMIN'}
            />
          ) : (
            <>
              <EmptyState
                title="Sin calcular"
                description={
                  order.canCreateFootprint
                    ? 'La huella se crea como borrador desde los consumos reales registrados por Producción.'
                    : 'Solo las órdenes completadas con lote y cantidad producida pueden tener huella.'
                }
                action={
                  canManage &&
                  order.canCreateFootprint && (
                    <Button disabled={create.isPending} onClick={() => create.mutate()}>
                      {create.isPending ? 'Calculando…' : 'Calcular huella (borrador)'}
                    </Button>
                  )
                }
              />
              <ErrorNotice error={create.error} />
              <Circularity metrics={order.circularity} />
            </>
          )}
        </>
      )}
    </section>
  );
}
