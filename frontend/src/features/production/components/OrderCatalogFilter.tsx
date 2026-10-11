import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getProducts } from '@/features/inventory/api/products';
import { getWarehouses } from '@/features/inventory/api/warehouses';

export function OrderCatalogFilter({
  kind,
  onChange,
}: {
  kind: 'product' | 'warehouse';
  onChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('Todos');
  const label = kind === 'product' ? 'Producto' : 'Almacén';
  const catalog = useQuery({
    queryKey: ['production-order-filter', kind, page, search],
    enabled: expanded,
    queryFn: async ({ signal }) => {
      const result =
        kind === 'product'
          ? await getProducts(page, 20, { search }, signal)
          : await getWarehouses(page, 20, { search }, signal);
      return {
        meta: result.meta,
        data: result.data.map(({ id, code, name, isActive }) => ({ id, code, name, isActive })),
      };
    },
  });
  return (
    <div className="space-y-2 rounded border p-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {label}: {selected}
      </Button>
      {expanded && (
        <>
          <Label htmlFor={'order-filter-' + kind}>Buscar {label.toLowerCase()}</Label>
          <Input
            id={'order-filter-' + kind}
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelected('Todos');
              onChange('');
              setExpanded(false);
            }}
          >
            Todos los {kind === 'product' ? 'productos' : 'almacenes'}
          </Button>
          {catalog.isPending && <p role="status">Cargando opciones…</p>}
          <ErrorNotice error={catalog.error} />
          {catalog.isError && (
            <Button type="button" variant="outline" onClick={() => void catalog.refetch()}>
              Reintentar opciones
            </Button>
          )}
          <ul>
            {catalog.data?.data.map((item) => (
              <li key={item.id}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelected(item.code + ' · ' + item.name);
                    onChange(item.id);
                    setExpanded(false);
                  }}
                >
                  {item.code} · {item.name}
                  {!item.isActive ? ' (inactivo)' : ''}
                </Button>
              </li>
            ))}
          </ul>
          {catalog.data?.data.length === 0 && <p>No hay opciones que coincidan.</p>}
          <div className="flex gap-3 items-center">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1 || catalog.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Opciones anteriores
            </Button>
            <span>Página {page}</span>
            <Button
              type="button"
              variant="outline"
              disabled={
                !catalog.data ||
                catalog.isError ||
                catalog.isFetching ||
                page * catalog.data.meta.limit >= catalog.data.meta.total
              }
              onClick={() => setPage(page + 1)}
            >
              Más opciones
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
