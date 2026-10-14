import { zodResolver } from '@hookform/resolvers/zod';

import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';

import { FormField } from '@/components/FormField';

import { ErrorNotice } from '@/components/ErrorNotice';

import { purchaseOrderSchema, type PurchaseOrderValues } from '../order-schemas';

import { OrderCatalogPicker } from './OrderCatalogPicker';

export function PurchaseOrderForm({
  initial,
  labels,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  initial: PurchaseOrderValues;
  labels?: { supplier: string; products: string[] };
  pending: boolean;
  error: Error | null;
  onSubmit: (value: PurchaseOrderValues) => void;
  onClose?: () => void;
}) {
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<PurchaseOrderValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: initial,
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const values = useWatch({ control });

  return (
    <form noValidate className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <fieldset disabled={pending} className="space-y-4">
        <OrderCatalogPicker
          kind="supplier"
          value={values.supplierId ?? ''}
          initialLabel={labels?.supplier}
          onChange={(id) => setValue('supplierId', id, { shouldValidate: true })}
          error={errors.supplierId?.message}
        />

        <FormField
          id="purchase-expected"
          label="Fecha esperada"
          type="date"
          {...register('expectedDate')}
          error={errors.expectedDate?.message}
        />

        {fields.map((field, index) => (
          <div className="rounded border p-3 space-y-3" key={field.id}>
            <OrderCatalogPicker
              kind="product"
              value={values.items?.[index]?.productId ?? ''}
              initialLabel={labels?.products[index]}
              onChange={(id) => setValue(`items.${index}.productId`, id, { shouldValidate: true })}
              error={errors.items?.[index]?.productId?.message}
            />

            <FormField
              id={'purchase-quantity-' + index}
              label="Cantidad ordenada"
              inputMode="decimal"
              {...register(`items.${index}.quantity`)}
              error={errors.items?.[index]?.quantity?.message}
            />

            <FormField
              id={'purchase-price-' + index}
              label="Precio unitario"
              inputMode="decimal"
              {...register(`items.${index}.unitPrice`)}
              error={errors.items?.[index]?.unitPrice?.message}
            />

            <Button
              type="button"
              variant="outline"
              disabled={fields.length <= 1}
              onClick={() => remove(index)}
            >
              Quitar línea {index + 1}
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ productId: '', quantity: '', unitPrice: '0' })}
        >
          Agregar producto
        </Button>

        {errors.items?.root && <p role="alert">{errors.items.root.message}</p>}
      </fieldset>
      <ErrorNotice error={error} />
      <Button disabled={pending} type="submit">
        {pending ? 'Guardando…' : 'Guardar borrador'}
      </Button>

      {onClose && (
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          Cerrar edición
        </Button>
      )}
    </form>
  );
}
