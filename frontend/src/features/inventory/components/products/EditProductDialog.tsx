import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/FormField';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useUpdateProduct } from '../../api/product-hooks';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '../../product-labels';
import type { Product } from '../../types';

const editProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre admite hasta 100 caracteres'),
  category: z
    .string()
    .trim()
    .min(1, 'La categoría es obligatoria')
    .max(100, 'La categoría admite hasta 100 caracteres'),
});

type EditProductForm = z.infer<typeof editProductSchema>;

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
    formState: { errors },
  } = useForm<EditProductForm>({
    resolver: zodResolver(editProductSchema),
    defaultValues: {
      name: product.name,
      category: product.category,
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
            Actualiza el nombre y la categoría. El código, el tipo y la unidad no se modifican desde
            aquí.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          <dt className="font-medium">Código</dt>
          <dd>{product.code}</dd>
          <dt className="font-medium">Tipo</dt>
          <dd>{PRODUCT_TYPE_LABELS[product.type]}</dd>
          <dt className="font-medium">Unidad</dt>
          <dd>{PRODUCT_UNIT_LABELS[product.unit]}</dd>
        </dl>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((data) =>
            mutation.mutate(
              { id: product.id, data },
              {
                onSuccess: () => onSuccess(`Producto ${product.code} actualizado correctamente`),
              },
            ),
          )}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
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
          </fieldset>

          <ErrorNotice error={mutation.error} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
