import { useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  DetailGrid,
  EmptyState,
  FormSection,
  LoadingState,
  PageHeader,
  StatusBadge,
  SuccessNotice,
} from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { useCancelOrder, useOrder, useOrderRequirements, useUpdateOrder } from '../api/orders';
import { OrderForm } from '../components/OrderForm';
import { OrderExecution } from '../components/OrderExecution';
import { LotProductionDetail } from '../components/LotProductionDetail';
import { quantityUnits } from '../execution-schema';
import { formatPlanningDate, planningInputValue } from '../planning-dates';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const session = useSession();
  const order = useOrder(id);
  const requirements = useOrderRequirements(id);
  const update = useUpdateOrder(id, order.data);
  const cancel = useCancelOrder(id);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState('');
  const cancelling = useRef(false);
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const current = order.data;
  const routeNotice = (location.state as { notice?: unknown } | null)?.notice;
  const success = notice || (typeof routeNotice === 'string' ? routeNotice : '');
  // Only display availability corresponding to this exact persisted order revision.
  const availability =
    requirements.data?.updatedAt === current?.updatedAt ? requirements.data : undefined;
  return (
    <section className="space-y-6">
      {order.isPending && <LoadingState label="Cargando orden…" />}
      <ErrorNotice error={order.error} />
      {order.isError && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void order.refetch()}>
            Reintentar orden
          </Button>
          <Button asChild variant="ghost">
            <Link to="/production/orders">Volver a órdenes</Link>
          </Button>
        </div>
      )}
      {current && (
        <>
          <PageHeader
            title={'Orden de producción ' + current.number}
            description={
              current.product.code +
              ' · ' +
              current.product.name +
              ' · ' +
              current.quantityPlanned +
              ' ' +
              PRODUCT_UNIT_LABELS[current.product.unit]
            }
            breadcrumbs={[
              { label: 'Producción', to: '/production/orders' },
              { label: 'Órdenes', to: '/production/orders' },
              { label: current.number },
            ]}
            status={<StatusBadge status={current.status} />}
            actions={
              canManage && current.status === 'DRAFT' && !editing && !confirmCancel ? (
                <>
                  <Button
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => {
                      setNotice('');
                      setEditing(true);
                    }}
                  >
                    Editar borrador
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={update.isPending || cancel.isPending}
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancelar orden
                  </Button>
                </>
              ) : current.status === 'IN_PROGRESS' || current.status === 'COMPLETED' ? (
                <Button asChild variant="outline">
                  <Link to={'/production/orders/' + current.id + '/iiot'}>Monitoreo IIoT</Link>
                </Button>
              ) : undefined
            }
          />
          {success && <SuccessNotice>{success}</SuccessNotice>}
          <FormSection title="Resumen de la orden">
            <DetailGrid>
              <div>
                <dt>Producto fabricado</dt>
                <dd>
                  {current.product.code} · {current.product.name}
                </dd>
              </div>
              <div>
                <dt>Cantidad planificada</dt>
                <dd className="tabular-nums">
                  {current.quantityPlanned} {PRODUCT_UNIT_LABELS[current.product.unit]}
                </dd>
              </div>
              <div>
                <dt>Fórmula guardada en la orden</dt>
                <dd>
                  <Link
                    className="underline underline-offset-4"
                    to={'/production/boms/' + current.bomVersion.bom.id}
                  >
                    {current.bomVersion.bom.name}
                  </Link>{' '}
                  · v{current.bomVersion.version}
                </dd>
              </div>
              <div>
                <dt>Almacén</dt>
                <dd>
                  {current.warehouse.code} · {current.warehouse.name}
                </dd>
              </div>
              <div>
                <dt>Inicio planificado · Managua</dt>
                <dd>{formatPlanningDate(current.plannedStartAt)}</dd>
              </div>
              <div>
                <dt>Fin planificado · Managua</dt>
                <dd>{formatPlanningDate(current.plannedEndAt)}</dd>
              </div>
            </DetailGrid>
          </FormSection>
          {canManage && current.status === 'DRAFT' && editing && (
            <FormSection
              title="Editar borrador"
              description="La orden conservará la versión de fórmula guardada salvo que selecciones otra. Guardar no reserva ni consume materiales."
            >
              <OrderForm
                initial={{
                  productId: current.productId,
                  bomVersionId: current.bomVersionId,
                  warehouseId: current.warehouseId,
                  quantityPlanned: current.quantityPlanned,
                  plannedStartAt: planningInputValue(current.plannedStartAt),
                  plannedEndAt: planningInputValue(current.plannedEndAt),
                }}
                selectionSummary={{
                  bom:
                    current.bomVersion.bom.name +
                    ' · ' +
                    current.product.name +
                    ' · v' +
                    current.bomVersion.version,
                  warehouse: current.warehouse.code + ' · ' + current.warehouse.name,
                }}
                pending={update.isPending || cancel.isPending}
                error={update.error}
                onClose={() => setEditing(false)}
                onSubmit={(value) =>
                  update.mutate(value, {
                    onSuccess: () => {
                      setEditing(false);
                      setNotice('Borrador actualizado. Revisá la disponibilidad antes de iniciar.');
                    },
                  })
                }
              />
            </FormSection>
          )}
          {canManage && current.status === 'DRAFT' && confirmCancel && (
            <section
              className="space-y-3 rounded-md border border-destructive/25 bg-destructive/5 p-4"
              aria-labelledby="cancel-production-title"
            >
              <h2 id="cancel-production-title" className="font-semibold">
                Cancelar {current.number}
              </h2>
              <p className="text-sm">
                Este borrador quedará cancelado y no podrá iniciarse ni completarse. La cancelación
                no genera movimientos ni cambia las existencias.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  disabled={cancel.isPending || update.isPending}
                  onClick={() => {
                    if (cancel.isPending || update.isPending || cancelling.current) return;
                    cancelling.current = true;
                    cancel.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmCancel(false);
                        setEditing(false);
                        setNotice('Orden cancelada. Las existencias no cambiaron.');
                      },
                      onSettled: () => {
                        cancelling.current = false;
                      },
                    });
                  }}
                >
                  {cancel.isPending ? 'Cancelando…' : 'Confirmar cancelación'}
                </Button>
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => setConfirmCancel(false)}
                >
                  Conservar borrador
                </Button>
              </div>
              <ErrorNotice error={cancel.error} />
            </section>
          )}
          {!confirmCancel && <ErrorNotice error={cancel.error} />}
          <div className="rounded-md border bg-muted/25 px-4 py-3">
            <h2 className="text-sm font-semibold">Siguiente paso</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.status === 'DRAFT'
                ? editing
                  ? 'Guardá los cambios del borrador y revisá nuevamente los materiales.'
                  : canManage
                    ? availability?.canStart
                      ? 'Los materiales están disponibles. Revisá el plan e iniciá la producción cuando corresponda.'
                      : 'Revisá los requerimientos, los faltantes o las restricciones antes de iniciar la producción.'
                    : 'Consultá el plan y la disponibilidad. Producción o Administración pueden iniciar esta orden.'
                : current.status === 'IN_PROGRESS'
                  ? canManage
                    ? 'Asigná los lotes requeridos y registrá la cantidad real para completar la producción.'
                    : 'La producción está en curso. Podés consultar el plan y los materiales.'
                  : current.status === 'COMPLETED'
                    ? current.lot?.status === 'QUARANTINED'
                      ? 'El lote fabricado está en cuarentena. Consultá o registrá la inspección en Calidad.'
                      : 'Consultá el lote fabricado, su calidad y el origen de los materiales.'
                    : 'La orden fue cancelada. Podés consultar su plan y crear otra orden si necesitás fabricar el producto.'}
            </p>
          </div>
          {canManage && !editing && !confirmCancel && availability && (
            <OrderExecution
              key={current.id + ':' + current.updatedAt}
              order={current}
              requirements={availability}
            />
          )}
          <FormSection
            title="Requerimientos y disponibilidad"
            description="Consulta informativa: no reserva ni consume materiales. La disponibilidad puede cambiar y se valida nuevamente al iniciar y al completar."
          >
            <Button
              variant="outline"
              disabled={requirements.isFetching}
              onClick={() => void Promise.all([order.refetch(), requirements.refetch()])}
            >
              Actualizar disponibilidad
            </Button>
            {requirements.isFetching && <LoadingState label="Consultando disponibilidad…" />}
            <ErrorNotice error={requirements.error} />
            {!requirements.isError && requirements.data && !availability && (
              <p role="status" className="text-sm">
                La orden cambió; actualizá la disponibilidad.
              </p>
            )}
            {availability && (
              <>
                <p className="text-sm font-medium">
                  {availability.canStart
                    ? 'Materiales disponibles para la cantidad planificada.'
                    : 'La orden presenta faltantes o restricciones.'}
                </p>
                {availability.eligibilityIssues.length > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    {availability.eligibilityIssues.map((issue) => (
                      <p key={issue} role="alert" className="flex items-start gap-2 text-sm">
                        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {issue}
                      </p>
                    ))}
                  </div>
                )}
                {availability.items.length === 0 ? (
                  <EmptyState
                    title="No hay componentes."
                    description="La versión guardada en esta orden no tiene componentes en la consulta de requerimientos."
                  />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table>
                      <caption className="sr-only">
                        Consumo requerido y existencia disponible en el almacén de la orden
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Componente</th>
                          <th scope="col">Unidad</th>
                          <th scope="col" className="text-right">
                            Requerido
                          </th>
                          <th scope="col" className="text-right">
                            Consumible
                          </th>
                          <th scope="col" className="text-right">
                            Faltante
                          </th>
                          <th scope="col">Disponibilidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availability.items.map((item) => {
                          const shortage = quantityUnits(item.shortage) > 0n;
                          const Icon = shortage ? CircleAlert : CheckCircle2;
                          return (
                            <tr key={item.product.id}>
                              <td>
                                <span className="text-xs text-muted-foreground">
                                  {item.product.code}
                                </span>
                                <p className="font-medium">{item.product.name}</p>
                              </td>
                              <td>{PRODUCT_UNIT_LABELS[item.product.unit]}</td>
                              <td className="text-right tabular-nums">{item.required}</td>
                              <td className="text-right tabular-nums">{item.available}</td>
                              <td className="text-right tabular-nums">{item.shortage}</td>
                              <td>
                                <span
                                  className={
                                    'inline-flex items-center gap-1.5 text-xs font-medium ' +
                                    (shortage ? 'text-amber-800' : 'text-foreground')
                                  }
                                >
                                  <Icon aria-hidden className="size-3.5" />
                                  {shortage ? 'Insuficiente' : 'Disponible'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Consumible incluye únicamente la existencia válida para producción. Los materiales
                  trazables requieren lotes liberados del almacén de esta orden.
                </p>
              </>
            )}
          </FormSection>

          {current.status === 'COMPLETED' && (
            <>
              <FormSection
                title="Resultado de producción"
                description="Se registró el consumo de materiales según el plan y la salida con la cantidad real fabricada."
              >
                <DetailGrid>
                  <div>
                    <dt>Cantidad producida real</dt>
                    <dd className="tabular-nums">
                      {current.quantityProduced} {PRODUCT_UNIT_LABELS[current.product.unit]}
                    </dd>
                  </div>
                  <div>
                    <dt>Lote fabricado</dt>
                    <dd>
                      <Link
                        className="font-medium underline underline-offset-4"
                        to={
                          current.lot
                            ? '/inventory/lots?lotId=' + current.lot.id
                            : '/inventory/lots'
                        }
                      >
                        {current.lot?.code ?? 'Consultar lotes'}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Estado del lote</dt>
                    <dd>
                      {current.lot ? (
                        <StatusBadge status={current.lot.status} />
                      ) : (
                        'Sin lote disponible'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Completada · Managua</dt>
                    <dd>{formatPlanningDate(current.completedAt)}</dd>
                  </div>
                </DetailGrid>
              </FormSection>
              {current.lot && (
                <LotProductionDetail
                  lotId={current.lot.id}
                  status={current.lot.status}
                  productionOrderId={current.id}
                />
              )}
            </>
          )}
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm font-medium">Datos de registro</summary>
            <div className="pt-4">
              <DetailGrid>
                <div>
                  <dt>Creada · Managua</dt>
                  <dd>{formatPlanningDate(current.createdAt)}</dd>
                </div>
                <div>
                  <dt>Última actualización · Managua</dt>
                  <dd>{formatPlanningDate(current.updatedAt)}</dd>
                </div>
                {current.startedAt && (
                  <div>
                    <dt>Inicio real · Managua</dt>
                    <dd>{formatPlanningDate(current.startedAt)}</dd>
                  </div>
                )}
              </DetailGrid>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
