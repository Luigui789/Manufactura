import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { DetailGrid, FormSection, StatusBadge } from '@/components/erp';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { receiptSchema, type ReceiptValues } from '../order-schemas';
import type { PurchaseOrder } from '../api/orders';
import { OrderCatalogPicker } from './OrderCatalogPicker';

const unitLabel = (unit: string) =>
  PRODUCT_UNIT_LABELS[unit as keyof typeof PRODUCT_UNIT_LABELS] ?? unit;

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
    <form
      noValidate
      aria-label="Registrar recepción"
      className="space-y-6 rounded-lg border p-4 sm:p-5"
      onSubmit={handleSubmit(onSubmit)}
    >
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">Registrar recepción</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Indicá lo que ingresó al almacén. Confirmar esta recepción aumenta las existencias y
          genera un documento de recepción.
        </p>
      </header>
      <DetailGrid>
        <div>
          <dt>Orden de compra</dt>
          <dd className="font-mono">{order.number}</dd>
        </div>
        <div>
          <dt>Proveedor</dt>
          <dd>
            {order.supplier.code} · {order.supplier.name}
          </dd>
        </div>
        <div>
          <dt>Pendiente de recibir</dt>
          <dd>
            {remaining.length} {remaining.length === 1 ? 'línea de compra' : 'líneas de compra'}
          </dd>
        </div>
      </DetailGrid>

      <fieldset disabled={pending} className="space-y-6">
        <FormSection
          title="Datos de recepción"
          description="La fecha y las notas son opcionales. Si no indicás fecha y hora, se registra el momento de la operación."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="receipt-at"
              label="Fecha y hora de recepción (Managua, opcional)"
              type="datetime-local"
              helper="Hora local de Managua."
              {...register('receivedAt')}
              error={errors.receivedAt?.message}
            />
            <FormField
              id="receipt-notes"
              label="Notas"
              placeholder="Por ejemplo, entrega parcial del proveedor"
              maxLength={500}
              helper="Opcional. Hasta 500 caracteres."
              {...register('notes')}
              error={errors.notes?.message}
            />
          </div>
        </FormSection>

        <FormSection
          title="Productos a recibir"
          description="Podés agregar varias filas de la misma línea para repartirla entre almacenes. La cantidad total debe respetar el pendiente."
        >
          <div className="space-y-4">
            {fields.map((field, index) => {
              const selected = order.items.find(
                (item) => item.id === values.items?.[index]?.purchaseOrderItemId,
              );
              const itemError = errors.items?.[index]?.purchaseOrderItemId?.message;
              return (
                <section
                  key={field.id}
                  aria-labelledby={'receipt-row-' + field.id}
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={'receipt-row-' + field.id} className="text-sm font-semibold">
                      Fila de recepción {index + 1}
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      Quitar recepción {index + 1}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor={'receipt-item-' + index} className="text-sm font-medium">
                      Línea de compra {index + 1}
                    </label>
                    <select
                      id={'receipt-item-' + index}
                      className="block h-10 w-full rounded-md border bg-background px-3 text-sm"
                      aria-invalid={Boolean(itemError)}
                      aria-describedby={itemError ? 'receipt-item-' + index + '-error' : undefined}
                      {...register(`items.${index}.purchaseOrderItemId`)}
                      onChange={(event) => {
                        setValue(`items.${index}.purchaseOrderItemId`, event.target.value, {
                          shouldValidate: true,
                        });
                        setValue(`items.${index}.expiresAt`, '');
                      }}
                    >
                      {remaining.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.productCode} · {item.productName} · Pendiente {item.quantityPending}{' '}
                          {unitLabel(item.productUnit)}
                        </option>
                      ))}
                    </select>
                    {itemError && (
                      <p
                        id={'receipt-item-' + index + '-error'}
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {itemError}
                      </p>
                    )}
                  </div>

                  {selected && (
                    <p className="text-sm text-muted-foreground">
                      Pendiente por recibir:{' '}
                      <strong className="font-medium text-foreground tabular-nums">
                        {selected.quantityPending} {unitLabel(selected.productUnit)}
                      </strong>
                      . Se considera el total de las filas de esta línea de compra.
                    </p>
                  )}
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <OrderCatalogPicker
                      kind="warehouse"
                      value={values.items?.[index]?.warehouseId ?? ''}
                      onChange={(warehouseId) =>
                        setValue(`items.${index}.warehouseId`, warehouseId, {
                          shouldValidate: true,
                        })
                      }
                      error={errors.items?.[index]?.warehouseId?.message}
                    />
                    <FormField
                      id={'receipt-quantity-' + index}
                      label="Cantidad recibida"
                      inputMode="decimal"
                      required
                      helper={
                        'Cantidad que ingresó en este almacén' +
                        (selected ? ', en ' + unitLabel(selected.productUnit).toLowerCase() : '') +
                        '. Hasta 4 decimales.'
                      }
                      {...register(`items.${index}.quantity`)}
                      error={errors.items?.[index]?.quantity?.message}
                    />
                  </div>

                  {selected?.isLotTracked && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium">Lote generado</h4>
                        <StatusBadge
                          status={selected.requiresQualityInspection ? 'QUARANTINED' : 'RELEASED'}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Se generará un lote nuevo para esta fila de recepción.{' '}
                        {selected.requiresQualityInspection
                          ? 'El lote ingresará en cuarentena porque el producto requiere inspección de calidad.'
                          : 'El lote ingresará liberado.'}
                      </p>
                      <div className="max-w-sm">
                        <FormField
                          id={'receipt-expiry-' + index}
                          label="Vencimiento del lote (opcional)"
                          type="date"
                          helper="Indicá la fecha de vencimiento informada por el proveedor, si corresponde."
                          {...register(`items.${index}.expiresAt`)}
                          error={errors.items?.[index]?.expiresAt?.message}
                        />
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
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
          {errors.items?.root && <p role="alert">{errors.items.root.message}</p>}
        </FormSection>
      </fieldset>

      <div className="space-y-3 border-t pt-4">
        <ErrorNotice error={error} />
        <p className="text-sm text-muted-foreground">
          Revisá cantidades, almacenes y lotes antes de confirmar. La recepción quedará en el
          historial de {order.number}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Recibiendo…' : 'Confirmar recepción'}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cerrar recepción
          </Button>
        </div>
      </div>
    </form>
  );
}
