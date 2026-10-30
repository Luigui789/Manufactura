import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatCalendarDate } from '@/lib/calendar-date';
import { unitLabel, reasonLabel } from '@/lib/presentation';
import { LotProductionDetail } from '@/features/production/components/LotProductionDetail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DetailGrid,
  EmptyState,
  LoadingState,
  PageHeader,
  Pagination,
  StatusBadge,
} from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { InventoryLotOrigin } from '../api/inventory-data';
import { useInventoryLots, useInventoryLot } from '../api/inventory-hooks';
import { LOT_STATUS_LABELS, movementLabel } from '../inventory-labels';
import { BusinessReference } from '../components/BusinessReference';
import { InventoryEntityPicker } from '../components/InventoryEntityPicker';

const displayTime = (value: string) =>
  new Date(value).toLocaleString('es-NI', { timeZone: 'America/Managua' });
const displayDate = (value: string) =>
  new Date(value).toLocaleDateString('es-NI', { timeZone: 'America/Managua' });

function LotOrigin({ origin }: { origin: InventoryLotOrigin | null }) {
  if (!origin) return <span className="text-muted-foreground">Sin origen empresarial</span>;
  if (origin.type === 'PRODUCTION_ORDER')
    return (
      <div className="space-y-1 text-sm">
        <Link
          className="font-mono underline underline-offset-4"
          to={'/production/orders/' + origin.productionOrder.id}
        >
          {origin.productionOrder.number}
        </Link>
        {origin.bomVersion && (
          <p className="text-muted-foreground">Fórmula · versión {origin.bomVersion.version}</p>
        )}
      </div>
    );
  return (
    <div className="space-y-1 text-sm">
      <Link
        className="block underline underline-offset-4"
        to={'/purchases/orders/' + origin.purchaseOrder.id}
      >
        Recepción {origin.purchaseReceipt.number}
      </Link>
      <Link
        className="block font-mono underline underline-offset-4"
        to={'/purchases/orders/' + origin.purchaseOrder.id}
      >
        {origin.purchaseOrder.number}
      </Link>
      <p className="text-muted-foreground">
        Proveedor: {origin.supplier.code} · {origin.supplier.name}
      </p>
    </div>
  );
}

function LotDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useInventoryLot(id);
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-3">
            <DialogTitle className="font-mono text-xl">
              {q.data?.code ?? 'Detalle del lote'}
            </DialogTitle>
            {q.data && <StatusBadge status={q.data.status} />}
          </div>
          <DialogDescription>
            {q.data
              ? q.data.product.code + ' · ' + q.data.product.name
              : 'Consultá el origen, los saldos y los movimientos de este lote.'}
          </DialogDescription>
        </DialogHeader>
        {q.isPending && <LoadingState label="Cargando lote…" />}
        <ErrorNotice error={q.error} />
        {q.isError && (
          <Button variant="outline" onClick={() => void q.refetch()}>
            Reintentar
          </Button>
        )}
        {q.data && (
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="lot-summary-title" className="space-y-3">
              <h3 id="lot-summary-title" className="font-semibold">
                Resumen del lote
              </h3>
              <DetailGrid>
                <div>
                  <dt>Producto</dt>
                  <dd>
                    {q.data.product.code} · {q.data.product.name}
                  </dd>
                </div>
                <div>
                  <dt>Unidad</dt>
                  <dd>{unitLabel(q.data.product.unit)}</dd>
                </div>
                <div>
                  <dt>Fecha de origen · Managua</dt>
                  <dd>{displayDate(q.data.originatedAt)}</dd>
                </div>
                <div>
                  <dt>Vencimiento</dt>
                  <dd>{q.data.expiresAt ? formatCalendarDate(q.data.expiresAt) : 'Sin fecha'}</dd>
                </div>
              </DetailGrid>
            </section>
            <section aria-labelledby="lot-origin-title" className="space-y-3">
              <h3 id="lot-origin-title" className="font-semibold">
                Origen
              </h3>
              <LotOrigin origin={q.data.origin} />
            </section>
            <section aria-labelledby="lot-balances-title" className="space-y-3">
              <h3 id="lot-balances-title" className="font-semibold">
                Existencia por almacén
              </h3>
              <div className="rounded-lg border">
                <Table aria-label="Existencia del lote por almacén">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Almacén</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Unidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.balances.map((balance) => (
                      <TableRow key={balance.warehouse.id}>
                        <TableCell>
                          {balance.warehouse.code} · {balance.warehouse.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {balance.quantity}
                        </TableCell>
                        <TableCell>{unitLabel(q.data!.product.unit)}</TableCell>
                      </TableRow>
                    ))}
                    {q.data.balances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          Sin saldos por almacén.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section aria-labelledby="lot-movements-title" className="space-y-3">
              <h3 id="lot-movements-title" className="font-semibold">
                Movimientos
              </h3>
              <div className="rounded-lg border">
                <Table aria-label="Movimientos del lote">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha y hora · Managua</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Almacén</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {q.data.movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{displayTime(movement.occurredAt)}</TableCell>
                        <TableCell>{movementLabel(movement.type)}</TableCell>
                        <TableCell>
                          {movement.warehouse.code} · {movement.warehouse.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {movement.quantity.startsWith('-')
                            ? movement.quantity
                            : '+' + movement.quantity}
                        </TableCell>
                        <TableCell>
                          <BusinessReference reference={movement.businessReference} />
                        </TableCell>
                        <TableCell>{movement.performedByUser.fullName}</TableCell>
                        <TableCell>{reasonLabel(movement.reason)}</TableCell>
                      </TableRow>
                    ))}
                    {q.data.movements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                          Sin movimientos registrados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
            {q.data.origin?.type === 'PRODUCTION_ORDER' && (
              <LotProductionDetail
                lotId={q.data.id}
                status={q.data.status}
                productionOrderId={q.data.origin.productionOrder.id}
              />
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LotsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('lotId') ?? '';
  const setSelected = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('lotId', id);
    else next.delete('lotId');
    setParams(next);
  };
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState('');
  const [hasStock, setHasStock] = useState(false);
  const q = useInventoryLots(
    {
      ...(search ? { search } : {}),
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(status ? { status } : {}),
      ...(hasStock ? { hasStock: true } : {}),
    },
    page,
  );
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.limit)) : 1;
  const filtered = Boolean(search || productId || warehouseId || status || hasStock);
  return (
    <section className="space-y-6">
      <PageHeader
        title="Lotes"
        description="Consultá existencias, estado y origen de cada lote en compras o producción."
      />
      <form
        role="search"
        aria-label="Filtros de lotes"
        className="space-y-4 rounded-lg border bg-background p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-48 flex-1 space-y-2 text-sm font-medium">
            Buscar código
            <Input
              value={search}
              maxLength={100}
              placeholder="Código del lote, por ejemplo LOT-2026"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            Estado
            <select
              className="block h-10 rounded-md border bg-background px-3"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {Object.entries(LOT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasStock}
              onChange={(event) => {
                setHasStock(event.target.checked);
                setPage(1);
              }}
            />
            Solo con existencia
          </label>
          <Button type="submit" variant="outline">
            Aplicar
          </Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('');
                setProductId('');
                setWarehouseId('');
                setStatus('');
                setHasStock(false);
                setPage(1);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <InventoryEntityPicker
            kind="product"
            value={productId}
            allowClear
            onChange={(value) => {
              setProductId(value);
              setPage(1);
            }}
          />
          <InventoryEntityPicker
            kind="warehouse"
            value={warehouseId}
            allowClear
            onChange={(value) => {
              setWarehouseId(value);
              setPage(1);
            }}
          />
        </div>
      </form>
      {q.isPending && <LoadingState label="Cargando lotes…" />}
      <ErrorNotice error={q.error} />
      {q.isError && (
        <Button variant="outline" onClick={() => void q.refetch()}>
          Reintentar
        </Button>
      )}
      {q.data && (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Lotes">
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Fecha de origen</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Existencia</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.data.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-mono text-xs">{lot.code}</TableCell>
                  <TableCell>
                    {lot.product.code} · {lot.product.name}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lot.status} />
                  </TableCell>
                  <TableCell>
                    <LotOrigin origin={lot.origin} />
                  </TableCell>
                  <TableCell>{displayDate(lot.originatedAt)}</TableCell>
                  <TableCell>{lot.expiresAt ? formatCalendarDate(lot.expiresAt) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {lot.quantityOnHand} {unitLabel(lot.product.unit)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(lot.id)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title="No hay lotes para estos filtros."
                      description="Probá con otro código o limpiá los filtros para ampliar la consulta."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination
        page={page}
        pages={pages}
        total={q.data?.meta.total}
        label="Paginación de lotes"
        onPageChange={setPage}
        busy={q.isFetching}
        unavailable={!q.data || q.isError}
      />
      {selected && <LotDetail key={selected} id={selected} onClose={() => setSelected('')} />}
    </section>
  );
}
