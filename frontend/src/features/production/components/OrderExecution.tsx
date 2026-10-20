import { formatCalendarDate } from '@/lib/calendar-date';
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import {
  DetailGrid,
  EmptyState,
  FormSection,
  LoadingState,
  Pagination,
  SuccessNotice,
} from '@/components/erp';
import { getInventoryLots, type InventoryLotRow } from '@/features/inventory/api/inventory-data';
import { PRODUCT_UNIT_LABELS } from '@/features/inventory/product-labels';
import type { Product } from '@/features/inventory/types';
import {
  useCompleteOrder,
  useStartOrder,
  type OrderRequirements,
  type ProductionOrder,
} from '../api/orders';
import { completeOrderSchema, quantityUnits, type CompleteOrderValues } from '../execution-schema';

const unitLabel = (unit?: string) => PRODUCT_UNIT_LABELS[unit as Product['unit']] ?? 'Unidad';

function LotSelection({
  product,
  warehouseId,
  selected,
  onChange,
}: {
  product: OrderRequirements['items'][number]['product'];
  warehouseId: string;
  selected: Array<{ lotId: string; quantity: string }>;
  onChange: (values: Array<{ lotId: string; quantity: string }>) => void;
}) {
  const id = useId();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [knownLots, setKnownLots] = useState<Record<string, InventoryLotRow>>({});
  const filters = {
    productId: product.id,
    warehouseId,
    status: 'RELEASED',
    hasStock: true,
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const lots = useQuery({
    queryKey: ['inventory', 'lots', filters, page],
    queryFn: ({ signal }) => getInventoryLots(filters, page, signal),
  });
  const pages = lots.data ? Math.max(1, Math.ceil(lots.data.meta.total / lots.data.meta.limit)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor={id + '-search'}>Buscar lote de {product.name}</Label>
          <Input
            id={id + '-search'}
            type="search"
            placeholder="Buscar por código de lote…"
            maxLength={100}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        {search && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setPage(1);
            }}
          >
            Limpiar búsqueda
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={lots.isFetching}
          onClick={() => void lots.refetch()}
        >
          Actualizar lotes
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Solo lotes liberados con existencia en el almacén de esta orden. Seleccioná un lote y luego
        indicá cuánto consumir.
      </p>
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Lotes disponibles</h4>
        {lots.isPending && <LoadingState label="Cargando lotes liberados…" />}
        <ErrorNotice error={lots.error} />
        {lots.data?.data.length === 0 && (
          <EmptyState
            title="No hay lotes liberados con existencia en este almacén."
            description={
              search
                ? 'Probá otro código o limpiá la búsqueda.'
                : 'Actualizá los lotes después de registrar existencias o liberar un lote.'
            }
          />
        )}
        {!!lots.data?.data.length && (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <caption className="sr-only">Lotes disponibles de {product.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Lote</th>
                  <th scope="col" className="text-right">
                    Disponible
                  </th>
                  <th scope="col">Vencimiento</th>
                  <th scope="col">
                    <span className="sr-only">Selección</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lots.data.data.map((lot) => {
                  const assigned = selected.some((entry) => entry.lotId === lot.id);
                  return (
                    <tr key={lot.id}>
                      <td>
                        <Link
                          className="font-medium underline underline-offset-4"
                          to={'/inventory/lots?lotId=' + lot.id}
                        >
                          {lot.code}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">
                        {lot.quantityOnHand}{' '}
                        <span className="text-muted-foreground">{unitLabel(product.unit)}</span>
                      </td>
                      <td>
                        {lot.expiresAt ? formatCalendarDate(lot.expiresAt) : 'Sin vencimiento'}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={assigned}
                          aria-label={
                            assigned ? lot.code + ' seleccionado' : 'Seleccionar lote ' + lot.code
                          }
                          onClick={() => {
                            setKnownLots((current) => ({ ...current, [lot.id]: lot }));
                            onChange([...selected, { lotId: lot.id, quantity: '' }]);
                          }}
                        >
                          {assigned ? 'Seleccionado' : 'Seleccionar'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          pages={pages}
          label={'Paginación de lotes de ' + product.name}
          onPageChange={setPage}
          busy={lots.isFetching}
          unavailable={lots.isError || !lots.data}
        />
      </div>
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Lotes asignados: {selected.length || 'ninguno'}</h4>
          {selected.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => onChange([])}>
              Limpiar asignación
            </Button>
          )}
        </div>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Seleccioná uno o varios lotes de la tabla y completá el consumo requerido.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <caption className="sr-only">
                Lotes seleccionados de {product.name}; se conservan al buscar y cambiar de página.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Lote seleccionado</th>
                  <th scope="col" className="text-right">
                    Cantidad a consumir ({unitLabel(product.unit)})
                  </th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.map((entry) => {
                  const lot =
                    lots.data?.data.find((item) => item.id === entry.lotId) ??
                    knownLots[entry.lotId];
                  const code = lot?.code ?? 'Lote seleccionado';
                  const valid =
                    completeOrderSchema.shape.allocations.element.shape.lots.element.shape.quantity.safeParse(
                      entry.quantity,
                    ).success;
                  return (
                    <tr key={entry.lotId}>
                      <td className="font-medium">{code}</td>
                      <td className="min-w-44">
                        <Input
                          aria-label={'Cantidad de ' + code}
                          aria-describedby={!valid ? id + '-quantity-' + entry.lotId : undefined}
                          aria-invalid={!valid}
                          inputMode="decimal"
                          className="ml-auto max-w-44 text-right tabular-nums"
                          value={entry.quantity}
                          onChange={(event) =>
                            onChange(
                              selected.map((item) =>
                                item.lotId === entry.lotId
                                  ? { ...item, quantity: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        {!valid && (
                          <p
                            id={id + '-quantity-' + entry.lotId}
                            className="mt-1 text-right text-xs text-destructive"
                          >
                            Ingresá una cantidad positiva con hasta 4 decimales.
                          </p>
                        )}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            onChange(selected.filter((item) => item.lotId !== entry.lotId))
                          }
                        >
                          Quitar {code}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderExecution({
  order,
  requirements,
}: {
  order: ProductionOrder;
  requirements?: OrderRequirements;
}) {
  const id = useId();
  const start = useStartOrder(order.id);
  const complete = useCompleteOrder(order.id);
  const client = useQueryClient();
  const submitting = useRef(false);
  const reviewed = useRef<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const tracked = requirements?.items.filter((item) => item.product.isLotTracked) ?? [];
  const form = useForm<CompleteOrderValues>({
    resolver: zodResolver(completeOrderSchema),
    defaultValues: {
      quantityProduced: order.quantityPlanned,
      expiresAt: '',
      allocations: tracked.map((item) => ({ productId: item.product.id, lots: [] })),
    },
  });
  const allocations = useWatch({ control: form.control, name: 'allocations' }) ?? [];
  const produced = useWatch({ control: form.control, name: 'quantityProduced' });
  const expiry = useWatch({ control: form.control, name: 'expiresAt' });
  const totals = tracked.map((item) => {
    const parsed = completeOrderSchema.shape.allocations.element.shape.lots.safeParse(
      allocations.find((entry) => entry.productId === item.product.id)?.lots ?? [],
    );
    return parsed.success
      ? parsed.data.reduce((sum, lot) => sum + quantityUnits(lot.quantity), 0n)
      : null;
  });
  const allocationsComplete = tracked.every(
    (item, index) => totals[index] === quantityUnits(item.required),
  );
  const pending = start.isPending || complete.isPending;
  const resetReview = () => {
    reviewed.current = null;
    setConfirmComplete(false);
  };
  if (order.status === 'DRAFT')
    return (
      <FormSection
        title="Iniciar producción"
        description="Verificá los requerimientos y la disponibilidad antes de iniciar esta orden."
      >
        <p className="text-sm">
          Iniciar valida disponibilidad. Los materiales seguirán disponibles para otras operaciones:
          esta acción no reserva ni consume existencias.
        </p>
        {!requirements?.canStart && (
          <p className="text-sm text-muted-foreground">
            Revisá los faltantes o las restricciones en Requerimientos y disponibilidad.
          </p>
        )}
        {!confirmStart && (
          <Button
            disabled={pending || !requirements?.canStart}
            onClick={() => setConfirmStart(true)}
          >
            Iniciar producción
          </Button>
        )}
        {confirmStart && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <p className="font-medium">Iniciar {order.number ?? 'esta orden'}</p>
            <p className="text-sm">
              La orden pasará a producción. Al finalizar se volverá a validar la existencia y se
              consumirán los materiales del plan.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  if (submitting.current || pending) return;
                  submitting.current = true;
                  start.mutate(undefined, {
                    onSuccess: () => setConfirmStart(false),
                    onError: () => {
                      setConfirmStart(false);
                      void client.invalidateQueries({ queryKey: ['production-orders'] });
                    },
                    onSettled: () => {
                      submitting.current = false;
                    },
                  });
                }}
              >
                {pending ? 'Iniciando…' : 'Confirmar inicio'}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setConfirmStart(false)}>
                Volver
              </Button>
            </div>
          </div>
        )}
        <ErrorNotice error={start.error} />
        {start.isSuccess && (
          <SuccessNotice>
            Producción iniciada. Los materiales se consumirán al completar la orden.
          </SuccessNotice>
        )}
      </FormSection>
    );
  if (order.status !== 'IN_PROGRESS') return null;
  if (!requirements)
    return (
      <EmptyState
        title="Actualizá los requerimientos antes de completar."
        description="Necesitás la disponibilidad correspondiente a la revisión actual de esta orden."
      />
    );
  return (
    <form
      aria-label="Completar producción"
      className="space-y-6"
      noValidate
      onChange={resetReview}
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          if (pending || submitting.current) return;
          if (quantityUnits(values.quantityProduced) > quantityUnits(order.quantityPlanned)) {
            resetReview();
            form.setError(
              'quantityProduced',
              { message: 'No puede superar la cantidad planificada' },
              { shouldFocus: true },
            );
            return;
          }
          for (const item of tracked) {
            const total =
              values.allocations
                .find((entry) => entry.productId === item.product.id)
                ?.lots.reduce((sum, lot) => sum + quantityUnits(lot.quantity), 0n) ?? 0n;
            if (total !== quantityUnits(item.required)) {
              resetReview();
              form.setError('root', {
                message: 'Asigna exactamente ' + item.required + ' de ' + item.product.name,
              });
              return;
            }
          }
          const snapshot = JSON.stringify(values);
          if (!confirmComplete || reviewed.current !== snapshot) {
            reviewed.current = snapshot;
            setConfirmComplete(true);
            return;
          }
          submitting.current = true;
          complete.mutate(
            { ...values, expiresAt: values.expiresAt || undefined },
            {
              onError: () => {
                resetReview();
                void client.invalidateQueries({ queryKey: ['inventory', 'lots'] });
                void client.invalidateQueries({ queryKey: ['production-orders'] });
              },
              onSettled: () => {
                submitting.current = false;
              },
            },
          );
        })(event);
      }}
    >
      <fieldset disabled={pending} className="space-y-6">
        <FormSection
          title="Completar producción"
          description="Registrá la cantidad real obtenida. El consumo de materiales corresponde a toda la cantidad planificada, aunque la salida real sea menor."
        >
          <DetailGrid>
            <div>
              <dt>Producto fabricado</dt>
              <dd>
                {order.product
                  ? order.product.code + ' · ' + order.product.name
                  : 'Producto de la orden'}
              </dd>
            </div>
            <div>
              <dt>Almacén de consumo y salida</dt>
              <dd>
                {order.warehouse
                  ? order.warehouse.code + ' · ' + order.warehouse.name
                  : 'Almacén de la orden'}
              </dd>
            </div>
            <div>
              <dt>Cantidad planificada</dt>
              <dd className="tabular-nums">
                {order.quantityPlanned} {unitLabel(order.product?.unit)}
              </dd>
            </div>
            <div>
              <dt>Fórmula</dt>
              <dd>
                {order.bomVersion
                  ? order.bomVersion.bom.name + ' · v' + order.bomVersion.version
                  : 'Versión guardada en la orden'}
              </dd>
            </div>
          </DetailGrid>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={id + '-produced'}
              label="Cantidad producida real"
              aria-label="Cantidad producida real"
              required
              inputMode="decimal"
              helper={
                'Indicá la salida real en ' +
                unitLabel(order.product?.unit).toLowerCase() +
                '. Debe ser positiva y no superar el plan.'
              }
              error={form.formState.errors.quantityProduced?.message}
              {...form.register('quantityProduced')}
            />
            <FormField
              id={id + '-expiry'}
              label="Vencimiento del lote (opcional)"
              type="date"
              helper="Se aplicará al nuevo lote de producto fabricado."
              error={form.formState.errors.expiresAt?.message}
              {...form.register('expiresAt')}
            />
          </div>
        </FormSection>
        <FormSection
          title="Materiales a consumir"
          description="El consumo de cada componente se calcula con la versión de fórmula guardada en esta orden."
        >
          <div className="overflow-x-auto">
            <table className="erp-table">
              <caption className="sr-only">Consumo planificado de materiales</caption>
              <thead>
                <tr>
                  <th scope="col">Componente</th>
                  <th scope="col" className="text-right">
                    Consumo requerido
                  </th>
                  <th scope="col">Asignación</th>
                </tr>
              </thead>
              <tbody>
                {requirements.items.map((item) => (
                  <tr key={item.product.id}>
                    <td>
                      <span className="font-medium">{item.product.code}</span> · {item.product.name}
                    </td>
                    <td className="text-right tabular-nums">
                      {item.required} {unitLabel(item.product.unit)}
                    </td>
                    <td>
                      {item.product.isLotTracked
                        ? 'Seleccionar lotes liberados'
                        : 'Consumo directo del almacén, sin lote'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {requirements.items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay componentes en los requerimientos.
            </p>
          )}
        </FormSection>
        {tracked.map((item, index) => (
          <FormSection
            key={item.product.id}
            title={item.product.code + ' · ' + item.product.name}
            description={
              'Consumo requerido: ' +
              item.required +
              ' ' +
              unitLabel(item.product.unit) +
              '. La suma asignada debe coincidir exactamente.'
            }
          >
            <p
              aria-live="polite"
              className="rounded-md bg-muted/40 p-3 text-sm font-medium tabular-nums"
            >
              Asignado: {totals[index] === null ? 'Cantidad inválida' : displayUnits(totals[index])}
              {' · '}Restante:{' '}
              {totals[index] === null
                ? '—'
                : displayUnits(quantityUnits(item.required) - totals[index])}
            </p>
            <LotSelection
              product={item.product}
              warehouseId={order.warehouseId}
              selected={
                allocations.find((entry) => entry.productId === item.product.id)?.lots ?? []
              }
              onChange={(lots) => {
                form.setValue(`allocations.${index}`, { productId: item.product.id, lots });
                form.clearErrors();
                resetReview();
              }}
            />
          </FormSection>
        ))}
        {form.formState.errors.allocations && (
          <p role="alert" className="text-sm text-destructive">
            Revisá las cantidades de los lotes asignados.
          </p>
        )}
        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}
        <ErrorNotice error={complete.error} />
        {confirmComplete && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <h3 className="font-semibold">
              Confirmar finalización de {order.number ?? 'la orden'}
            </h3>
            <p className="text-sm">
              Se consumirán los materiales de {order.quantityPlanned}{' '}
              {unitLabel(order.product?.unit).toLowerCase()} del plan y se creará un lote con{' '}
              {produced} {unitLabel(order.product?.unit).toLowerCase()} de producción real
              {expiry
                ? ', con vencimiento ' +
                  new Date(expiry + 'T00:00:00Z').toLocaleDateString('es-NI', { timeZone: 'UTC' })
                : ', sin vencimiento indicado'}
              .
            </p>
            <p className="text-sm text-muted-foreground">
              Si el producto requiere inspección de calidad, el lote ingresará en cuarentena; de lo
              contrario, quedará liberado. La existencia se volverá a validar al confirmar.
            </p>
          </div>
        )}
        {!allocationsComplete && (
          <p className="text-sm text-muted-foreground">
            Completá la asignación exacta de los materiales trazables para revisar la finalización.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !allocationsComplete}>
            {pending
              ? 'Completando…'
              : confirmComplete
                ? 'Confirmar finalización'
                : 'Revisar finalización'}
          </Button>
          {confirmComplete && (
            <Button type="button" variant="outline" disabled={pending} onClick={resetReview}>
              Volver
            </Button>
          )}
        </div>
        {complete.isSuccess && (
          <SuccessNotice>
            Producción completada. Se registraron el consumo planificado y el nuevo lote con la
            cantidad real.
          </SuccessNotice>
        )}
      </fieldset>
    </form>
  );
}

function displayUnits(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return (
    (value < 0n ? '-' : '') +
    String(absolute / 10000n) +
    '.' +
    String(absolute % 10000n).padStart(4, '0')
  );
}
