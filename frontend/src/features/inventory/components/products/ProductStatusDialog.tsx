import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useSetProductStatus } from '../../api/product-hooks';
import type { Product } from '../../types';

export function ProductStatusDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const mutation = useSetProductStatus();
  const activating = !product.isActive;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>{activating ? 'Activar producto' : 'Desactivar producto'}</DialogTitle>
          <DialogDescription>
            {activating
              ? `El producto ${product.code} volverá a estar disponible para operar.`
              : `El producto ${product.code} dejará de estar disponible para nuevas operaciones. No se elimina y puedes reactivarlo cuando quieras.`}
          </DialogDescription>
        </DialogHeader>

        <ErrorNotice error={mutation.error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { id: product.id, isActive: activating },
                {
                  onSuccess: () =>
                    onSuccess(
                      activating
                        ? `Producto ${product.code} activado`
                        : `Producto ${product.code} desactivado`,
                    ),
                },
              )
            }
          >
            {mutation.isPending ? 'Guardando…' : 'Confirmar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
