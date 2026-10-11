import { Link, useNavigate } from 'react-router';
import { useSession } from '@/features/auth/hooks/use-auth';
import { useCreateOrder } from '../api/orders';
import { OrderForm } from '../components/OrderForm';

export function NewOrderPage() {
  const session = useSession();
  const create = useCreateOrder();
  const navigate = useNavigate();
  const canManage = session.data?.role === 'ADMIN' || session.data?.role === 'PRODUCCION';
  return (
    <section className="space-y-5">
      <Link to="/production/orders" className="underline">
        Volver a órdenes
      </Link>
      <h1 className="text-2xl font-semibold">Nueva orden de producción</h1>
      {canManage ? (
        <OrderForm
          initial={{
            productId: '',
            bomVersionId: '',
            warehouseId: '',
            quantityPlanned: '',
            plannedStartAt: '',
            plannedEndAt: '',
          }}
          pending={create.isPending}
          error={create.error}
          onSubmit={(value) =>
            create.mutate(value, {
              onSuccess: (order) => void navigate('/production/orders/' + order.id),
            })
          }
        />
      ) : (
        <p>No tenés permiso para crear órdenes de producción.</p>
      )}
    </section>
  );
}
