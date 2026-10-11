import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useProducts } from '@/features/inventory/api/product-hooks';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import type { Product } from '@/features/inventory/types';

export function ProductPicker({
  label,
  value,
  onChange,
  output = false,
  excludeId,
  error,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  output?: boolean;
  excludeId?: string;
  error?: string;
}) {
  const id = useId();
  const types: Product['type'][] = output
    ? ['FINISHED_GOOD', 'INTERMEDIATE']
    : ['RAW_MATERIAL', 'CONSUMABLE', 'INTERMEDIATE'];
  const [type, setType] = useState<Product['type']>(types[0]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const products = useProducts(page, {
    type,
    isActive: true,
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const totalPages = products.data
    ? Math.max(1, Math.ceil(products.data.meta.total / products.data.meta.limit))
    : 1;
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend className="px-1 font-medium">{label}</legend>
      <p>
        {selected?.id === value
          ? selected.code + ' · ' + selected.name + ' · ' + PRODUCT_UNIT_LABELS[selected.unit]
          : 'Seleccioná un producto'}
      </p>
      <Label htmlFor={id + '-type'}>Tipo de {label.toLowerCase()}</Label>
      <select
        id={id + '-type'}
        value={type}
        className="h-9 w-full rounded border px-2"
        onChange={(e) => {
          setType(e.target.value as Product['type']);
          setPage(1);
        }}
      >
        {types.map((option) => (
          <option key={option} value={option}>
            {PRODUCT_TYPE_LABELS[option]}
          </option>
        ))}
      </select>
      <Label htmlFor={id + '-search'}>Buscar {label.toLowerCase()}</Label>
      <Input
        id={id + '-search'}
        type="search"
        maxLength={100}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {products.isPending && <p role="status">Cargando productos…</p>}
      <ErrorNotice error={products.error} />
      {products.isError && (
        <Button type="button" variant="outline" onClick={() => void products.refetch()}>
          Reintentar productos
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        {products.data?.data
          .filter((p) => p.id !== excludeId && (!output || p.isLotTracked))
          .map((p) => (
            <Button
              type="button"
              key={p.id}
              aria-pressed={p.id === value}
              variant={p.id === value ? 'default' : 'outline'}
              onClick={() => {
                setSelected(p);
                onChange(p.id);
              }}
            >
              {p.code} · {p.name} ({PRODUCT_UNIT_LABELS[p.unit]})
            </Button>
          ))}
      </div>
      {output && (
        <p className="text-sm text-muted-foreground">
          Se muestran productos activos con seguimiento por lotes habilitado.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || products.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={!products.data || products.isError || page >= totalPages || products.isFetching}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
