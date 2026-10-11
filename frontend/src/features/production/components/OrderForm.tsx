import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useWarehouses } from '@/features/inventory/api/hooks';
import { useBoms } from '../api/boms';
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
  const boms = useBoms(bomPage, bomSearch.trim(), 'active');
  const warehouses = useWarehouses(warehousePage, { isActive: true, search: warehouseSearch });
  const versionId = useWatch({ control, name: 'bomVersionId' });
  const warehouseId = useWatch({ control, name: 'warehouseId' });
  const selectedWarehouse = warehouses.data?.data.find((w) => w.id === warehouseId);
  // Keep labels across search/pagination and preserve historical selections during edit.
  const [bomLabel, setBomLabel] = useState(selectionSummary?.bom ?? 'Sin fórmula seleccionada');
  const [warehouseLabel, setWarehouseLabel] = useState(
    selectionSummary?.warehouse ?? 'Sin almacén seleccionado',
  );
  return (
    <form noValidate className="space-y-5 rounded border p-4" onSubmit={handleSubmit(onSubmit)}>
      <fieldset disabled={pending} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="order-bom-search">Buscar fórmula activa</Label>
          <Input
            id="order-bom-search"
            value={bomSearch}
            maxLength={100}
            onChange={(e) => {
              setBomSearch(e.target.value);
              setBomPage(1);
            }}
          />
          <p>Fórmula elegida: {bomLabel}</p>
          {boms.isPending && <p role="status">Cargando fórmulas…</p>}
          <ErrorNotice error={boms.error} />
          {boms.isError && (
            <Button type="button" variant="outline" onClick={() => void boms.refetch()}>
              Reintentar fórmulas
            </Button>
          )}
          <ul className="space-y-2">
            {boms.data?.data.map((bom) => {
              const active = bom.versions.find((v) => v.isActive);
              return (
                <li key={bom.id}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!active}
                    aria-pressed={active?.id === versionId}
                    onClick={() => {
                      if (!active) return;
                      setValue('productId', bom.productId, { shouldValidate: true });
                      setValue('bomVersionId', active.id, { shouldValidate: true });
                      setBomLabel(bom.name + ' · ' + bom.product.name + ' · v' + active.version);
                    }}
                  >
                    {bom.name} · {bom.product.code} ·{' '}
                    {active ? 'v' + active.version : 'Sin versión activa'}
                  </Button>
                </li>
              );
            })}
          </ul>
          {boms.data?.data.length === 0 && <p>No hay fórmulas que coincidan.</p>}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={bomPage <= 1 || boms.isFetching}
              onClick={() => setBomPage(bomPage - 1)}
            >
              Fórmulas anteriores
            </Button>
            <span>Página {bomPage}</span>
            <Button
              type="button"
              variant="outline"
              disabled={
                !boms.data ||
                boms.isError ||
                boms.isFetching ||
                bomPage * boms.data.meta.limit >= boms.data.meta.total
              }
              onClick={() => setBomPage(bomPage + 1)}
            >
              Más fórmulas
            </Button>
          </div>
          {errors.bomVersionId && (
            <p role="alert" className="text-destructive">
              {errors.bomVersionId.message}
            </p>
          )}
          {errors.productId && (
            <p role="alert" className="text-destructive">
              {errors.productId.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="order-warehouse-search">Buscar almacén activo</Label>
          <Input
            id="order-warehouse-search"
            value={warehouseSearch}
            maxLength={100}
            onChange={(e) => {
              setWarehouseSearch(e.target.value);
              setWarehousePage(1);
            }}
          />
          <p>
            Almacén elegido:{' '}
            {selectedWarehouse
              ? selectedWarehouse.code + ' · ' + selectedWarehouse.name
              : warehouseLabel}
          </p>
          {warehouses.isPending && <p role="status">Cargando almacenes…</p>}
          <ErrorNotice error={warehouses.error} />
          {warehouses.isError && (
            <Button type="button" variant="outline" onClick={() => void warehouses.refetch()}>
              Reintentar almacenes
            </Button>
          )}
          <ul>
            {warehouses.data?.data.map((warehouse) => (
              <li key={warehouse.id}>
                <Button
                  type="button"
                  variant="outline"
                  aria-pressed={warehouseId === warehouse.id}
                  onClick={() => {
                    setValue('warehouseId', warehouse.id, { shouldValidate: true });
                    setWarehouseLabel(warehouse.code + ' · ' + warehouse.name);
                  }}
                >
                  {warehouse.code} · {warehouse.name}
                </Button>
              </li>
            ))}
          </ul>
          {warehouses.data?.data.length === 0 && <p>No hay almacenes que coincidan.</p>}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={warehousePage <= 1 || warehouses.isFetching}
              onClick={() => setWarehousePage(warehousePage - 1)}
            >
              Almacenes anteriores
            </Button>
            <span>Página {warehousePage}</span>
            <Button
              type="button"
              variant="outline"
              disabled={
                !warehouses.data ||
                warehouses.isError ||
                warehouses.isFetching ||
                warehousePage * warehouses.data.meta.limit >= warehouses.data.meta.total
              }
              onClick={() => setWarehousePage(warehousePage + 1)}
            >
              Más almacenes
            </Button>
          </div>
          {errors.warehouseId && (
            <p role="alert" className="text-destructive">
              {errors.warehouseId.message}
            </p>
          )}
        </div>
        <FormField
          id="order-quantity"
          label="Cantidad planificada"
          inputMode="decimal"
          error={errors.quantityPlanned?.message}
          {...register('quantityPlanned')}
        />
        <p>Fechas opcionales en hora de Managua (America/Managua).</p>
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
      </fieldset>
      <ErrorNotice error={error} />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar borrador'}
        </Button>
        {onClose && (
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Cerrar edición
          </Button>
        )}
      </div>
    </form>
  );
}
