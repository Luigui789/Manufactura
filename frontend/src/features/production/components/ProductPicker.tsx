import { useEffect, useId, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, EntitySummary, LoadingState, Pagination } from '@/components/erp';
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
  const searchRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const types: Product['type'][] = output
    ? ['FINISHED_GOOD', 'INTERMEDIATE']
    : ['RAW_MATERIAL', 'CONSUMABLE', 'INTERMEDIATE'];
  const [type, setType] = useState<Product['type']>(types[0]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [changing, setChanging] = useState(false);
  const products = useProducts(page, {
    type,
    isActive: true,
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const totalPages = products.data
    ? Math.max(1, Math.ceil(products.data.meta.total / products.data.meta.limit))
    : 1;
  const results = products.data?.data.filter(
    (product) => product.id !== excludeId && (!output || product.isLotTracked),
  );
  const chosen =
    selected?.id === value ? selected : products.data?.data.find((product) => product.id === value);
  const showResults = !chosen || changing;

  useEffect(() => {
    if (changing) searchRef.current?.focus();
    else if (selected?.id === value) summaryRef.current?.focus();
  }, [changing, selected, value]);

  return (
    <fieldset
      className="min-w-0 space-y-4"
      aria-describedby={[id + '-help', error ? id + '-error' : ''].filter(Boolean).join(' ')}
      aria-invalid={!!error}
    >
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <p id={id + '-help'} className="text-sm text-muted-foreground">
        {output
          ? 'Busca un producto terminado o intermedio. Se muestran productos activos con seguimiento por lotes habilitado.'
          : 'Busca una materia prima, un consumible o un producto intermedio activo.'}
      </p>
      {chosen && (
        <EntitySummary label="Producto seleccionado" onChange={() => setChanging(true)}>
          <div
            ref={summaryRef}
            tabIndex={-1}
            className="min-w-0 space-y-1 outline-none"
            aria-live="polite"
          >
            <p className="break-words font-medium">
              {chosen.code} · {chosen.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {PRODUCT_TYPE_LABELS[chosen.type]} · {PRODUCT_UNIT_LABELS[chosen.unit]}
            </p>
          </div>
        </EntitySummary>
      )}
      {showResults && (
        <div className="space-y-4">
          {chosen && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Selecciona otro producto</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(false)}>
                Conservar selección
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor={id + '-type'}>Tipo de {label.toLowerCase()}</Label>
              <select
                id={id + '-type'}
                value={type}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                onChange={(event) => {
                  setType(event.target.value as Product['type']);
                  setPage(1);
                }}
              >
                {types.map((option) => (
                  <option key={option} value={option}>
                    {PRODUCT_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={id + '-search'}>Buscar {label.toLowerCase()}</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  ref={searchRef}
                  id={id + '-search'}
                  type="search"
                  placeholder="Código o nombre"
                  className="pl-9"
                  maxLength={100}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
          {products.isPending && <LoadingState label="Cargando productos…" />}
          <ErrorNotice error={products.error} />
          {products.isError && (
            <Button
              type="button"
              variant="outline"
              disabled={products.isFetching}
              onClick={() => void products.refetch()}
            >
              Reintentar productos
            </Button>
          )}
          {results && results.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <Table aria-label={'Resultados de ' + label.toLowerCase()}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Selección</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((product) => (
                    <TableRow
                      key={product.id}
                      data-state={product.id === value ? 'selected' : undefined}
                    >
                      <TableCell className="min-w-32 whitespace-normal">
                        <p className="break-words font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.code}</p>
                      </TableCell>
                      <TableCell>{PRODUCT_UNIT_LABELS[product.unit]}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          aria-label={
                            'Seleccionar ' +
                            product.code +
                            ' · ' +
                            product.name +
                            ' (' +
                            PRODUCT_UNIT_LABELS[product.unit] +
                            ')'
                          }
                          aria-pressed={product.id === value}
                          variant={product.id === value ? 'secondary' : 'outline'}
                          onClick={() => {
                            setSelected(product);
                            setChanging(false);
                            onChange(product.id);
                          }}
                        >
                          {product.id === value ? (
                            <>
                              <Check className="size-4" aria-hidden="true" />
                              Seleccionado
                            </>
                          ) : (
                            'Seleccionar'
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {results?.length === 0 && (
            <EmptyState
              title="No hay productos disponibles en esta página"
              description={
                search.trim()
                  ? 'Prueba con otro código o nombre, o cambia el tipo de producto.'
                  : 'Cambia el tipo de producto o revisa otra página de resultados.'
              }
            />
          )}
          {products.data && (
            <Pagination
              page={page}
              pages={totalPages}
              label={'productos de ' + label.toLowerCase()}
              onPageChange={setPage}
              busy={products.isFetching}
              unavailable={products.isError}
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
