import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { positiveQuantitySchema } from '@/lib/decimal';
import { unitLabel } from '@/lib/presentation';
import { useCreateInventoryAdjustment } from '../../api/inventory-hooks';
import { InventoryEntityPicker } from '../InventoryEntityPicker';

type ValidationErrors = Partial<Record<'productId' | 'warehouseId' | 'lotId' | 'quantity', string>>;
type SelectedProduct = { code: string; name: string; isLotTracked?: boolean; unit?: string };

export function AdjustmentDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [productId, setProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct>();
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<
    'INITIAL_LOAD' | 'PHYSICAL_COUNT' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'CORRECTION'
  >('INITIAL_LOAD');
  const [lotId, setLotId] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const returnFocus = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useCreateInventoryAdjustment();
  const pending = mutation.isPending;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors: ValidationErrors = {};
    if (!productId) nextErrors.productId = 'Seleccioná un producto.';
    if (!warehouseId) nextErrors.warehouseId = 'Seleccioná un almacén.';
    if (!positiveQuantitySchema.safeParse(quantity).success)
      nextErrors.quantity = 'Indicá una cantidad positiva con hasta 4 decimales.';
    if (selectedProduct?.isLotTracked && !lotId)
      nextErrors.lotId = 'Seleccioná un lote para este producto.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const field = Object.keys(nextErrors)[0];
      requestAnimationFrame(() => {
        const section = formRef.current?.querySelector<HTMLElement>(
          '[data-adjustment-field="' + field + '"]',
        );
        const control = section?.querySelector<HTMLElement>('button, input');
        (control ?? section)?.focus();
      });
      return;
    }
    try {
      await mutation.mutateAsync({
        productId,
        warehouseId,
        ...(lotId ? { lotId } : {}),
        type,
        quantity,
        reason,
      });
      onSuccess('Ajuste registrado');
    } catch {
      return;
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-3xl"
        showCloseButton={!pending}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Nuevo ajuste</DialogTitle>
          <DialogDescription>
            Registrá una diferencia del inventario físico. Una entrada aumenta el saldo; una salida
            lo reduce.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} noValidate onSubmit={submit} className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Seleccioná producto y almacén, indicá la cantidad y el motivo del ajuste.
          </p>
          <fieldset disabled={pending} className="space-y-5">
            <div className="grid items-start gap-4 md:grid-cols-2">
              <div data-adjustment-field="productId" tabIndex={-1}>
                <InventoryEntityPicker
                  kind="product"
                  value={productId}
                  activeOnly
                  error={errors.productId}
                  onChange={(value, entity) => {
                    setProductId(value);
                    setSelectedProduct(entity);
                    setLotId('');
                    setErrors((previous) => ({
                      ...previous,
                      productId: undefined,
                      lotId: undefined,
                    }));
                  }}
                />
              </div>
              <div data-adjustment-field="warehouseId" tabIndex={-1}>
                <InventoryEntityPicker
                  kind="warehouse"
                  value={warehouseId}
                  activeOnly
                  error={errors.warehouseId}
                  onChange={(value) => {
                    setWarehouseId(value);
                    setLotId('');
                    setErrors((previous) => ({
                      ...previous,
                      warehouseId: undefined,
                      lotId: undefined,
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium">
                Tipo
                <select
                  className="block h-10 w-full rounded-md border bg-background px-3"
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value as typeof type);
                    setLotId('');
                    setErrors((previous) => ({ ...previous, lotId: undefined }));
                  }}
                >
                  <option value="ADJUSTMENT_IN">Entrada</option>
                  <option value="ADJUSTMENT_OUT">Salida</option>
                </select>
              </label>
              <div data-adjustment-field="quantity" tabIndex={-1}>
                <FormField
                  id="adjustment-quantity"
                  label="Cantidad"
                  inputMode="decimal"
                  pattern="(?=.*[1-9])[0-9]{1,14}(\.[0-9]{1,4})?"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setErrors((previous) => ({ ...previous, quantity: undefined }));
                  }}
                  required
                  error={errors.quantity}
                  helper={
                    (selectedProduct?.unit
                      ? 'Unidad: ' + unitLabel(selectedProduct.unit) + '. '
                      : '') +
                    'Ingresá una cantidad positiva; el tipo de ajuste determina si entra o sale.'
                  }
                />
              </div>
            </div>
            {selectedProduct?.isLotTracked && (
              <section
                className="space-y-3 border-t pt-4"
                data-adjustment-field="lotId"
                tabIndex={-1}
              >
                <div>
                  <h3 className="text-sm font-semibold">Lote requerido</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Este producto tiene seguimiento por lote. Elegí el lote que corresponde al
                    ajuste.
                    {type === 'ADJUSTMENT_OUT' &&
                      ' Solo aparecen lotes con existencia para el almacén seleccionado.'}
                  </p>
                </div>
                <InventoryEntityPicker
                  key={productId + '-' + type + '-' + warehouseId}
                  kind="lot"
                  value={lotId}
                  lotFilters={{
                    productId,
                    ...(type === 'ADJUSTMENT_OUT' ? { warehouseId, hasStock: true } : {}),
                  }}
                  error={errors.lotId}
                  onChange={(value) => {
                    setLotId(value);
                    setErrors((previous) => ({ ...previous, lotId: undefined }));
                  }}
                />
              </section>
            )}
            <label className="block space-y-2 text-sm font-medium">
              Motivo
              <select
                className="block h-10 w-full rounded-md border bg-background px-3"
                value={reason}
                onChange={(event) => setReason(event.target.value as typeof reason)}
              >
                {[
                  ['INITIAL_LOAD', 'Carga inicial'],
                  ['PHYSICAL_COUNT', 'Conteo físico'],
                  ['DAMAGE', 'Daño'],
                  ['LOSS', 'Pérdida'],
                  ['EXPIRY', 'Vencimiento'],
                  ['CORRECTION', 'Corrección'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="space-y-3 border-t pt-4">
            <ErrorNotice error={mutation.error} />
            <p className="text-sm text-muted-foreground">
              {type === 'ADJUSTMENT_IN'
                ? 'Al guardar, la cantidad indicada se sumará a las existencias del producto en el almacén seleccionado.'
                : 'Al guardar, la cantidad indicada se restará de las existencias del producto en el almacén seleccionado.'}{' '}
              El movimiento quedará registrado con tu usuario y el motivo elegido.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar ajuste'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
