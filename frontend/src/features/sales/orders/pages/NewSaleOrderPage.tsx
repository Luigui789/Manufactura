import { useNavigate } from 'react-router';
import { PageHeader } from '@/components/erp';
import { SaleOrderForm } from '../components/SaleOrderForm';
import { useSaveSalesOrder } from '../api/sales-orders';
export function NewSaleOrderPage() {
  const save = useSaveSalesOrder();
  const navigate = useNavigate();
  return (
    <section className="space-y-5">
      <PageHeader
        title="Nueva orden de venta"
        description="La orden inicia como borrador. Confirmar comprueba disponibilidad actual sin reservar existencias."
        breadcrumbs={[{ label: 'Ventas', to: '/sales/orders' }, { label: 'Nueva orden' }]}
      />
      <SaleOrderForm
        initial={{ customerId: '', items: [{ productId: '', quantity: '', unitPrice: '0' }] }}
        pending={save.isPending}
        error={save.error}
        onSubmit={(value) =>
          save.mutate(value, {
            onSuccess: (order) =>
              void navigate(`/sales/orders/${order.id}`, {
                state: { notice: 'Orden guardada como borrador.' },
              }),
          })
        }
      />
    </section>
  );
}
