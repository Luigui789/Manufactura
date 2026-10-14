import { Link, useNavigate } from 'react-router';
import { useSavePurchaseOrder } from '../api/orders';
import { PurchaseOrderForm } from '../components/PurchaseOrderForm';
export function NewPurchaseOrderPage() {
  const save = useSavePurchaseOrder();
  const navigate = useNavigate();
  return (
    <section className="space-y-4">
      <Link className="underline" to="/purchases/orders">
        Volver a compras
      </Link>
      <h1 className="text-2xl font-semibold">Nueva orden de compra</h1>
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
            onSuccess: (order) => void navigate('/purchases/orders/' + order.id),
          })
        }
      />
    </section>
  );
}
