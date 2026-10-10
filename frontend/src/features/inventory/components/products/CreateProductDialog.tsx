import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useCreateProduct } from '../../api/product-hooks';
import { createProductSchema, PRODUCT_TYPES, UNITS_OF_MEASURE } from '../../schemas';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '../../product-labels';
import type { CreateProductData } from '../../types';

export function CreateProductDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useCreateProduct();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateProductData>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      code: '',
      name: '',
      category: '',
      type: 'RAW_MATERIAL',
      unit: 'UNIT',
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto"
        showCloseButton={!mutation.isPending}
      >
        <DialogHeader>
          <DialogTitle>Crear producto</DialogTitle>
          <DialogDescription>
            Registra un producto o materia prima. Se creará con estado activo.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((data) =>
            mutation.mutate(data, {
              onSuccess: (product) => onSuccess(`Producto ${product.code} creado correctamente`),
            }),
          )}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <FormField
              id="new-product-code"
              label="Código"
              autoComplete="off"
              error={errors.code?.message}
              {...register('code')}
            />

            <FormField
              id="new-product-name"
              label="Nombre"
              autoComplete="off"
              error={errors.name?.message}
              {...register('name')}
            />

            <FormField
              id="new-product-category"
              label="Categoría"
              autoComplete="off"
              error={errors.category?.message}
              {...register('category')}
            />

            <div className="space-y-2">
              <Label htmlFor="new-product-type">Tipo de producto</Label>
              <select
                id="new-product-type"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? 'new-product-type-error' : undefined}
                {...register('type')}
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PRODUCT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p id="new-product-type-error" className="text-sm text-destructive">
                  {errors.type.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-product-unit">Unidad de medida</Label>
              <select
                id="new-product-unit"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-invalid={!!errors.unit}
                aria-describedby={errors.unit ? 'new-product-unit-error' : undefined}
                {...register('unit')}
              >
                {UNITS_OF_MEASURE.map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p id="new-product-unit-error" className="text-sm text-destructive">
                  {errors.unit.message}
                </p>
              )}
            </div>
          </fieldset>

          <ErrorNotice error={mutation.error} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Crear producto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
