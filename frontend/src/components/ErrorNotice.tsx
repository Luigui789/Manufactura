import { Alert, AlertDescription } from '@/components/ui/alert';

export function ErrorNotice({ error }: { error: Error | null }) {
  return error ? (
    <Alert variant="destructive">
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  ) : null;
}
