import { useState } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { FormSection } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomers } from '@/features/sales/hooks/useCustomers';
import { useProducts } from '@/features/inventory/api/product-hooks';
import type { SaleOrderValues } from '../api/sales-orders';

export function SaleOrderForm({
  initial,
  pending,
  error,
  onSubmit,
}: {
  initial: SaleOrderValues;
  pending: boolean;
  error: Error | null;
  onSubmit: (value: SaleOrderValues) => void;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [items, setItems] = useState(initial.items);
  const customers = useCustomers(1, 100);
  const products = useProducts(1, { type: 'FINISHED_GOOD', isActive: true }, 100);
  const setLine = (index: number, key: 'productId' | 'quantity' | 'unitPrice', value: string) =>
    setItems((old) => old.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  const total = items.reduce((sum, item) => {
    if (!/^\d+(?:\.\d{1,4})?$/.test(item.quantity) || !/^\d+(?:\.\d{1,4})?$/.test(item.unitPrice))
      return sum;
    const q = decimalScale(item.quantity),
      p = decimalScale(item.unitPrice);
    return sum + q * p;
  }, 0n);
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ customerId, items });
      }}
    >
      <FormSection title="1. Cliente" description="Selecciona un cliente activo para la orden.">
        <label className="block space-y-2 text-sm">
          Cliente
          <select
            className="h-10 w-full max-w-xl rounded-md border bg-background px-3"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            disabled={pending}
          >
            <option value="">Seleccionar cliente</option>
            {customers.data?.data
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
          </select>
        </label>
        <ErrorNotice error={customers.error} />
      </FormSection>
      <FormSection
        title="2. Productos terminados"
        description="Las cantidades y precios conservan su precisión decimal. La orden no mueve ni reserva existencias."
      >
        <div className="space-y-4">
          {items.map((item, index) => (
            <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-4" key={index}>
              <label className="space-y-2 text-sm">
                Producto terminado
                <select
                  className="h-10 w-full rounded-md border bg-background px-3"
                  value={item.productId}
                  onChange={(e) => setLine(index, 'productId', e.target.value)}
                  required
                  disabled={pending}
                >
                  <option value="">Seleccionar producto</option>
                  {products.data?.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                Cantidad
                <Input
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) => setLine(index, 'quantity', e.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="space-y-2 text-sm">
                Precio unitario
                <Input
                  inputMode="decimal"
                  value={item.unitPrice}
                  onChange={(e) => setLine(index, 'unitPrice', e.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={pending || items.length === 1}
                onClick={() => setItems((old) => old.filter((_, i) => i !== index))}
              >
                Quitar línea {index + 1}
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            setItems((old) => [...old, { productId: '', quantity: '', unitPrice: '0' }])
          }
        >
          Agregar producto
        </Button>
        <ErrorNotice error={products.error} />
      </FormSection>
      <FormSection title="3. Resumen">
        <p className="font-semibold tabular-nums">Total estimado: {money(total)}</p>
        <p className="text-sm text-muted-foreground">
          Confirmar valida la disponibilidad actual; no reserva inventario. La disponibilidad se
          revisará de nuevo al despachar.
        </p>
      </FormSection>
      <ErrorNotice error={error} />
      <Button
        type="submit"
        disabled={
          pending ||
          !customerId ||
          items.some((i) => !i.productId || !positive(i.quantity) || !decimal(i.unitPrice))
        }
      >
        {pending ? 'Guardando…' : 'Guardar borrador'}
      </Button>
    </form>
  );
}
function decimal(value: string) {
  return /^\d{1,10}(?:\.\d{1,4})?$/.test(value);
}
function positive(value: string) {
  return /^\d{1,14}(?:\.\d{1,4})?$/.test(value) && /[1-9]/.test(value);
}
function decimalScale(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
function money(raw: bigint) {
  const cents = (raw + 500000n) / 1000000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
