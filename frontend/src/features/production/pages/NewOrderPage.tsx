import { PageHeader } from '@/components/erp';
import { useNavigate } from 'react-router';
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
      <PageHeader
        title="Nueva orden de producción"
        description="Se guardará como borrador. Iniciar valida disponibilidad sin reservar materiales."
        breadcrumbs={[{ label: 'Producción', to: '/production/orders' }, { label: 'Nueva orden' }]}
      />
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
              onSuccess: (order) =>
                void navigate('/production/orders/' + order.id, {
                  state: { notice: 'Orden creada como borrador.' },
                }),
            })
          }
        />
      ) : (
        <p>No tenés permiso para crear órdenes de producción.</p>
      )}
    </section>
  );
}
