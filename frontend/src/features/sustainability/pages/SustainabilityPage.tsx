import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, LoadingState, PageHeader, Pagination, StatusBadge } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
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
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { useSustainabilityOrders } from '../api/sustainability';
import { CarbonDisclaimer } from '../components/CarbonDisclaimer';
import { FOOTPRINT_STATUS_LABELS, kg, trimDecimal } from '../labels';

export function SustainabilityPage() {
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const query = useSustainabilityOrders({ page, search, footprintStatus: status || undefined });
  return (
    <section className="space-y-6">
      <PageHeader
        title="Sostenibilidad"
        description="Huella parcial de carbono por orden de producción completada y materiales circulares valorizados."
        breadcrumbs={[{ label: 'Análisis' }, { label: 'Sostenibilidad' }]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/sustainability/emission-factors">Factores de emisión</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/sustainability/circular-materials">Materiales circulares</Link>
            </Button>
          </>
        }
      />
      <CarbonDisclaimer />
      <form
        role="search"
        className="flex flex-wrap items-end gap-3 border-y py-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(input.trim());
          setPage(1);
        }}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="sustainability-search">Buscar OP, producto o lote</Label>
          <Input
            id="sustainability-search"
            type="search"
            maxLength={100}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sustainability-status">Estado de huella</Label>
          <select
            id="sustainability-status"
            className="h-9 rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="NONE">{FOOTPRINT_STATUS_LABELS.NONE}</option>
            <option value="DRAFT">{FOOTPRINT_STATUS_LABELS.DRAFT}</option>
            <option value="FINALIZED">{FOOTPRINT_STATUS_LABELS.FINALIZED}</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {query.isPending && <LoadingState label="Cargando órdenes completadas…" />}
      <ErrorNotice error={query.error} />
      {query.isError && (
        <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
          Reintentar
        </Button>
      )}
      {query.data?.data.length === 0 && (
        <EmptyState
          title="No hay órdenes completadas para estos filtros."
          description="La huella solo se calcula para órdenes de producción completadas."
        />
      )}
      {!!query.data?.data.length && (
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label="Órdenes completadas y su huella">
            <TableHeader>
              <TableRow>
                {[
                  'Orden',
                  'Producto',
                  'Lote',
                  'Cantidad producida',
                  'Huella',
                  'Huella total',
                  'Intensidad',
                  'Acciones',
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.data.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.number}</TableCell>
                  <TableCell className="whitespace-normal">
                    {order.product.code} · {order.product.name}
                  </TableCell>
                  <TableCell>{order.lot?.code ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">
                    {trimDecimal(order.quantityProduced, 0)}{' '}
                    {PRODUCT_UNIT_LABELS[order.product.unit]}
                  </TableCell>
                  <TableCell>
                    <span className="sr-only">Estado de huella: </span>
                    {order.footprint ? (
                      <StatusBadge status={order.footprint.status} />
                    ) : (
                      FOOTPRINT_STATUS_LABELS.NONE
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {order.footprint?.totalKgCo2e ? kg(order.footprint.totalKgCo2e) : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {order.footprint?.kgCo2ePerOutputUnit
                      ? `${kg(order.footprint.kgCo2ePerOutputUnit)} / ${PRODUCT_UNIT_LABELS[order.product.unit].toLowerCase()}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost">
                      <Link to={`/sustainability/production-orders/${order.id}`}>Ver huella</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {query.data && (
        <Pagination
          page={page}
          pages={Math.max(1, Math.ceil(query.data.meta.total / query.data.meta.limit))}
          total={query.data.meta.total}
          label="órdenes completadas"
          onPageChange={setPage}
          busy={query.isFetching}
          unavailable={query.isError}
        />
      )}
    </section>
  );
}
