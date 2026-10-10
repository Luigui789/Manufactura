import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useProduct } from '../../api/product-hooks';
import { PRODUCT_TYPE_LABELS, PRODUCT_UNIT_LABELS } from '../../product-labels';

export function ProductDetailDialog({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const query = useProduct(productId);
  const product = query.data;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalle del producto</DialogTitle>
          <DialogDescription>Información registrada del producto.</DialogDescription>
        </DialogHeader>

        {query.isPending && <p role="status">Cargando detalle…</p>}
        <ErrorNotice error={query.error} />

        {product && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium">Código</dt>
            <dd>{product.code}</dd>
            <dt className="font-medium">Nombre</dt>
            <dd>{product.name}</dd>
            <dt className="font-medium">Categoría</dt>
            <dd>{product.category}</dd>
            <dt className="font-medium">Tipo</dt>
            <dd>{PRODUCT_TYPE_LABELS[product.type]}</dd>
            <dt className="font-medium">Unidad</dt>
            <dd>{PRODUCT_UNIT_LABELS[product.unit]}</dd>
            <dt className="font-medium">Estado</dt>
            <dd>
              <Badge variant={product.isActive ? 'secondary' : 'outline'}>
                {product.isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </dd>
          </dl>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
