import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntitySummary, LoadingState, Pagination, EmptyState } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useProducts } from '../api/product-hooks';
import { useWarehouses } from '../api/hooks';
import { useInventoryLots } from '../api/inventory-hooks';
import { unitLabel } from '@/lib/presentation';

export type InventoryPickerEntity = {
  id: string;
  code: string;
  name: string;
  isLotTracked?: boolean;
  unit?: string;
  status?: string;
  expiresAt?: string | null;
};
type Entity = InventoryPickerEntity;
type Props = {
  kind: 'product' | 'warehouse' | 'lot';
  value: string;
  onChange: (id: string, entity?: Entity) => void;
  activeOnly?: boolean;
  lotFilters?: Record<string, string | boolean>;
  error?: string;
  allowClear?: boolean;
  disabled?: boolean;
};
type QueryProps = {
  page: number;
  search: string;
  activeOnly?: boolean;
  lotFilters?: Record<string, string | boolean>;
  children: (
    rows: Entity[],
    total: number,
    limit: number,
    pending: boolean,
    error: Error | null,
    retry: () => void,
    busy: boolean,
  ) => React.ReactNode;
};
function Products({ children, page, search, activeOnly }: QueryProps) {
  const q = useProducts(page, { search, ...(activeOnly ? { isActive: true } : {}) });
  return children(
    q.data?.data ?? [],
    q.data?.meta.total ?? 0,
    q.data?.meta.limit ?? 20,
    q.isPending,
    q.error,
    () => void q.refetch(),
    q.isFetching,
  );
}
function Warehouses({ children, page, search, activeOnly }: QueryProps) {
  const q = useWarehouses(page, { search, ...(activeOnly ? { isActive: true } : {}) });
  return children(
    q.data?.data ?? [],
    q.data?.meta.total ?? 0,
    q.data?.meta.limit ?? 20,
    q.isPending,
    q.error,
    () => void q.refetch(),
    q.isFetching,
  );
}
function Lots({ children, page, search, lotFilters }: QueryProps) {
  const q = useInventoryLots({ ...lotFilters, ...(search ? { search } : {}) }, page);
  return children(
    q.data?.data.map((l) => ({
      id: l.id,
      code: l.code,
      name: `${l.product.name} · ${l.status} · Disponible: ${l.quantityOnHand} ${unitLabel(l.product.unit)}`,
      status: l.status,
      expiresAt: l.expiresAt,
    })) ?? [],
    q.data?.meta.total ?? 0,
    q.data?.meta.limit ?? 20,
    q.isPending,
    q.error,
    () => void q.refetch(),
    q.isFetching,
  );
}
export function InventoryEntityPicker({
  kind,
  value,
  onChange,
  activeOnly,
  lotFilters,
  error,
  allowClear,
  disabled = false,
}: Props) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(!allowClear && !value);
  const [selected, setSelected] = useState<Entity>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const label = { product: 'Producto', warehouse: 'Almacén', lot: 'Lote' }[kind];
  const Source = kind === 'product' ? Products : kind === 'warehouse' ? Warehouses : Lots;
  return (
    <fieldset
      className="min-w-0 space-y-3 rounded-md border bg-background p-3"
      aria-describedby={error ? id + '-error' : undefined}
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {value ? (
        <div ref={summaryRef} tabIndex={-1}>
          <EntitySummary
            label={`${label} seleccionado`}
            onChange={
              !disabled
                ? () => {
                    setOpen(true);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }
                : undefined
            }
          >
            {selected?.code} {selected?.name ?? 'Selección conservada'}
            {selected?.unit && <p>{unitLabel(selected.unit)}</p>}
          </EntitySummary>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          {label}: {allowClear ? 'Todos' : 'Seleccionar'}
        </Button>
      )}
      {allowClear && value && (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            onChange('');
            setSelected(undefined);
            setOpen(false);
          }}
        >
          Quitar filtro de {label.toLowerCase()}
        </Button>
      )}
      {open && (
        <>
          <label htmlFor={id} className="text-sm">
            Buscar {label.toLowerCase()}
          </label>
          <Input
            ref={searchRef}
            id={id}
            type="search"
            disabled={disabled}
            placeholder="Código o nombre"
            maxLength={100}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Source page={page} search={search} activeOnly={activeOnly} lotFilters={lotFilters}>
            {(rows, total, limit, pending, queryError, retry, busy) => (
              <>
                {pending && <LoadingState label="Cargando opciones…" />}
                <ErrorNotice error={queryError} />
                {queryError && (
                  <Button type="button" variant="outline" onClick={retry}>
                    Reintentar opciones
                  </Button>
                )}
                {!pending && !queryError && rows.length === 0 && (
                  <EmptyState
                    title="No hay opciones que coincidan."
                    description="Probá otro código o nombre."
                  />
                )}
                <ul className="divide-y">
                  {rows.map((entity) => (
                    <li key={entity.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 break-words text-sm">
                        <strong>{entity.code}</strong> · {entity.name}
                        {entity.expiresAt && (
                          <span className="block text-xs text-muted-foreground">
                            Vence: {entity.expiresAt}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        aria-label={`Seleccionar ${entity.code} · ${entity.name}`}
                        onClick={() => {
                          setSelected(entity);
                          onChange(entity.id, entity);
                          setOpen(false);
                          requestAnimationFrame(() => summaryRef.current?.focus());
                        }}
                      >
                        Seleccionar
                      </Button>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={page}
                  pages={Math.max(1, Math.ceil(total / limit))}
                  total={total}
                  label={`Paginación de ${label.toLowerCase()}`}
                  onPageChange={setPage}
                  busy={busy}
                  unavailable={!!queryError}
                />
              </>
            )}
          </Source>
        </>
      )}
      {error && (
        <p id={id + '-error'} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
