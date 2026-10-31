import { Link, useNavigate, useParams } from 'react-router';
import { FormSection, LoadingState, PageHeader, StatusBadge } from '@/components/erp';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Button } from '@/components/ui/button';
import { useManufacturingStructure } from '../api/structure';
import { ProductPicker } from '../components/ProductPicker';
import { StructureNodeCard } from '../components/StructureTree';

const breadcrumbs = [{ label: 'Producción' }, { label: 'Estructura', to: '/production/structure' }];

export function ManufacturingStructurePage() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const structure = useManufacturingStructure(productId);

  if (!productId)
    return (
      <section className="space-y-6">
        <PageHeader
          title="Estructura de manufactura"
          description="Consulta la configuración vigente de un producto fabricado: fórmula activa, ruta y los intermedios que necesita, nivel por nivel."
          breadcrumbs={breadcrumbs}
        />
        <FormSection
          title="Producto fabricado"
          description="Solo los productos intermedios y terminados tienen estructura de manufactura."
        >
          <ProductPicker
            label="Producto"
            value=""
            output
            requireLotTracked={false}
            onChange={(id) => void navigate('/production/structure/' + id)}
          />
        </FormSection>
      </section>
    );

  if (structure.isPending) return <LoadingState label="Cargando estructura…" />;

  if (!structure.data)
    return (
      <section className="space-y-4">
        <PageHeader title="Estructura de manufactura" breadcrumbs={breadcrumbs} />
        <ErrorNotice error={structure.error} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={structure.isFetching} onClick={() => void structure.refetch()}>
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link to="/production/structure">Elegir otro producto</Link>
          </Button>
        </div>
      </section>
    );

  const root = structure.data;
  return (
    <section className="space-y-6">
      <PageHeader
        title={'Estructura de ' + root.product.name}
        description={root.product.code}
        status={<StatusBadge status={root.readiness} />}
        breadcrumbs={[...breadcrumbs, { label: root.product.code }]}
        actions={
          <Button asChild variant="outline">
            <Link to="/production/structure">Elegir otro producto</Link>
          </Button>
        }
      />
      <ErrorNotice error={structure.error} />
      <FormSection
        title="Árbol de fabricación"
        description={
          'Configuración vigente con ' +
          root.maxDepth +
          (root.maxDepth === 1 ? ' nivel' : ' niveles') +
          ' de componentes. Cada producto intermedio se fabrica en su propia orden de producción; esta vista no es la trazabilidad histórica de lotes.'
        }
      >
        {root.readiness === 'READY' ? (
          <p className="text-sm text-muted-foreground">
            Todos los productos fabricados tienen fórmula activa, versión activa y ruta activa con
            operaciones.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Hay productos fabricados con configuración pendiente; revisa los avisos de cada nivel.
          </p>
        )}
        <StructureNodeCard node={root} />
      </FormSection>
    </section>
  );
}
