import { FormSection } from '@/components/erp';
import { priceSchema, positiveQuantitySchema } from '@/lib/decimal';
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
      <fieldset disabled={pending} className="space-y-6">
        <FormSection
          title="1. Proveedor"
          description="Seleccioná quién suministra los productos de esta compra."
        >
          <OrderCatalogPicker
            kind="supplier"
            value={values.supplierId ?? ''}
            initialLabel={labels?.supplier}
            onChange={(id) => setValue('supplierId', id, { shouldValidate: true })}
            error={errors.supplierId?.message}
          />
        </FormSection>
        <FormSection
          title="2. Datos de la orden"
          description="La fecha esperada es opcional y se conserva como fecha calendario."
        >
          <FormField
            id="purchase-expected"
            label="Fecha esperada"
            type="date"
            {...register('expectedDate')}
            error={errors.expectedDate?.message}
          />
        </FormSection>
        <FormSection
          title="3. Productos"
          description="Las cantidades y precios se guardan como decimales. Crear el borrador no aumenta las existencias."
        >
          <div className="overflow-x-auto rounded-md border">
            <table aria-label="Productos de la compra">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th className="numeric">Subtotal estimado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id}>
                    <td className="min-w-72">
                      <OrderCatalogPicker
                        kind="product"
                        value={values.items?.[index]?.productId ?? ''}
                        initialLabel={labels?.products[index]}
                        onChange={(id) =>
                          setValue(`items.${index}.productId`, id, { shouldValidate: true })
                        }
                        error={errors.items?.[index]?.productId?.message}
                      />
                    </td>
                    <td className="min-w-40">
                      <FormField
                        id={'purchase-quantity-' + index}
                        label="Cantidad ordenada"
                        required
                        inputMode="decimal"
                        {...register(`items.${index}.quantity`)}
                        error={errors.items?.[index]?.quantity?.message}
                      />
                    </td>
                    <td className="min-w-40">
                      <FormField
                        id={'purchase-price-' + index}
                        label="Precio unitario"
                        required
                        inputMode="decimal"
                        {...register(`items.${index}.unitPrice`)}
                        error={errors.items?.[index]?.unitPrice?.message}
                      />
                    </td>
                    <td className="numeric">
                      {linePreview(
                        values.items?.[index]?.quantity,
                        values.items?.[index]?.unitPrice,
                      )}
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={fields.length <= 1}
                        onClick={() => remove(index)}
                      >
                        Quitar línea {index + 1}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => append({ productId: '', quantity: '', unitPrice: '0' })}
          >
            Agregar producto
          </Button>

          {errors.items?.root && <p role="alert">{errors.items.root.message}</p>}
        </FormSection>
        <FormSection title="4. Resumen">
          <div className="flex flex-wrap justify-between gap-3">
            <p>{fields.length} líneas de compra</p>
            <p className="font-semibold tabular-nums">
              Total estimado: {totalPreview(values.items)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            El importe definitivo se mostrará al guardar. Revisá proveedor, productos y cantidades
            antes de crear el borrador.
          </p>
        </FormSection>
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

// Exact preview only: never changes the decimal strings sent to the API.
function scaled(value: string | undefined, price = false): bigint | null {
  if (!(price ? priceSchema : positiveQuantitySchema).safeParse(value).success) return null;
  const [whole, fraction = ''] = value!.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
function display(value: bigint) {
  return (
    (value / 100000000n).toString() +
    '.' +
    (value % 100000000n)
      .toString()
      .padStart(8, '0')
      .replace(/0{1,4}$/, '')
  );
}
function linePreview(quantity?: string, price?: string) {
  const q = scaled(quantity),
    p = scaled(price, true);
  return q === null || p === null ? '—' : display(q * p);
}
function totalPreview(items?: { quantity?: string; unitPrice?: string }[]) {
  let sum = 0n;
  for (const item of items ?? []) {
    const q = scaled(item.quantity),
      p = scaled(item.unitPrice, true);
    if (q === null || p === null) return '—';
    sum += q * p;
  }
  return display(sum);
}
