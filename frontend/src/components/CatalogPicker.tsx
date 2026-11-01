import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorNotice } from '@/components/ErrorNotice';
import { EmptyState, EntitySummary, LoadingState, Pagination } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProducts } from '@/features/inventory/api/products';
import { getWarehouses } from '@/features/inventory/api/warehouses';
import { getSuppliers } from '@/features/purchases/api/suppliers';
import { getCustomers } from '@/features/sales/api/customers';
import { productTypeLabel, unitLabel } from '@/lib/presentation';

type Selection = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  unit?: string;
  type?: string;
  isLotTracked?: boolean;
};
type ProductType = 'RAW_MATERIAL' | 'CONSUMABLE' | 'FINISHED_GOOD';

export function CatalogPicker({
  kind,
  value,
  onChange,
  initialLabel,
  error,
  allowInactive = false,
  productType,
  productTypeOptions = [],
  disabled = false,
}: {
  kind: 'supplier' | 'product' | 'warehouse' | 'customer';
  value: string;
  onChange: (id: string) => void;
  initialLabel?: string;
  error?: string;
  allowInactive?: boolean;
  productType?: ProductType;
  productTypeOptions?: ProductType[];
  disabled?: boolean;
}) {
  const id = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [choosing, setChoosing] = useState(!value);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedProductType, setSelectedProductType] = useState<ProductType>(
    productType ?? productTypeOptions[0] ?? 'RAW_MATERIAL',
  );
  const [selected, setSelected] = useState<Selection | null>(null);
  const labels = {
    supplier: 'Proveedor',
    product: 'Producto',
    warehouse: 'Almacén',
    customer: 'Cliente',
  };

  const result = useQuery({
    queryKey: [
      'catalog-picker',
      kind,
      page,
      search,
      productType ?? selectedProductType,
      allowInactive,
    ],
    queryFn: async ({ signal }) => {
      if (kind === 'supplier') return getSuppliers(page, 20, signal);
      if (kind === 'customer')
        return getCustomers(page, 20, signal, {
          ...(allowInactive ? {} : { isActive: true }),
          ...(search.trim() ? { search: search.trim() } : {}),
        });
      if (kind === 'product')
        return getProducts(
          page,
          20,
          {
            type: productType ?? selectedProductType,
            isActive: true,
            ...(search.trim() ? { search: search.trim() } : {}),
          },
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
  const rows =
    result.data?.data.filter((entry: Selection) => allowInactive || entry.isActive) ?? [];

  useEffect(() => {
    if (value && !choosing) summaryRef.current?.focus();
    else if (choosing) searchRef.current?.focus();
  }, [value, choosing]);

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={error ? id + '-error' : undefined}
      className="min-w-0 space-y-3 rounded-md border bg-background p-4"
    >
      <legend className="px-1 text-sm font-semibold">{labels[kind]}</legend>
      {value && (
        <div ref={summaryRef} tabIndex={-1}>
          <EntitySummary label={labels[kind] + ' seleccionado'} onChange={() => setChoosing(true)}>
            <p>
              {selected
                ? `${selected.code} · ${selected.name}`
                : (initialLabel ?? 'Selección conservada')}
            </p>
            {selected?.unit && (
              <p className="text-xs text-muted-foreground">
                {selected.type && productTypeLabel(selected.type) + ' · '}
                {unitLabel(selected.unit)}
              </p>
            )}
            {kind === 'product' && selected?.isLotTracked !== undefined && (
              <p className="text-xs text-muted-foreground">
                Seguimiento por lote: {selected.isLotTracked ? 'Sí' : 'No'}
              </p>
            )}
          </EntitySummary>
        </div>
      )}
      {!value && (
        <p className="text-sm text-muted-foreground">
          Seleccioná{' '}
          {kind === 'supplier'
            ? 'un proveedor'
            : kind === 'customer'
              ? 'un cliente'
              : kind === 'product'
                ? 'un producto'
                : 'un almacén'}
          .
        </p>
      )}
      {(choosing || !value) && (
        <div className="space-y-3">
          {kind === 'supplier' ? (
            <p className="text-xs text-muted-foreground">
              Proveedores por página. Usá la paginación para consultar más opciones.
            </p>
          ) : (
            <>
              <Label htmlFor={id}>Buscar {labels[kind].toLowerCase()}</Label>
              <Input
                id={id}
                ref={searchRef}
                type="search"
                disabled={disabled}
                placeholder="Código o nombre"
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </>
          )}
          {kind === 'product' && productTypeOptions.length > 1 && (
            <label className="grid max-w-xs gap-1 text-sm">
              Tipo de producto
              <select
                value={selectedProductType}
                disabled={disabled}
                onChange={(event) => {
                  setSelectedProductType(event.target.value as ProductType);
                  setPage(1);
                }}
                className="h-9 rounded-md border bg-background px-3"
              >
                {productTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {productTypeLabel(type)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {result.isPending && (
            <LoadingState label={'Cargando ' + labels[kind].toLowerCase() + '…'} />
          )}
          <ErrorNotice error={result.error} />
          {result.isError && (
            <Button
              type="button"
              variant="outline"
              disabled={result.isFetching}
              onClick={() => void result.refetch()}
            >
              Reintentar catálogo
            </Button>
          )}
          {rows.length > 0 ? (
            <ul className="divide-y rounded-md border px-3">
              {rows.map((entry: Selection) => (
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
                    {kind === 'product' && entry.isLotTracked !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Seguimiento por lote: {entry.isLotTracked ? 'Sí' : 'No'}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    aria-label={entry.code + ' · ' + entry.name}
                    variant={value === entry.id ? 'default' : 'outline'}
                    aria-pressed={value === entry.id}
                    disabled={disabled}
                    onClick={() => {
                      setSelected(entry);
                      onChange(entry.id);
                      setChoosing(false);
                    }}
                  >
                    Seleccionar
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {result.data && rows.length === 0 && (
            <EmptyState
              title={'No hay ' + labels[kind].toLowerCase() + ' disponibles en esta página.'}
              description={
                search.trim()
                  ? 'Prueba otro código o nombre.'
                  : 'Consulta otra página de resultados.'
              }
            />
          )}
          {result.data && (
            <Pagination
              page={page}
              pages={Math.max(1, Math.ceil(result.data.meta.total / result.data.meta.limit))}
              total={result.data.meta.total}
              label={labels[kind].toLowerCase()}
              onPageChange={setPage}
              busy={result.isFetching}
              unavailable={result.isError}
            />
          )}
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
