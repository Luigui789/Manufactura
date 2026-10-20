import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge, LoadingState } from '@/components/erp';
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

        {query.isPending && <LoadingState label="Cargando detalle…" />}
        <ErrorNotice error={query.error} />
        {query.isError && (
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar detalle
          </Button>
        )}

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
            <dt className="font-medium">Trazabilidad por lote</dt>
            <dd>{product.isLotTracked ? 'Sí' : 'No'}</dd>
            <dt className="font-medium">Inspección de calidad</dt>
            <dd>{product.requiresQualityInspection ? 'Requerida' : 'No requerida'}</dd>
            <dt className="font-medium">Estado</dt>
            <dd>
              <StatusBadge status={product.isActive} />
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
