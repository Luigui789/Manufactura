import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import {
  ORDER_STATUS,
  useCancelOrder,
  useOrder,
  useOrderRequirements,
  useUpdateOrder,
} from '../api/orders';
import { OrderForm } from '../components/OrderForm';
import { OrderExecution } from '../components/OrderExecution';
import { LotProductionDetail } from '../components/LotProductionDetail';
import { formatPlanningDate, planningInputValue } from '../planning-dates';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const order = useOrder(id);
  const requirements = useOrderRequirements(id);
  const update = useUpdateOrder(id, order.data);
  const cancel = useCancelOrder(id);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  const current = order.data;
  // Ignore requirements that belong to a previous draft revision.
  const availability =
    requirements.data?.updatedAt === current?.updatedAt ? requirements.data : undefined;
  return (
    <section className="space-y-5">
      <Link to="/production/orders" className="underline">
        Volver a órdenes
      </Link>
      {order.isPending && <p role="status">Cargando orden…</p>}
      <ErrorNotice error={order.error} />
      {order.isError && (
        <Button variant="outline" onClick={() => void order.refetch()}>
          Reintentar orden
        </Button>
      )}
      {current && (
        <>
          <h1 className="text-2xl font-semibold">{current.number}</h1>
          <p>
            {ORDER_STATUS[current.status]} · {current.product.code} · {current.product.name}
          </p>
          <p>
            Cantidad planificada: {current.quantityPlanned} {current.product.unit} · BOM v
            {current.bomVersion.version}
          </p>
          <p>
            Almacén: {current.warehouse.code} · {current.warehouse.name}
          </p>
          <p>
            Inicio: {formatPlanningDate(current.plannedStartAt)} · Fin:{' '}
            {formatPlanningDate(current.plannedEndAt)} (Managua)
          </p>
          {canManage && current.status === 'DRAFT' && (
            <>
              {!editing && (
                <Button disabled={cancel.isPending} onClick={() => setEditing(true)}>
                  Editar borrador
                </Button>
              )}
              {editing && (
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
                  onSubmit={(value) => update.mutate(value, { onSuccess: () => setEditing(false) })}
                />
              )}
              {!editing && !confirmCancel && (
                <Button
                  variant="outline"
                  disabled={update.isPending || cancel.isPending}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancelar orden
                </Button>
              )}
              {confirmCancel && (
                <div className="rounded border p-4 space-y-3">
                  <p>La orden quedará cancelada. Confirmá para continuar.</p>
                  <Button
                    disabled={cancel.isPending || update.isPending}
                    onClick={() =>
                      cancel.mutate(undefined, {
                        onSuccess: () => {
                          setConfirmCancel(false);
                          setEditing(false);
                        },
                      })
                    }
                  >
                    Confirmar cancelación
                  </Button>
                  <Button
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Conservar borrador
                  </Button>
                </div>
              )}
            </>
          )}
          <ErrorNotice error={cancel.error} />
          {canManage && !editing && !confirmCancel && availability && (
            <OrderExecution
              key={`${current.id}:${current.updatedAt}`}
              order={current}
              requirements={availability}
            />
          )}
          {current.status === 'COMPLETED' && (
            <div className="space-y-3">
              <p>
                Cantidad producida: {current.quantityProduced} · Lote:{' '}
                <Link className="underline" to={`/inventory/lots?lotId=${current.lot?.id ?? ''}`}>
                  {current.lot?.code ?? 'Consultar lotes'}
                </Link>
                {' · '}
                {current.lot?.status}
              </p>
              <p>Completada: {formatPlanningDate(current.completedAt)} (Managua)</p>
              {current.lot && (
                <LotProductionDetail lotId={current.lot.id} status={current.lot.status} />
              )}
            </div>
          )}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Requerimientos y disponibilidad</h2>
            <p>
              Consulta informativa: no reserva ni consume materiales. La disponibilidad puede
              cambiar.
            </p>
            <Button
              variant="outline"
              disabled={requirements.isFetching}
              onClick={() => void Promise.all([order.refetch(), requirements.refetch()])}
            >
              Actualizar disponibilidad
            </Button>
            {requirements.isFetching && <p role="status">Consultando disponibilidad…</p>}
            <ErrorNotice error={requirements.error} />
            {!requirements.isError && requirements.data && !availability && (
              <p>La orden cambió; actualizá la disponibilidad.</p>
            )}
            {availability && (
              <>
                <p>
                  {availability.canStart
                    ? 'Materiales disponibles para la cantidad planificada.'
                    : 'La orden presenta faltantes o restricciones.'}
                </p>
                {availability.eligibilityIssues.map((issue) => (
                  <p key={issue} role="alert">
                    {issue}
                  </p>
                ))}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>Componente</th>
                        <th>Unidad</th>
                        <th>Requerido</th>
                        <th>Consumible</th>
                        <th>Faltante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availability.items.map((item) => (
                        <tr key={item.product.id}>
                          <td>
                            {item.product.code} · {item.product.name}
                          </td>
                          <td>{item.product.unit}</td>
                          <td>{item.required}</td>
                          <td>{item.available}</td>
                          <td>{item.shortage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {availability.items.length === 0 && <p>No hay componentes.</p>}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
