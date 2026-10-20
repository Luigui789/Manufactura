import { EntitySummary, LoadingState } from '@/components/erp';
import { unitLabel, productTypeLabel } from '@/lib/presentation';
import { useEffect, useId, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { ErrorNotice } from '@/components/ErrorNotice';

import { getProducts } from '@/features/inventory/api/products';

import { getWarehouses } from '@/features/inventory/api/warehouses';

import { getSuppliers } from '../api/suppliers';

type Selection = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  unit?: string;
  type?: string;
};

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
  const summaryRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(!value);

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

  useEffect(() => {
    if (value && !choosing) summaryRef.current?.focus();
    else if (choosing) searchRef.current?.focus();
  }, [value, choosing]);
  return (
    <fieldset
      aria-describedby={error ? id + '-error' : undefined}
      className="min-w-0 space-y-3 rounded-md border bg-background p-4"
    >
      <legend className="px-1 text-sm font-semibold">{labels[kind]}</legend>

      {value && (
        <div ref={summaryRef} tabIndex={-1}>
          <EntitySummary label={labels[kind] + ' seleccionado'} onChange={() => setChoosing(true)}>
            {selected}
          </EntitySummary>
        </div>
      )}
      {!value && (
        <p className="text-sm text-muted-foreground">
          Seleccioná{' '}
          {kind === 'supplier' ? 'un proveedor' : kind === 'product' ? 'un producto' : 'un almacén'}
          .
        </p>
      )}
      {(choosing || !value) && (
        <div className="space-y-3">
          {kind === 'supplier' && (
            <p className="text-xs text-muted-foreground">
              Proveedores por página. Usá la paginación para consultar más opciones.
            </p>
          )}

          {kind !== 'supplier' && (
            <>
              <Label htmlFor={id}>Buscar {labels[kind].toLowerCase()}</Label>
              <Input
                id={id}
                ref={searchRef}
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

          {result.isPending && (
            <LoadingState label={'Cargando ' + labels[kind].toLowerCase() + '…'} />
          )}

          <ErrorNotice error={result.error} />

          {result.isError && (
            <Button type="button" variant="outline" onClick={() => void result.refetch()}>
              Reintentar catálogo
            </Button>
          )}

          <ul className="divide-y rounded-md border px-3">
            {result.data?.data
              .filter((entry: Selection) => allowInactive || entry.isActive)
              .map((entry: Selection) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="text-sm">
                    <p>
                      <strong>{entry.code}</strong> · {entry.name}
                    </p>
                    {entry.unit && (
                      <p className="text-xs text-muted-foreground">
                        {entry.type && productTypeLabel(entry.type) + ' · '}
                        {unitLabel(entry.unit)}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    aria-label={entry.code + ' · ' + entry.name}
                    variant={value === entry.id ? 'default' : 'outline'}
                    aria-pressed={value === entry.id}
                    onClick={() => {
                      setSelected(entry.code + ' · ' + entry.name);
                      onChange(entry.id);
                      setChoosing(false);
                    }}
                  >
                    Seleccionar
                  </Button>
                </li>
              ))}
          </ul>

          {result.data &&
            !result.data.data.some((entry: Selection) => allowInactive || entry.isActive) && (
              <p>No hay opciones disponibles en esta página.</p>
            )}

          <div
            className="flex flex-wrap gap-3"
            hidden={!result.data || result.data.meta.total <= result.data.meta.limit}
          >
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
        </div>
      )}
      {error && (
        <p id={id + '-error'} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
