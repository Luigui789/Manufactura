import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  InventoryEntityPicker,
  type InventoryPickerEntity,
} from '@/features/inventory/components/InventoryEntityPicker';
import { useInventoryStock } from '@/features/inventory/api/inventory-hooks';
import { unitLabel } from '@/lib/presentation';
import type { SaleOrder, SaleDispatchValues } from '../api/sales-orders';

type DispatchRow = {
  key: string;
  saleOrderItemId: string;
  warehouseId: string;
  warehouse?: InventoryPickerEntity;
  lotId: string;
  lot?: InventoryPickerEntity;
  quantity: string;
};
const blank = (key: string): DispatchRow => ({
  key,
  saleOrderItemId: '',
  warehouseId: '',
  lotId: '',
  quantity: '',
});
const positiveDecimal = (value: string) => /^(?=.*[1-9])\d{1,14}(?:\.\d{1,4})?$/.test(value);

function WarehouseAvailability({
  productId,
  warehouseId,
  unit,
}: {
  productId: string;
  warehouseId: string;
  unit: string;
}) {
  const query = useInventoryStock({ productId, warehouseId }, 1, Boolean(warehouseId));
  if (!warehouseId) return null;
  if (query.isPending) return <p className="text-sm">Consultando existencia del almacén…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudo consultar la existencia actual.
      </p>
    );
  const quantity = query.data?.data[0]?.quantity ?? '0.0000';
  return (
    <p className="text-sm text-muted-foreground">
      Existencia física en este almacén: {quantity} {unitLabel(unit)}
    </p>
  );
}

export function SaleDispatchForm({
  order,
  pending,
  onSubmit,
}: {
  order: SaleOrder;
  pending: boolean;
  onSubmit: (value: SaleDispatchValues) => void;
}) {
  const nextRowKey = useRef(1);
  const [rows, setRows] = useState<DispatchRow[]>(() => [blank('dispatch-row-0')]);
  const [review, setReview] = useState(false);
  const submitStarted = useRef(false);
  useEffect(() => {
    if (!pending) submitStarted.current = false;
  }, [pending]);
  const itemById = new Map(order.items.map((item) => [item.id, item]));
  const update = (key: string, patch: Partial<DispatchRow>) => {
    setReview(false);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const valid =
    rows.length > 0 &&
    rows.every((row) => {
      const item = itemById.get(row.saleOrderItemId);
      return (
        !!item &&
        !!row.warehouseId &&
        positiveDecimal(row.quantity) &&
        (!item.isLotTracked || !!row.lotId)
      );
    });
  const values = (): SaleDispatchValues => ({
    items: rows.map((row) => ({
      saleOrderItemId: row.saleOrderItemId,
      warehouseId: row.warehouseId,
      ...(row.lotId ? { lotId: row.lotId } : {}),
      quantity: row.quantity,
    })),
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || pending) return;
        if (!review) {
          setReview(true);
          return;
        }
        if (submitStarted.current) return;
        submitStarted.current = true;
        onSubmit(values());
      }}
    >
      <p className="text-sm text-muted-foreground">
        Orden {order.number} · {order.customer.code} · {order.customer.name}
      </p>
      {rows.map((row, index) => {
        const item = itemById.get(row.saleOrderItemId);
        return (
          <fieldset key={row.key} className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Línea de despacho {index + 1}</legend>
            <label className="grid gap-2 text-sm">
              Producto de la orden
              <select
                className="h-9 rounded-md border bg-background px-3"
                value={row.saleOrderItemId}
                disabled={pending || review}
                onChange={(event) => {
                  update(row.key, {
                    saleOrderItemId: event.target.value,
                    lotId: '',
                    lot: undefined,
                  });
                }}
                required
              >
                <option value="">Seleccionar producto</option>
                {order.items
                  .filter((orderItem) =>
                    positiveDecimal(orderItem.quantityPending ?? orderItem.quantity),
                  )
                  .map((orderItem) => (
                    <option key={orderItem.id} value={orderItem.id}>
                      {orderItem.productCode} · {orderItem.productName} (
                      {orderItem.quantityPending ?? orderItem.quantity}{' '}
                      {unitLabel(orderItem.productUnit)})
                    </option>
                  ))}
              </select>
            </label>
            <div className={pending || review ? 'pointer-events-none opacity-70' : undefined}>
              <InventoryEntityPicker
                kind="warehouse"
                value={row.warehouseId}
                activeOnly
                disabled={pending || review}
                onChange={(warehouseId, warehouse) => {
                  update(row.key, { warehouseId, warehouse, lotId: '', lot: undefined });
                }}
              />
            </div>
            {item && row.warehouseId && !item.isLotTracked && (
              <WarehouseAvailability
                productId={item.productId}
                warehouseId={row.warehouseId}
                unit={item.productUnit}
              />
            )}
            {item?.isLotTracked && row.warehouseId && (
              <div className={pending || review ? 'pointer-events-none opacity-70' : undefined}>
                <InventoryEntityPicker
                  kind="lot"
                  value={row.lotId}
                  disabled={pending || review}
                  lotFilters={{
                    productId: item.productId,
                    status: 'RELEASED',
                    hasStock: true,
                    ...(row.warehouseId ? { warehouseId: row.warehouseId } : {}),
                  }}
                  onChange={(lotId, lot) => {
                    update(row.key, { lotId, lot });
                  }}
                />
              </div>
            )}
            <label className="grid gap-2 text-sm">
              Cantidad a despachar (pendiente: {item?.quantityPending ?? item?.quantity ?? '—'}{' '}
              {item ? unitLabel(item.productUnit) : ''})
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                value={row.quantity}
                disabled={pending || review}
                required
                onChange={(event) => update(row.key, { quantity: event.target.value })}
              />
            </label>
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending || review}
                onClick={() => {
                  setRows((current) => current.filter((candidate) => candidate.key !== row.key));
                  setReview(false);
                }}
              >
                Quitar línea
              </Button>
            )}
          </fieldset>
        );
      })}
      {review && (
        <section aria-label="Resumen del despacho" className="space-y-2 rounded-md border p-4">
          <h3 className="font-semibold">Revisá el despacho antes de registrarlo</h3>
          <p className="text-sm">OV: {order.number} · DES: se asignará automáticamente.</p>
          <p className="text-sm text-destructive">
            Registrar este despacho disminuirá inmediatamente las existencias de Inventario. La
            operación no podrá editarse ni revertirse desde esta pantalla.
          </p>
          <ul className="list-inside list-disc text-sm">
            {rows.map((row) => {
              const item = itemById.get(row.saleOrderItemId)!;
              return (
                <li key={row.key}>
                  {item.productCode} · {item.productName}: {row.quantity}{' '}
                  {unitLabel(item.productUnit)} · {row.warehouse?.code ?? 'Almacén seleccionado'}
                  {item.isLotTracked && ` · ${row.lot?.code ?? 'Lote seleccionado'}`}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {!review && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              setRows((current) => [...current, blank(`dispatch-row-${nextRowKey.current++}`)])
            }
          >
            Agregar asignación
          </Button>
        )}
        <Button type="submit" disabled={pending || !valid}>
          {pending
            ? 'Registrando despacho…'
            : review
              ? 'Confirmar y registrar despacho'
              : 'Revisar despacho'}
        </Button>
        {review && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setReview(false)}
          >
            Volver a editar
          </Button>
        )}
      </div>
    </form>
  );
}
