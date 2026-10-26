import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  FormSection,
  DetailGrid,
  LoadingState,
  StatusBadge,
  SuccessNotice,
} from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import { useSalesOrder, useSalesOrderAction, useSaveSalesOrder } from '../api/sales-orders';
import { SaleOrderForm } from '../components/SaleOrderForm';
export function SaleOrderDetailPage() {
  const { id = '' } = useParams();
  const order = useSalesOrder(id);
  const session = useSession();
  const confirm = useSalesOrderAction(id, 'confirm');
  const cancel = useSalesOrderAction(id, 'cancel');
  const update = useSaveSalesOrder(id);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState('');
  const [cancelStarted, setCancelStarted] = useState(false);
  const current = order.data;
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'VENTAS';
  const routeNotice = (useLocation().state as { notice?: unknown } | null)?.notice;
  return (
    <section className="space-y-6">
      {order.isPending && <LoadingState label="Cargando orden de venta…" />}
      <ErrorNotice error={order.error} />
      {order.isError && (
        <Button asChild variant="outline">
          <Link to="/sales/orders">Volver a órdenes</Link>
        </Button>
      )}
      {current && (
        <>
          <PageHeader
            title={`Orden de venta ${current.number}`}
            description={`${current.customer.code} · ${current.customer.name}`}
            breadcrumbs={[
              { label: 'Ventas', to: '/sales/orders' },
              { label: 'Órdenes', to: '/sales/orders' },
              { label: current.number },
            ]}
            status={<StatusBadge status={current.status} />}
            actions={
              canManage &&
              !editing &&
              !confirmCancel && (
                <>
                  {current.status === 'DRAFT' && (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Editar borrador
                    </Button>
                  )}
                  {(current.status === 'DRAFT' || current.status === 'CONFIRMED') && (
                    <>
                      <Button
                        variant="outline"
                        disabled={confirm.isPending}
                        onClick={() =>
                          confirm.mutate(undefined, {
                            onSuccess: () =>
                              setNotice('Orden confirmada. La disponibilidad no quedó reservada.'),
                          })
                        }
                      >
                        Confirmar y comprobar disponibilidad
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={cancel.isPending}
                        onClick={() => setConfirmCancel(true)}
                      >
                        Cancelar orden
                      </Button>
                    </>
                  )}
                </>
              )
            }
          />
          {(notice || (typeof routeNotice === 'string' ? routeNotice : '')) && (
            <SuccessNotice>{notice || String(routeNotice)}</SuccessNotice>
          )}
          <FormSection title="Resumen">
            <DetailGrid>
              <div>
                <dt>Cliente</dt>
                <dd>
                  {current.customer.code} · {current.customer.name}
                </dd>
              </div>
              <div>
                <dt>Fecha de emisión</dt>
                <dd>
                  {new Date(current.orderedAt).toLocaleString('es-NI', {
                    timeZone: 'America/Managua',
                  })}
                </dd>
              </div>
              <div>
                <dt>Líneas</dt>
                <dd>{current.itemsCount}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd className="font-semibold tabular-nums">{current.total}</dd>
              </div>
            </DetailGrid>
          </FormSection>
          {editing && current.status === 'DRAFT' ? (
            <FormSection title="Editar borrador">
              <SaleOrderForm
                initial={{
                  customerId: current.customer.id,
                  items: current.items.map((i) => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                  })),
                }}
                pending={update.isPending}
                error={update.error}
                onSubmit={(value) =>
                  update.mutate(value, {
                    onSuccess: () => {
                      setEditing(false);
                      setNotice('Borrador actualizado.');
                    },
                  })
                }
              />
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cerrar edición
              </Button>
            </FormSection>
          ) : (
            <FormSection title="Productos de la orden">
              <div className="overflow-x-auto rounded-lg border">
                <table aria-label="Productos de la orden de venta">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio unitario</th>
                      <th className="numeric">Subtotal</th>
                      <th className="numeric">Disponible ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.productCode} · {item.productName}
                        </td>
                        <td>
                          {item.quantity} {item.productUnit}
                        </td>
                        <td>{item.unitPrice}</td>
                        <td className="numeric">{item.lineTotal}</td>
                        <td className="numeric">{item.availableQuantity ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                La cantidad disponible es una consulta informativa. Confirmar la orden no reserva
                inventario; se volverá a revisar al implementar el despacho.
              </p>
            </FormSection>
          )}
          {confirmCancel && (
            <FormSection title="Confirmar cancelación">
              <p>¿Cancelar la orden {current.number}? La acción quedará auditada.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="destructive"
                  disabled={cancel.isPending || cancelStarted}
                  onClick={() => {
                    setCancelStarted(true);
                    cancel.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmCancel(false);
                        setNotice('Orden cancelada.');
                      },
                      onSettled: () => {
                        setCancelStarted(false);
                      },
                    });
                  }}
                >
                  Sí, cancelar
                </Button>
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => setConfirmCancel(false)}
                >
                  Volver
                </Button>
              </div>
              <ErrorNotice error={cancel.error} />
            </FormSection>
          )}
        </>
      )}
    </section>
  );
}
