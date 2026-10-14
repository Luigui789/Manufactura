import { zodResolver } from '@hookform/resolvers/zod';

import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';

import { FormField } from '@/components/FormField';

import { ErrorNotice } from '@/components/ErrorNotice';

import { receiptSchema, type ReceiptValues } from '../order-schemas';

import type { PurchaseOrder } from '../api/orders';

import { OrderCatalogPicker } from './OrderCatalogPicker';

export function PurchaseReceiptForm({
  order,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  order: PurchaseOrder;
  pending: boolean;
  error: Error | null;
  onSubmit: (value: ReceiptValues) => void;
  onClose: () => void;
}) {
  const remaining = order.items.filter((item) => /[1-9]/.test(item.quantityPending));

  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ReceiptValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      receivedAt: '',
      notes: '',
      items: [
        {
          purchaseOrderItemId: remaining[0]?.id ?? '',
          warehouseId: '',
          quantity: '',
          expiresAt: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const values = useWatch({ control });

  return (
    <form noValidate className="space-y-4 rounded border p-4" onSubmit={handleSubmit(onSubmit)}>
      <h2>Registrar recepción</h2>
      <p>
        Podés agregar varias filas de la misma línea para repartirla entre almacenes. La cantidad
        total debe respetar el pendiente.
      </p>

      <fieldset disabled={pending} className="space-y-4">
        <FormField
          id="receipt-at"
          label="Fecha y hora de recepción (Managua, opcional)"
          type="datetime-local"
          {...register('receivedAt')}
          error={errors.receivedAt?.message}
        />

        <FormField
          id="receipt-notes"
          label="Notas"
          maxLength={500}
          {...register('notes')}
          error={errors.notes?.message}
        />

        {fields.map((field, index) => {
          const selected = order.items.find(
            (item) => item.id === values.items?.[index]?.purchaseOrderItemId,
          );
          return (
            <div key={field.id} className="space-y-3 rounded border p-3">
              <label htmlFor={'receipt-item-' + index}>Línea de compra {index + 1}</label>
              <select
                id={'receipt-item-' + index}
                className="block w-full border rounded p-2"
                {...register(`items.${index}.purchaseOrderItemId`)}
                onChange={(e) => {
                  setValue(`items.${index}.purchaseOrderItemId`, e.target.value);
                  setValue(`items.${index}.expiresAt`, '');
                }}
              >
                {remaining.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.productCode} · {item.productName} · Pendiente {item.quantityPending}{' '}
                    {item.productUnit}
                  </option>
                ))}
              </select>

              {errors.items?.[index]?.purchaseOrderItemId && (
                <p role="alert">{errors.items[index]?.purchaseOrderItemId?.message}</p>
              )}

              <OrderCatalogPicker
                kind="warehouse"
                value={values.items?.[index]?.warehouseId ?? ''}
                onChange={(id) =>
                  setValue(`items.${index}.warehouseId`, id, { shouldValidate: true })
                }
                error={errors.items?.[index]?.warehouseId?.message}
              />

              <FormField
                id={'receipt-quantity-' + index}
                label="Cantidad recibida"
                inputMode="decimal"
                {...register(`items.${index}.quantity`)}
                error={errors.items?.[index]?.quantity?.message}
              />

              {selected?.isLotTracked && (
                <>
                  <FormField
                    id={'receipt-expiry-' + index}
                    label="Vencimiento del lote (opcional)"
                    type="date"
                    {...register(`items.${index}.expiresAt`)}
                    error={errors.items?.[index]?.expiresAt?.message}
                  />
                  <p>
                    Lote nuevo: {selected.requiresQualityInspection ? 'En cuarentena' : 'Liberado'}.
                  </p>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                disabled={fields.length <= 1}
                onClick={() => remove(index)}
              >
                Quitar recepción {index + 1}
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              purchaseOrderItemId: remaining[0]?.id ?? '',
              warehouseId: '',
              quantity: '',
              expiresAt: '',
            })
          }
        >
          Agregar fila de recepción
        </Button>
      </fieldset>
      <ErrorNotice error={error} />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Recibiendo…' : 'Confirmar recepción'}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          Cerrar recepción
        </Button>
      </div>
    </form>
  );
}
