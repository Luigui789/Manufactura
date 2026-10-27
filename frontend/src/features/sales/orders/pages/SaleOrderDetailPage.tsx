import { useEffect, useRef, useState } from 'react';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [cancelStarted, setCancelStarted] = useState(false);
  const confirmStarted = useRef(false);
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelStartedRef = useRef(false);
  const cancelNoticeRef = useRef<HTMLDivElement>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);
  const confirmTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmCancel) cancelConfirmRef.current?.focus();
    else cancelTriggerRef.current?.focus();
  }, [confirmCancel]);
  useEffect(() => {
    if (confirmOpen) confirmButtonRef.current?.focus();
    else confirmTriggerRef.current?.focus();
  }, [confirmOpen]);
  useEffect(() => {
    if (notice === 'Orden cancelada.') cancelNoticeRef.current?.focus();
  }, [notice]);
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
              !confirmCancel &&
              !confirmOpen && (
                <>
                  {current.status === 'DRAFT' && (
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Editar borrador
                    </Button>
                  )}
                  {current.status === 'DRAFT' && (
                    <Button
                      ref={confirmTriggerRef}
                      variant="outline"
                      disabled={confirm.isPending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Confirmar
                    </Button>
                  )}
                  {(current.status === 'DRAFT' || current.status === 'CONFIRMED') && (
                    <Button
                      ref={cancelTriggerRef}
                      variant="ghost"
                      disabled={cancel.isPending}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancelar orden
                    </Button>
                  )}
                </>
              )
            }
          />
          {(notice || (typeof routeNotice === 'string' ? routeNotice : '')) && (
            <div ref={cancelNoticeRef} tabIndex={-1} className="outline-none">
              <SuccessNotice>{notice || String(routeNotice)}</SuccessNotice>
            </div>
          )}
          {current.status === 'CONFIRMED' && (
            <SuccessNotice>
              Pendiente de despacho. El inventario no está reservado y se validará nuevamente al
              despachar.
            </SuccessNotice>
          )}
          {confirmOpen && current.status === 'DRAFT' && (
            <FormSection title="Confirmar orden de venta">
              <p>
                Confirmar validará la disponibilidad actual, pero no reservará inventario. El stock
                se volverá a comprobar al despachar.
              </p>
              <div className="flex gap-2">
                <Button
                  ref={confirmButtonRef}
                  disabled={confirm.isPending}
                  onClick={() => {
                    if (confirmStarted.current) return;
                    confirmStarted.current = true;
                    confirm.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmOpen(false);
                        setNotice('Orden confirmada. La disponibilidad no quedó reservada.');
                      },
                      onSettled: () => {
                        confirmStarted.current = false;
                      },
                    });
                  }}
                >
                  {confirm.isPending ? 'Confirmando…' : 'Sí, confirmar orden'}
                </Button>
                <Button
                  variant="outline"
                  disabled={confirm.isPending}
                  onClick={() => setConfirmOpen(false)}
                >
                  Volver
                </Button>
              </div>
              <ErrorNotice error={confirm.error} />
            </FormSection>
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
                initialCustomerLabel={`${current.customer.code} · ${current.customer.name}`}
                initialProductLabels={current.items.map(
                  (i) => `${i.productCode} · ${i.productName}`,
                )}
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
                  ref={cancelConfirmRef}
                  variant="destructive"
                  disabled={cancel.isPending || cancelStarted}
                  onClick={() => {
                    if (cancelStartedRef.current) return;
                    cancelStartedRef.current = true;
                    setCancelStarted(true);
                    cancel.mutate(undefined, {
                      onSuccess: () => {
                        setConfirmCancel(false);
                        setNotice('Orden cancelada.');
                      },
                      onSettled: () => {
                        cancelStartedRef.current = false;
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
