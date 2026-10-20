import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CircleAlert } from 'lucide-react';

export function ErrorNotice({ error }: { error: Error | null }) {
  return error ? (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>No pudimos completar la operación</AlertTitle>
      <AlertDescription>
        {/^(Bad Request|Invalid input|Failed to fetch)$/i.test(error.message)
          ? 'Revisá los datos y la conexión e intentá nuevamente.'
          : error.message}
      </AlertDescription>
    </Alert>
  ) : null;
}
