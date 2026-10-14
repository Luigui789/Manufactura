import { useId, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { ErrorNotice } from '@/components/ErrorNotice';

import { getProducts } from '@/features/inventory/api/products';

import { getWarehouses } from '@/features/inventory/api/warehouses';

import { getSuppliers } from '../api/suppliers';

type Selection = { id: string; code: string; name: string; isActive: boolean };

export function OrderCatalogPicker({
  kind,
  value,
  onChange,
  initialLabel,
  error,
  allowInactive = false,
}: {
  kind: 'supplier' | 'product' | 'warehouse';
  value: string;
  onChange: (id: string) => void;
  initialLabel?: string;
  error?: string;
  allowInactive?: boolean;
}) {
  const id = useId();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const [type, setType] = useState<'RAW_MATERIAL' | 'CONSUMABLE'>('RAW_MATERIAL');

  const [selected, setSelected] = useState(initialLabel ?? 'Sin selección');

  const labels = { supplier: 'Proveedor', product: 'Producto', warehouse: 'Almacén' };

  const result = useQuery({
    queryKey: ['purchase-catalog', kind, page, search, type, allowInactive],
    queryFn: async ({ signal }) => {
      if (kind === 'supplier') return getSuppliers(page, 20, signal);

      if (kind === 'product')
        return getProducts(
          page,
          20,
          { type, isActive: true, ...(search.trim() ? { search: search.trim() } : {}) },
          signal,
        );

      return getWarehouses(
        page,
        20,
        { isActive: true, ...(search.trim() ? { search: search.trim() } : {}) },
        signal,
      );
    },
  });

  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{labels[kind]}</legend>

      <p>Selección: {selected}</p>

      {kind !== 'supplier' && (
        <>
          <Label htmlFor={id}>Buscar {labels[kind].toLowerCase()}</Label>
          <Input
            id={id}
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </>
      )}

      {kind === 'product' && (
        <select
          aria-label="Tipo de producto"
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setPage(1);
          }}
        >
          <option value="RAW_MATERIAL">Materia prima</option>
          <option value="CONSUMABLE">Consumible</option>
        </select>
      )}

      {result.isPending && <p role="status">Cargando {labels[kind].toLowerCase()}…</p>}

      <ErrorNotice error={result.error} />

      {result.isError && (
        <Button type="button" variant="outline" onClick={() => void result.refetch()}>
          Reintentar catálogo
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {result.data?.data
          .filter((entry: Selection) => allowInactive || entry.isActive)
          .map((entry: Selection) => (
            <Button
              type="button"
              key={entry.id}
              variant={value === entry.id ? 'default' : 'outline'}
              aria-pressed={value === entry.id}
              onClick={() => {
                setSelected(entry.code + ' · ' + entry.name);
                onChange(entry.id);
              }}
            >
              {entry.code} · {entry.name}
            </Button>
          ))}
      </div>

      {result.data &&
        !result.data.data.some((entry: Selection) => allowInactive || entry.isActive) && (
          <p>No hay opciones disponibles en esta página.</p>
        )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || result.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Anteriores
        </Button>
        <span>Página {page}</span>
        <Button
          type="button"
          variant="outline"
          disabled={
            !result.data ||
            result.isError ||
            result.isFetching ||
            page * result.data.meta.limit >= result.data.meta.total
          }
          onClick={() => setPage(page + 1)}
        >
          Más opciones
        </Button>
      </div>

      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
