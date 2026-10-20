import { PageHeader } from '@/components/erp';
import { useNavigate } from 'react-router';
import { useSavePurchaseOrder } from '../api/orders';
import { PurchaseOrderForm } from '../components/PurchaseOrderForm';
export function NewPurchaseOrderPage() {
  const save = useSavePurchaseOrder();
  const navigate = useNavigate();
  return (
    <section className="space-y-4">
      <PageHeader
        title="Nueva orden de compra"
        description="Se guardará como borrador. Confirmar no cambia el inventario; la recepción registra las existencias."
        breadcrumbs={[{ label: 'Compras', to: '/purchases/orders' }, { label: 'Nueva orden' }]}
      />
      <PurchaseOrderForm
        initial={{
          supplierId: '',
          expectedDate: '',
          items: [{ productId: '', quantity: '', unitPrice: '0' }],
        }}
        pending={save.isPending}
        error={save.error}
        onSubmit={(value) =>
          save.mutate(value, {
            onSuccess: (order) =>
              void navigate('/purchases/orders/' + order.id, {
                state: { notice: 'Orden creada como borrador.' },
              }),
          })
        }
      />
    </section>
  );
}
