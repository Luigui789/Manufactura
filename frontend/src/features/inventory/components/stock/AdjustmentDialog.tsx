import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { positiveQuantitySchema } from '@/lib/decimal';
import { useProducts } from '../../api/product-hooks';
import { useWarehouses } from '../../api/hooks';
import { useInventoryLots, useCreateInventoryAdjustment } from '../../api/inventory-hooks';

export function AdjustmentDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<
    'INITIAL_LOAD' | 'PHYSICAL_COUNT' | 'DAMAGE' | 'LOSS' | 'EXPIRY' | 'CORRECTION'
  >('INITIAL_LOAD');
  const [lotId, setLotId] = useState('');
  const [validationError, setValidationError] = useState('');
  const products = useProducts(1, { isActive: true }, 100);
  const warehouses = useWarehouses(1, { isActive: true }, 100);
  const selected = products.data?.data.find((item) => item.id === productId);
  const lots = useInventoryLots(
    {
      productId,
      ...(type === 'ADJUSTMENT_OUT' ? { warehouseId, hasStock: true } : {}),
    },
    1,
    Boolean(productId && selected?.isLotTracked),
  );
  const mutation = useCreateInventoryAdjustment();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError('');
    if (
      !productId ||
      !warehouseId ||
      !positiveQuantitySchema.safeParse(quantity).success ||
      (selected?.isLotTracked && !lotId)
    ) {
      setValidationError(
        'Selecciona producto, almacén y lote cuando corresponda, e indica una cantidad positiva con hasta 4 decimales.',
      );
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
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjustment-title"
        className="w-full max-w-lg space-y-4 rounded-lg border bg-background p-5"
      >
        <h2 id="adjustment-title" className="text-lg font-semibold">
          Nuevo ajuste
        </h2>
        <form onSubmit={submit} className="space-y-4">
          {(products.isPending ||
            warehouses.isPending ||
            (selected?.isLotTracked && lots.isPending)) && <p role="status">Cargando opciones…</p>}
          <ErrorNotice
            error={
              products.error ?? warehouses.error ?? (selected?.isLotTracked ? lots.error : null)
            }
          />
          {(products.isError || warehouses.isError || (selected?.isLotTracked && lots.isError)) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void products.refetch();
                void warehouses.refetch();
                if (selected?.isLotTracked) void lots.refetch();
              }}
            >
              Reintentar
            </Button>
          )}
          <label className="block space-y-1 text-sm">
            Producto
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setLotId('');
              }}
              required
            >
              <option value="">Selecciona producto</option>
              {products.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            Almacén
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setLotId('');
              }}
              required
            >
              <option value="">Selecciona almacén</option>
              {warehouses.data?.data.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            Tipo
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setLotId('');
              }}
            >
              <option value="ADJUSTMENT_IN">Entrada</option>
              <option value="ADJUSTMENT_OUT">Salida</option>
            </select>
          </label>
          {selected?.isLotTracked && (
            <label className="block space-y-1 text-sm">
              Lote
              <select
                className="h-9 w-full rounded-md border bg-background px-2"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                required
              >
                <option value="">Selecciona lote</option>
                {lots.data?.data.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.status} · {l.quantityOnHand}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block space-y-1 text-sm">
            Cantidad
            <input
              className="h-9 w-full rounded-md border bg-background px-2"
              inputMode="decimal"
              pattern="(?=.*[1-9])[0-9]{1,14}(\.[0-9]{1,4})?"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            Motivo
            <select
              className="h-9 w-full rounded-md border bg-background px-2"
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
            >
              {[
                ['INITIAL_LOAD', 'Carga inicial'],
                ['PHYSICAL_COUNT', 'Conteo físico'],
                ['DAMAGE', 'Daño'],
                ['LOSS', 'Pérdida'],
                ['EXPIRY', 'Vencimiento'],
                ['CORRECTION', 'Corrección'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <ErrorNotice error={mutation.error} />
          {validationError && <p role="alert">{validationError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar ajuste'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
