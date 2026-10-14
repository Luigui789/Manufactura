import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSession } from '@/features/auth/hooks/use-auth';
import {
  PURCHASE_STATUS,
  usePurchaseOrder,
  usePurchaseAction,
  useSavePurchaseOrder,
} from '../api/orders';
import { PurchaseOrderForm } from '../components/PurchaseOrderForm';
import { PurchaseReceiptForm } from '../components/PurchaseReceiptForm';
export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const order = usePurchaseOrder(id);
  const session = useSession();
  const save = useSavePurchaseOrder(id);
  const confirm = usePurchaseAction(id, 'confirm');
  const cancel = usePurchaseAction(id, 'cancel');
  const receive = usePurchaseAction(id, 'receive');
  const [mode, setMode] = useState<'view' | 'edit' | 'receive' | 'cancel' | 'confirm'>('view');
  const current = order.data;
  const canManage = ['ADMIN', 'COMPRAS'].includes(session.data?.role ?? '');
  const pending = save.isPending || confirm.isPending || cancel.isPending || receive.isPending;
  const displayTime = (value: string) =>
    new Date(value).toLocaleString('es-NI', { timeZone: 'America/Managua' });
  return (
    <section className="space-y-5">
      <Link className="underline" to="/purchases/orders">
        Volver a compras
      </Link>
      {order.isPending && <p role="status">Cargando orden…</p>}
      <ErrorNotice error={order.error} />
      {order.isError && <Button onClick={() => void order.refetch()}>Reintentar</Button>}
      {current && (
        <>
          <h1 className="text-2xl font-semibold">{current.number}</h1>
          <p>
            {current.supplier.code} · {current.supplier.name} · {PURCHASE_STATUS[current.status]}
          </p>
          <p>
            Fecha de orden: {displayTime(current.orderedAt)} (Managua) · Esperada:{' '}
            {current.expectedDate ?? 'Sin fecha'} · Total: {current.total}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th>Ordenado</th>
                  <th>Recibido</th>
                  <th>Pendiente</th>
                  <th>Precio</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.productCode} · {item.productName}
                    </td>
                    <td>{item.productUnit}</td>
                    <td>{item.quantityOrdered}</td>
                    <td>{item.quantityReceived}</td>
                    <td>{item.quantityPending}</td>
                    <td>{item.unitPrice}</td>
                    <td>{item.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <>
              {mode === 'view' && (
                <div className="flex gap-3">
                  {current.status === 'DRAFT' && (
                    <>
                      <Button disabled={pending} onClick={() => setMode('edit')}>
                        Editar borrador
                      </Button>
                      <Button disabled={pending} onClick={() => setMode('confirm')}>
                        Confirmar orden
                      </Button>
                    </>
                  )}
                  {(current.status === 'DRAFT' ||
                    (current.status === 'CONFIRMED' && current.receipts.length === 0)) && (
                    <Button variant="outline" disabled={pending} onClick={() => setMode('cancel')}>
                      Cancelar orden
                    </Button>
                  )}
                  {(current.status === 'CONFIRMED' || current.status === 'PARTIALLY_RECEIVED') && (
                    <Button disabled={pending} onClick={() => setMode('receive')}>
                      Recibir compra
                    </Button>
                  )}
                </div>
              )}
              {mode === 'edit' && current.status === 'DRAFT' && (
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
                  onSubmit={(value) => save.mutate(value, { onSuccess: () => setMode('view') })}
                />
              )}
              {mode === 'receive' &&
                (current.status === 'CONFIRMED' || current.status === 'PARTIALLY_RECEIVED') && (
                  <PurchaseReceiptForm
                    order={current}
                    pending={pending}
                    error={receive.error}
                    onClose={() => setMode('view')}
                    onSubmit={(value) =>
                      receive.mutate(value, { onSuccess: () => setMode('view') })
                    }
                  />
                )}
              {(mode === 'confirm' || mode === 'cancel') && (
                <div className="rounded border p-4 space-y-3">
                  <p>
                    {mode === 'confirm'
                      ? 'La orden quedará confirmada y disponible para recibir.'
                      : 'La orden quedará cancelada.'}
                  </p>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      (mode === 'confirm' ? confirm : cancel).mutate(undefined, {
                        onSuccess: () => setMode('view'),
                      })
                    }
                  >
                    {mode === 'confirm' ? 'Confirmar compra' : 'Confirmar cancelación'}
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => setMode('view')}>
                    Volver
                  </Button>
                </div>
              )}
            </>
          )}
          <ErrorNotice error={confirm.error} />
          <ErrorNotice error={cancel.error} />
          <h2 className="text-lg font-semibold">Historial de recepciones</h2>
          {current.receipts.length === 0 && <p>Sin recepciones.</p>}
          {current.receipts.map((receipt) => (
            <article key={receipt.id} className="rounded border p-4 space-y-2">
              <h3>{receipt.number}</h3>
              <p>
                {displayTime(receipt.receivedAt)} (Managua) · {receipt.receivedByFullName}
              </p>
              {receipt.notes && <p>{receipt.notes}</p>}
              <ul>
                {receipt.items.map((item) => (
                  <li key={item.id}>
                    {
                      current.items.find((line) => line.id === item.purchaseOrderItemId)
                        ?.productName
                    }{' '}
                    · {item.quantity} en {item.warehouse.code} · {item.warehouse.name}
                    {item.lot
                      ? ` · ${item.lot.code} · ${item.lot.status === 'QUARANTINED' ? 'En cuarentena' : 'Liberado'} · Vence: ${item.lot.expiresAt ?? 'Sin fecha'}`
                      : ' · Sin lote'}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
