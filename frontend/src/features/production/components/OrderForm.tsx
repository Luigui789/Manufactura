import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
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
import { EmptyState, EntitySummary, FormSection, LoadingState, Pagination } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useWarehouses } from '@/features/inventory/api/hooks';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import { useBoms, type Bom } from '../api/boms';
import { createProductionOrderSchema, type ProductionOrderFormValues } from '../order-schemas';

export function OrderForm({
  initial,
  selectionSummary,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  initial: ProductionOrderFormValues;
  selectionSummary?: { bom: string; warehouse: string };
  pending: boolean;
  error: Error | null;
  onSubmit: (value: ProductionOrderFormValues) => void;
  onClose?: () => void;
}) {
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductionOrderFormValues>({
    resolver: zodResolver(createProductionOrderSchema),
    defaultValues: initial,
  });
  const [bomPage, setBomPage] = useState(1);
  const [bomSearch, setBomSearch] = useState('');
  const [warehousePage, setWarehousePage] = useState(1);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [changingBom, setChangingBom] = useState(false);
  const [changingWarehouse, setChangingWarehouse] = useState(false);
  const [pickedBom, setPickedBom] = useState<Bom | null>(null);
  const bomSearchRef = useRef<HTMLInputElement>(null);
  const warehouseSearchRef = useRef<HTMLInputElement>(null);
  const bomSummaryRef = useRef<HTMLDivElement>(null);
  const warehouseSummaryRef = useRef<HTMLDivElement>(null);
  const boms = useBoms(bomPage, bomSearch.trim(), 'active');
  const warehouses = useWarehouses(warehousePage, { isActive: true, search: warehouseSearch });
  const versionId = useWatch({ control, name: 'bomVersionId' });
  const warehouseId = useWatch({ control, name: 'warehouseId' });
  const quantity = useWatch({ control, name: 'quantityPlanned' });
  const selectedWarehouse = warehouses.data?.data.find((warehouse) => warehouse.id === warehouseId);
  // Labels and version IDs survive searches, pagination, and historical draft edits.
  const [bomLabel, setBomLabel] = useState(selectionSummary?.bom ?? 'Sin fórmula seleccionada');
  const [warehouseLabel, setWarehouseLabel] = useState(
    selectionSummary?.warehouse ?? 'Sin almacén seleccionado',
  );
  const selectedBom =
    boms.data?.data.find((bom) => bom.versions.some((version) => version.id === versionId)) ??
    (pickedBom?.versions.some((version) => version.id === versionId) ? pickedBom : undefined);
  const selectedVersion = selectedBom?.versions.find((version) => version.id === versionId);
  const bomPages = boms.data
    ? Math.max(1, Math.ceil(boms.data.meta.total / boms.data.meta.limit))
    : 1;
  const warehousePages = warehouses.data
    ? Math.max(1, Math.ceil(warehouses.data.meta.total / warehouses.data.meta.limit))
    : 1;

  useEffect(() => {
    if (changingBom) bomSearchRef.current?.focus();
    else if (pickedBom) bomSummaryRef.current?.focus();
  }, [changingBom, pickedBom]);
  useEffect(() => {
    if (changingWarehouse) warehouseSearchRef.current?.focus();
    else if (warehouseId && warehouseId !== initial.warehouseId)
      warehouseSummaryRef.current?.focus();
  }, [changingWarehouse, warehouseId, initial.warehouseId]);

  return (
    <form noValidate className="space-y-7" aria-busy={pending} onSubmit={handleSubmit(onSubmit)}>
      <fieldset disabled={pending} className="space-y-7">
        <FormSection
          title="1. Fórmula y producto"
          description="Elige una fórmula activa. Su versión define el producto y los componentes de la orden."
        >
          {versionId && (
            <EntitySummary label="Fórmula seleccionada" onChange={() => setChangingBom(true)}>
              <div
                ref={bomSummaryRef}
                tabIndex={-1}
                className="space-y-2 outline-none"
                aria-live="polite"
              >
                <p className="font-medium">{bomLabel}</p>
                {selectedBom && (
                  <p className="text-sm text-muted-foreground">
                    Producto: {selectedBom.product.code} · {selectedBom.product.name}
                  </p>
                )}
                {selectedVersion && selectedBom ? (
                  <p className="text-sm text-muted-foreground">
                    Cantidad base: {selectedVersion.outputQuantity}{' '}
                    {PRODUCT_UNIT_LABELS[selectedBom.product.unit]} · Versión{' '}
                    {selectedVersion.version}
                    {selectedVersion.isActive ? ' activa' : ' histórica'}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Se conserva la versión guardada en el borrador.
                  </p>
                )}
              </div>
            </EntitySummary>
          )}
          {(!versionId || changingBom) && (
            <div className="space-y-4">
              {versionId && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Selecciona otra fórmula</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setChangingBom(false)}
                  >
                    Conservar selección
                  </Button>
                </div>
              )}
              <div className="max-w-lg space-y-2">
                <Label htmlFor="order-bom-search">Buscar fórmula activa</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={bomSearchRef}
                    id="order-bom-search"
                    type="search"
                    className="pl-9"
                    placeholder="Nombre de la fórmula o producto"
                    value={bomSearch}
                    maxLength={100}
                    onChange={(event) => {
                      setBomSearch(event.target.value);
                      setBomPage(1);
                    }}
                    aria-invalid={!!errors.bomVersionId}
                    aria-describedby={errors.bomVersionId ? 'order-bom-error' : undefined}
                  />
                </div>
              </div>
              {boms.isPending && <LoadingState label="Cargando fórmulas…" />}
              <ErrorNotice error={boms.error} />
              {boms.isError && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={boms.isFetching}
                  onClick={() => void boms.refetch()}
                >
                  Reintentar fórmulas
                </Button>
              )}
              {boms.data && boms.data.data.length > 0 && (
                <div className="overflow-hidden rounded-md border">
                  <Table aria-label="Fórmulas disponibles">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fórmula y producto</TableHead>
                        <TableHead>Versión activa</TableHead>
                        <TableHead>Cantidad base</TableHead>
                        <TableHead className="text-right">Selección</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boms.data.data.map((bom) => {
                        const active = bom.versions.find((version) => version.isActive);
                        return (
                          <TableRow
                            key={bom.id}
                            data-state={active?.id === versionId ? 'selected' : undefined}
                          >
                            <TableCell className="whitespace-normal">
                              <p className="font-medium">{bom.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {bom.product.code} · {bom.product.name}
                              </p>
                            </TableCell>
                            <TableCell>
                              {active ? 'Versión ' + active.version : 'Sin versión activa'}
                            </TableCell>
                            <TableCell>
                              {active
                                ? active.outputQuantity +
                                  ' ' +
                                  PRODUCT_UNIT_LABELS[bom.product.unit]
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!active}
                                aria-pressed={active?.id === versionId}
                                aria-label={
                                  'Seleccionar ' +
                                  bom.name +
                                  ' · ' +
                                  bom.product.code +
                                  ' · ' +
                                  (active ? 'v' + active.version : 'Sin versión activa')
                                }
                                onClick={() => {
                                  if (!active) return;
                                  setValue('productId', bom.productId, { shouldValidate: true });
                                  setValue('bomVersionId', active.id, { shouldValidate: true });
                                  setBomLabel(
                                    bom.name + ' · ' + bom.product.name + ' · v' + active.version,
                                  );
                                  setPickedBom(bom);
                                  setChangingBom(false);
                                }}
                              >
                                {active?.id === versionId ? (
                                  <>
                                    <Check className="size-4" aria-hidden="true" />
                                    Seleccionada
                                  </>
                                ) : (
                                  'Seleccionar'
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {boms.data?.data.length === 0 && (
                <EmptyState
                  title="No hay fórmulas que coincidan."
                  description="Prueba con otro nombre. La fórmula debe estar activa y tener una versión activa para seleccionarla."
                />
              )}
              {boms.data && (
                <Pagination
                  page={bomPage}
                  pages={bomPages}
                  label="Paginación de fórmulas"
                  onPageChange={setBomPage}
                  busy={boms.isFetching}
                  unavailable={boms.isError}
                />
              )}
            </div>
          )}
          {errors.bomVersionId && (
            <p id="order-bom-error" role="alert" className="text-sm text-destructive">
              {errors.bomVersionId.message}
            </p>
          )}
          {errors.productId && (
            <p role="alert" className="text-sm text-destructive">
              {errors.productId.message}
            </p>
          )}
        </FormSection>
        <FormSection
          title="2. Almacén"
          description="Selecciona el almacén en el que se consultará la disponibilidad de los componentes."
        >
          {warehouseId && (
            <EntitySummary label="Almacén seleccionado" onChange={() => setChangingWarehouse(true)}>
              <div
                ref={warehouseSummaryRef}
                tabIndex={-1}
                className="space-y-1 outline-none"
                aria-live="polite"
              >
                <p className="font-medium">
                  {selectedWarehouse
                    ? selectedWarehouse.code + ' · ' + selectedWarehouse.name
                    : warehouseLabel}
                </p>
                {selectedWarehouse?.location && (
                  <p className="text-sm text-muted-foreground">{selectedWarehouse.location}</p>
                )}
              </div>
            </EntitySummary>
          )}
          {(!warehouseId || changingWarehouse) && (
            <div className="space-y-4">
              {warehouseId && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Selecciona otro almacén</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setChangingWarehouse(false)}
                  >
                    Conservar selección
                  </Button>
                </div>
              )}
              <div className="max-w-lg space-y-2">
                <Label htmlFor="order-warehouse-search">Buscar almacén activo</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    ref={warehouseSearchRef}
                    id="order-warehouse-search"
                    type="search"
                    className="pl-9"
                    placeholder="Código, nombre o ubicación"
                    value={warehouseSearch}
                    maxLength={100}
                    onChange={(event) => {
                      setWarehouseSearch(event.target.value);
                      setWarehousePage(1);
                    }}
                    aria-invalid={!!errors.warehouseId}
                    aria-describedby={errors.warehouseId ? 'order-warehouse-error' : undefined}
                  />
                </div>
              </div>
              {warehouses.isPending && <LoadingState label="Cargando almacenes…" />}
              <ErrorNotice error={warehouses.error} />
              {warehouses.isError && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={warehouses.isFetching}
                  onClick={() => void warehouses.refetch()}
                >
                  Reintentar almacenes
                </Button>
              )}
              {warehouses.data && warehouses.data.data.length > 0 && (
                <div className="overflow-hidden rounded-md border">
                  <Table aria-label="Almacenes disponibles">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Almacén</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead className="text-right">Selección</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouses.data.data.map((warehouse) => (
                        <TableRow
                          key={warehouse.id}
                          data-state={warehouseId === warehouse.id ? 'selected' : undefined}
                        >
                          <TableCell className="whitespace-normal">
                            <p className="font-medium">{warehouse.name}</p>
                            <p className="text-xs text-muted-foreground">{warehouse.code}</p>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {warehouse.location || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              aria-pressed={warehouseId === warehouse.id}
                              aria-label={'Seleccionar ' + warehouse.code + ' · ' + warehouse.name}
                              onClick={() => {
                                setValue('warehouseId', warehouse.id, { shouldValidate: true });
                                setWarehouseLabel(warehouse.code + ' · ' + warehouse.name);
                                setChangingWarehouse(false);
                              }}
                            >
                              {warehouseId === warehouse.id ? (
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
              {warehouses.data?.data.length === 0 && (
                <EmptyState
                  title="No hay almacenes que coincidan."
                  description="Prueba con otro código, nombre o ubicación."
                />
              )}
              {warehouses.data && (
                <Pagination
                  page={warehousePage}
                  pages={warehousePages}
                  label="Paginación de almacenes"
                  onPageChange={setWarehousePage}
                  busy={warehouses.isFetching}
                  unavailable={warehouses.isError}
                />
              )}
            </div>
          )}
          {errors.warehouseId && (
            <p id="order-warehouse-error" role="alert" className="text-sm text-destructive">
              {errors.warehouseId.message}
            </p>
          )}
        </FormSection>
        <FormSection
          title="3. Planificación"
          description="Indica cuánto vas a fabricar y, si lo necesitas, las fechas previstas."
        >
          <div className="max-w-sm">
            <FormField
              id="order-quantity"
              label="Cantidad planificada"
              inputMode="decimal"
              error={errors.quantityPlanned?.message}
              {...register('quantityPlanned')}
            />
            {selectedBom && (
              <p className="mt-2 text-sm text-muted-foreground">
                Unidad: {PRODUCT_UNIT_LABELS[selectedBom.product.unit]}
              </p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Fechas opcionales en hora de Managua (America/Managua).
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="order-start"
              label="Inicio planificado"
              type="datetime-local"
              error={errors.plannedStartAt?.message}
              {...register('plannedStartAt')}
            />
            <FormField
              id="order-end"
              label="Fin planificado"
              type="datetime-local"
              error={errors.plannedEndAt?.message}
              {...register('plannedEndAt')}
            />
          </div>
        </FormSection>
        <FormSection title="4. Revisar borrador">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Fórmula y versión</dt>
              <dd className="mt-1 font-medium">{bomLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Almacén</dt>
              <dd className="mt-1 font-medium">
                {selectedWarehouse
                  ? selectedWarehouse.code + ' · ' + selectedWarehouse.name
                  : warehouseLabel}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cantidad planificada</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {quantity || 'Sin cantidad'}
                {quantity && selectedBom ? ' ' + PRODUCT_UNIT_LABELS[selectedBom.product.unit] : ''}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Guardar el borrador no reserva ni consume inventario. Podrás revisar la disponibilidad
            de componentes en el detalle de la orden.
          </p>
        </FormSection>
      </fieldset>
      <ErrorNotice error={error} />
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        {onClose && (
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cerrar edición
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar borrador'}
        </Button>
      </div>
    </form>
  );
}
