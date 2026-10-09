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
import { useUpdateProduct } from '../../api/product-hooks';
import { createProductSchema, PRODUCT_TYPES, UNITS_OF_MEASURE } from '../../schemas';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '../../product-labels';
import { onlyDirty } from '../../only-dirty';
import type { CreateProductData, Product } from '../../types';

export function EditProductDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useUpdateProduct();

  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<CreateProductData>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      code: product.code,
      name: product.name,
      category: product.category,
      type: product.type,
      unit: product.unit,
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
          <DialogTitle>Editar producto</DialogTitle>
          <DialogDescription>
            Actualiza los datos del producto. El estado se cambia desde Activar o Desactivar.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((data) => {
            if (mutation.isPending) return;

            const changes = onlyDirty(data, dirtyFields);

            if (Object.keys(changes).length === 0) return;

            mutation.mutate(
              { id: product.id, data: changes },
              {
                onSuccess: (updated) =>
                  onSuccess(`Producto ${updated.code} actualizado correctamente`),
              },
            );
          })}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <FormField
              id="edit-product-code"
              label="Código"
              autoComplete="off"
              error={errors.code?.message}
              {...register('code')}
            />

            <FormField
              id="edit-product-name"
              label="Nombre"
              autoComplete="off"
              error={errors.name?.message}
              {...register('name')}
            />

            <FormField
              id="edit-product-category"
              label="Categoría"
              autoComplete="off"
              error={errors.category?.message}
              {...register('category')}
            />

            <div className="space-y-2">
              <Label htmlFor="edit-product-type">Tipo de producto</Label>
              <select
                id="edit-product-type"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? 'edit-product-type-error' : undefined}
                {...register('type')}
              >
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PRODUCT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p id="edit-product-type-error" className="text-sm text-destructive">
                  {errors.type.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-product-unit">Unidad de medida</Label>
              <select
                id="edit-product-unit"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                aria-invalid={!!errors.unit}
                aria-describedby={errors.unit ? 'edit-product-unit-error' : undefined}
                {...register('unit')}
              >
                {UNITS_OF_MEASURE.map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p id="edit-product-unit-error" className="text-sm text-destructive">
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
            <Button type="submit" disabled={mutation.isPending || !isDirty}>
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
