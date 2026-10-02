import { Link } from 'react-router';
export function NotFoundPage() {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <Link className="underline" to="/">
        Volver al inicio
      </Link>
    </section>
  );
}
