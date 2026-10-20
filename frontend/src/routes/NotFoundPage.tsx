import { PageHeader } from '@/components/erp';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router';
export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <PageHeader
        title="Página no encontrada"
        description="La dirección no corresponde a una pantalla disponible. Volvé al inicio para elegir un módulo."
      />
      <Button asChild variant="outline">
        <Link to="/">Volver al inicio</Link>
      </Button>
    </section>
  );
}
