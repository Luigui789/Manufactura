import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  DetailGrid,
  EmptyState,
  LoadingState,
  PageHeader,
  StatusBadge,
  SuccessNotice,
} from '@/components/erp';
import { useSession } from '@/features/auth/hooks/use-auth';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { formatCalendarDate } from '@/lib/calendar-date';
import { usePurchaseOrder, usePurchaseAction, useSavePurchaseOrder } from '../api/orders';
import { PurchaseOrderForm } from '../components/PurchaseOrderForm';
import { PurchaseReceiptForm } from '../components/PurchaseReceiptForm';

const unitLabel = (unit: string) =>
  PRODUCT_UNIT_LABELS[unit as keyof typeof PRODUCT_UNIT_LABELS] ?? unit;

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const order = usePurchaseOrder(id);
  const session = useSession();
  const save = useSavePurchaseOrder(id);
  const confirm = usePurchaseAction(id, 'confirm');
  const cancel = usePurchaseAction(id, 'cancel');
  const receive = usePurchaseAction(id, 'receive');
  const [mode, setMode] = useState<'view' | 'edit' | 'receive' | 'cancel' | 'confirm'>('view');
  const [notice, setNotice] = useState(
    (location.state as { notice?: string } | null)?.notice ?? '',
  );
  const current = order.data;
  const canManage = ['ADMIN', 'COMPRAS'].includes(session.data?.role ?? '');
  const pending = save.isPending || confirm.isPending || cancel.isPending || receive.isPending;
  const displayTime = (value: string) =>
    new Date(value).toLocaleString('es-NI', { timeZone: 'America/Managua' });
  const beginAction = (next: typeof mode) => {
    setNotice('');
    setMode(next);
  };

  return (
    <section className="space-y-6">
      <PageHeader
        title={current?.number ?? 'Orden de compra'}
        description={
          current
            ? current.supplier.code + ' · ' + current.supplier.name
            : 'Consultá la orden y sus recepciones.'
        }
        status={current && <StatusBadge status={current.status} />}
        breadcrumbs={[
          { label: 'Compras', to: '/purchases/orders' },
          { label: current?.number ?? 'Detalle de orden' },
        ]}
      />
      {order.isPending && <LoadingState label="Cargando orden…" />}
      <ErrorNotice error={order.error} />
      {order.isError && (
        <Button variant="outline" onClick={() => void order.refetch()}>
          Reintentar
        </Button>
      )}
      {current && (
        <>
          {notice && <SuccessNotice>{notice}</SuccessNotice>}
          <section aria-labelledby="purchase-summary-title" className="space-y-3">
            <h2 id="purchase-summary-title" className="text-lg font-semibold">
              Resumen de la orden
            </h2>
            <DetailGrid>
              <div>
                <dt>Proveedor</dt>
                <dd>{current.supplier.name}</dd>
              </div>
              <div>
                <dt>Fecha de orden · Managua</dt>
                <dd>{displayTime(current.orderedAt)}</dd>
              </div>
              <div>
                <dt>Fecha esperada</dt>
                <dd>
                  {current.expectedDate ? formatCalendarDate(current.expectedDate) : 'Sin fecha'}
                </dd>
              </div>
              <div>
                <dt>Total de la orden</dt>
                <dd className="font-semibold tabular-nums">{current.total}</dd>
              </div>
            </DetailGrid>
          </section>

          {mode === 'view' && (
            <section
              aria-labelledby="purchase-next-action"
              className="space-y-3 rounded-lg border bg-muted/30 p-4"
            >
              <h2 id="purchase-next-action" className="font-semibold">
                {current.status === 'RECEIVED' || current.status === 'CANCELLED'
                  ? 'Estado de la orden'
                  : 'Acción siguiente'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {current.status === 'DRAFT' &&
                  'Revisá los productos y las cantidades antes de confirmar. Confirmar habilita la recepción y no modifica las existencias.'}
                {current.status === 'CONFIRMED' &&
                  'La orden está confirmada. Registrá los productos que recibiste para aumentar las existencias.'}
                {current.status === 'PARTIALLY_RECEIVED' &&
                  'La compra tiene recepciones parciales. Podés registrar otra recepción por las cantidades pendientes.'}
                {current.status === 'RECEIVED' &&
                  'Todos los productos fueron recibidos. Consultá los documentos y lotes generados en el historial de recepciones.'}
                {current.status === 'CANCELLED' &&
                  'La orden está cancelada y ya no puede recibirse.'}
              </p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {current.status === 'DRAFT' && (
                    <>
                      <Button disabled={pending} onClick={() => beginAction('confirm')}>
                        Confirmar orden
                      </Button>
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() => beginAction('edit')}
                      >
                        Editar borrador
                      </Button>
                    </>
                  )}
                  {(current.status === 'CONFIRMED' || current.status === 'PARTIALLY_RECEIVED') && (
                    <Button disabled={pending} onClick={() => beginAction('receive')}>
                      Recibir compra
                    </Button>
                  )}
                  {(current.status === 'DRAFT' ||
                    (current.status === 'CONFIRMED' && current.receipts.length === 0)) && (
                    <Button
                      variant="ghost"
                      disabled={pending}
                      onClick={() => beginAction('cancel')}
                    >
                      Cancelar orden
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}

          {canManage && mode === 'edit' && current.status === 'DRAFT' && (
            <section aria-labelledby="purchase-edit-title" className="space-y-4">
              <div>
                <h2 id="purchase-edit-title" className="text-lg font-semibold">
                  Editar borrador
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Los cambios se guardan en {current.number}. Las existencias se actualizan al
                  registrar una recepción.
                </p>
              </div>
              <PurchaseOrderForm
                initial={{
                  supplierId: current.supplier.id,
                  expectedDate: current.expectedDate ?? '',
                  items: current.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantityOrdered,
                    unitPrice: item.unitPrice,
                  })),
                }}
                labels={{
                  supplier: current.supplier.name,
                  products: current.items.map(
                    (item) => item.productCode + ' · ' + item.productName,
                  ),
                }}
                pending={pending}
                error={save.error}
                onClose={() => setMode('view')}
                onSubmit={(value) =>
                  save.mutate(value, {
                    onSuccess: () => {
                      setNotice('Borrador actualizado.');
                      setMode('view');
                    },
                  })
                }
              />
            </section>
          )}
          {canManage &&
            mode === 'receive' &&
            (current.status === 'CONFIRMED' || current.status === 'PARTIALLY_RECEIVED') && (
              <PurchaseReceiptForm
                order={current}
                pending={pending}
                error={receive.error}
                onClose={() => setMode('view')}
                onSubmit={(value) =>
                  receive.mutate(value, {
                    onSuccess: (updated) => {
                      const receipt = updated.receipts.find(
                        (entry) => !current.receipts.some((previous) => previous.id === entry.id),
                      );
                      setNotice(
                        receipt
                          ? 'Recepción ' +
                              receipt.number +
                              ' registrada. Las existencias se actualizaron.'
                          : 'Recepción registrada. Las existencias se actualizaron.',
                      );
                      setMode('view');
                    },
                  })
                }
              />
            )}
          {canManage && (mode === 'confirm' || mode === 'cancel') && (
            <section
              aria-labelledby="purchase-confirm-title"
              className="space-y-4 rounded-lg border p-4"
            >
              <div>
                <h2 id="purchase-confirm-title" className="text-lg font-semibold">
                  {mode === 'confirm' ? 'Confirmar' : 'Cancelar'} {current.number}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mode === 'confirm'
                    ? 'La orden quedará confirmada y disponible para recibir. Las existencias aumentan cuando registrás una recepción.'
                    : 'Esta orden ya no podrá recibirse. Cancelarla no modifica las existencias.'}
                </p>
              </div>
              <ErrorNotice error={mode === 'confirm' ? confirm.error : cancel.error} />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={mode === 'cancel' ? 'destructive' : 'default'}
                  disabled={pending}
                  onClick={() =>
                    (mode === 'confirm' ? confirm : cancel).mutate(undefined, {
                      onSuccess: () => {
                        setNotice(
                          mode === 'confirm'
                            ? 'Orden confirmada. Ya podés registrar una recepción.'
                            : 'Orden cancelada. Ya no puede recibirse.',
                        );
                        setMode('view');
                      },
                    })
                  }
                >
                  {pending
                    ? 'Guardando…'
                    : mode === 'confirm'
                      ? 'Confirmar compra'
                      : 'Confirmar cancelación'}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setMode('view')}>
                  Volver
                </Button>
              </div>
            </section>
          )}

          <section aria-labelledby="purchase-items-title" className="space-y-3">
            <h2 id="purchase-items-title" className="text-lg font-semibold">
              Productos de la orden
            </h2>
            <div className="rounded-lg border">
              <Table aria-label="Productos de la orden de compra">
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Ordenado</TableHead>
                    <TableHead className="text-right">Recibido</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-right">Precio unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="block font-medium">{item.productName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.productCode}
                        </span>
                      </TableCell>
                      <TableCell>{unitLabel(item.productUnit)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantityOrdered}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantityReceived}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {item.quantityPending}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.unitPrice}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.lineTotal}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section aria-labelledby="purchase-receipts-title" className="space-y-3">
            <div>
              <h2 id="purchase-receipts-title" className="text-lg font-semibold">
                Historial de recepciones
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Documentos que registran el ingreso de esta compra al inventario.
              </p>
            </div>
            {current.receipts.length === 0 && (
              <EmptyState
                title="Sin recepciones."
                description={
                  current.status === 'DRAFT'
                    ? 'Confirmá la orden para habilitar su recepción.'
                    : current.status === 'CANCELLED'
                      ? 'La orden fue cancelada y no puede recibirse.'
                      : 'Registrá una recepción cuando los productos ingresen al almacén.'
                }
              />
            )}
            <div className="divide-y">
              {current.receipts.map((receipt) => (
                <article key={receipt.id} className="space-y-3 py-4 first:pt-0">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-mono font-semibold">{receipt.number}</h3>
                    <p className="text-sm text-muted-foreground">
                      {displayTime(receipt.receivedAt)} · Managua · {receipt.receivedByFullName}
                    </p>
                  </header>
                  {receipt.notes && <p className="text-sm">{receipt.notes}</p>}
                  <div className="rounded-lg border">
                    <Table aria-label={'Productos de ' + receipt.number}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead>Almacén</TableHead>
                          <TableHead className="text-right">Recibido</TableHead>
                          <TableHead>Lote</TableHead>
                          <TableHead>Vencimiento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipt.items.map((item) => {
                          const line = current.items.find(
                            (entry) => entry.id === item.purchaseOrderItemId,
                          );
                          return (
                            <TableRow key={item.id}>
                              <TableCell>{line?.productName ?? 'Producto de la orden'}</TableCell>
                              <TableCell>
                                {item.warehouse.code} · {item.warehouse.name}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {item.quantity} {line ? unitLabel(line.productUnit) : ''}
                              </TableCell>
                              <TableCell>
                                {item.lot ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      className="font-mono text-sm underline underline-offset-4"
                                      to={'/inventory/lots?lotId=' + item.lot.id}
                                    >
                                      {item.lot.code}
                                    </Link>
                                    <StatusBadge status={item.lot.status} />
                                  </div>
                                ) : (
                                  'Sin lote'
                                )}
                              </TableCell>
                              <TableCell>
                                {item.lot?.expiresAt
                                  ? formatCalendarDate(item.lot.expiresAt)
                                  : 'Sin fecha'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
