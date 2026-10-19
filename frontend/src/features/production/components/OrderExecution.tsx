import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getInventoryLots } from '@/features/inventory/api/inventory-data';
import {
  useCompleteOrder,
  useStartOrder,
  type OrderRequirements,
  type ProductionOrder,
} from '../api/orders';
import { completeOrderSchema, quantityUnits, type CompleteOrderValues } from '../execution-schema';

function LotSelection({
  product,
  warehouseId,
  selected,
  onChange,
}: {
  product: OrderRequirements['items'][number]['product'];
  warehouseId: string;
  selected: Array<{ lotId: string; quantity: string }>;
  onChange: (values: Array<{ lotId: string; quantity: string }>) => void;
}) {
  const [page, setPage] = useState(1);
  const [knownCodes, setKnownCodes] = useState<Record<string, string>>({});
  const filters = { productId: product.id, warehouseId, status: 'RELEASED', hasStock: true };
  const lots = useQuery({
    queryKey: ['inventory', 'lots', filters, page],
    queryFn: ({ signal }) => getInventoryLots(filters, page, signal),
  });
  const pages = lots.data ? Math.max(1, Math.ceil(lots.data.meta.total / lots.data.meta.limit)) : 1;
  return (
    <fieldset className="space-y-3 rounded border p-3">
      <legend>
        {product.code} · {product.name}
      </legend>
      {lots.isPending && <p role="status">Cargando lotes liberados…</p>}
      <ErrorNotice error={lots.error} />
      <Button type="button" variant="outline" onClick={() => void lots.refetch()}>
        Actualizar lotes
      </Button>
      {lots.data?.data.length === 0 && (
        <p>No hay lotes liberados con existencia en este almacén.</p>
      )}
      {lots.data?.data.map((lot) => {
        const entry = selected.find((item) => item.lotId === lot.id);
        return (
          <label key={lot.id} className="block space-y-1">
            {lot.code} · Disponible: {lot.quantityOnHand} {product.unit}
            <Input
              aria-label={`Cantidad de ${lot.code}`}
              inputMode="decimal"
              value={entry?.quantity ?? ''}
              onChange={(event) => {
                setKnownCodes((current) => ({ ...current, [lot.id]: lot.code }));
                const rest = selected.filter((item) => item.lotId !== lot.id);
                onChange(
                  event.target.value
                    ? [...rest, { lotId: lot.id, quantity: event.target.value }]
                    : rest,
                );
              }}
            />
          </label>
        );
      })}
      <p>Lotes asignados: {selected.length || 'ninguno'}</p>
      <ul>
        {selected.map((item) => (
          <li key={item.lotId}>
            {knownCodes[item.lotId] ?? item.lotId}: {item.quantity} {product.unit}
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(selected.filter((value) => value.lotId !== item.lotId))}
            >
              Quitar {knownCodes[item.lotId] ?? 'lote'}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page === 1 || lots.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page >= pages || lots.isFetching || !lots.data}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
        <Button type="button" variant="outline" onClick={() => onChange([])}>
          Limpiar asignación
        </Button>
      </div>
    </fieldset>
  );
}

export function OrderExecution({
  order,
  requirements,
}: {
  order: ProductionOrder;
  requirements?: OrderRequirements;
}) {
  const start = useStartOrder(order.id);
  const complete = useCompleteOrder(order.id);
  const client = useQueryClient();
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const tracked = requirements?.items.filter((item) => item.product.isLotTracked) ?? [];
  const form = useForm<CompleteOrderValues>({
    resolver: zodResolver(completeOrderSchema),
    defaultValues: {
      quantityProduced: order.quantityPlanned,
      expiresAt: '',
      allocations: tracked.map((item) => ({ productId: item.product.id, lots: [] })),
    },
  });
  const allocations = useWatch({ control: form.control, name: 'allocations' }) ?? [];
  const parsedAllocations = completeOrderSchema.shape.allocations.safeParse(allocations);
  const totals = tracked.map((item) => {
    if (!parsedAllocations.success) return null;
    return (
      parsedAllocations.data.find((value) => value.productId === item.product.id)?.lots ?? []
    ).reduce((sum, lot) => sum + quantityUnits(lot.quantity), 0n);
  });
  const allocationsComplete = tracked.every(
    (item, index) => totals[index] === quantityUnits(item.required),
  );
  const pending = start.isPending || complete.isPending;
  if (order.status === 'DRAFT')
    return (
      <div className="space-y-3">
        <p>
          Iniciar valida disponibilidad. Los materiales seguirán disponibles para otras operaciones.
        </p>
        <Button disabled={pending || !requirements?.canStart} onClick={() => setConfirmStart(true)}>
          Iniciar producción
        </Button>
        {confirmStart && (
          <div className="space-x-3">
            <Button
              disabled={pending}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: () => setConfirmStart(false),
                  onError: () => {
                    setConfirmStart(false);
                    void client.invalidateQueries({ queryKey: ['production-orders'] });
                  },
                })
              }
            >
              Confirmar inicio
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmStart(false)}>
              Volver
            </Button>
          </div>
        )}
        <ErrorNotice error={start.error} />
      </div>
    );
  if (order.status !== 'IN_PROGRESS') return null;
  if (!requirements) return <p>Actualizá los requerimientos antes de completar.</p>;
  return (
    <form
      aria-label="Completar producción"
      className="space-y-4 rounded border p-4"
      onChange={() => setConfirmComplete(false)}
      onSubmit={form.handleSubmit((values) => {
        if (quantityUnits(values.quantityProduced) > quantityUnits(order.quantityPlanned)) {
          form.setError('quantityProduced', {
            message: 'No puede superar la cantidad planificada',
          });
          return;
        }
        for (const [index, item] of tracked.entries()) {
          const total =
            values.allocations[index]?.lots.reduce(
              (sum, lot) => sum + quantityUnits(lot.quantity),
              0n,
            ) ?? 0n;
          if (total !== quantityUnits(item.required)) {
            form.setError('root', {
              message: `Asigna exactamente ${item.required} de ${item.product.name}`,
            });
            return;
          }
        }
        if (!confirmComplete) {
          setConfirmComplete(true);
          return;
        }
        complete.mutate(
          { ...values, expiresAt: values.expiresAt || undefined },
          {
            onError: () => {
              setConfirmComplete(false);
              void client.invalidateQueries({ queryKey: ['inventory', 'lots'] });
              void client.invalidateQueries({ queryKey: ['production-orders'] });
            },
          },
        );
      })}
    >
      <h2 className="text-lg font-semibold">Completar producción</h2>
      <p>Se consumirán los materiales de {order.quantityPlanned} unidades planificadas.</p>
      <label className="block">
        Cantidad producida real
        <Input inputMode="decimal" {...form.register('quantityProduced')} />
      </label>
      <label className="block">
        Vencimiento del lote (opcional)
        <Input type="date" {...form.register('expiresAt')} />
      </label>
      {tracked.map((item, index) => (
        <div key={item.product.id}>
          <p>
            Consumo requerido: {item.required} {item.product.unit}
          </p>
          <p aria-live="polite">
            Asignado: {totals[index] === null ? 'Cantidad inválida' : displayUnits(totals[index])}
            {' · '}Restante:{' '}
            {totals[index] === null
              ? '—'
              : displayUnits(quantityUnits(item.required) - totals[index])}
          </p>
          <LotSelection
            product={item.product}
            warehouseId={order.warehouseId}
            selected={allocations[index]?.lots ?? []}
            onChange={(lots) => {
              form.setValue(`allocations.${index}`, { productId: item.product.id, lots });
              form.clearErrors();
              setConfirmComplete(false);
            }}
          />
        </div>
      ))}
      {form.formState.errors.quantityProduced && (
        <p role="alert">{form.formState.errors.quantityProduced.message}</p>
      )}
      {form.formState.errors.expiresAt && (
        <p role="alert">{form.formState.errors.expiresAt.message}</p>
      )}
      {form.formState.errors.allocations && (
        <p role="alert">Revisá las cantidades de los lotes asignados.</p>
      )}
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      <ErrorNotice error={complete.error} />
      {confirmComplete && (
        <p>Confirmá el consumo planificado y la creación del lote con la cantidad real indicada.</p>
      )}
      <Button type="submit" disabled={pending || !allocationsComplete}>
        {confirmComplete ? 'Confirmar finalización' : 'Revisar finalización'}
      </Button>
      {confirmComplete && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setConfirmComplete(false)}
        >
          Volver
        </Button>
      )}
    </form>
  );
}

function displayUnits(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 10000n}.${String(absolute % 10000n).padStart(4, '0')}`;
}
