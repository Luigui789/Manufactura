import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/features/auth/hooks/use-auth';
import { ROLE_LABELS } from '@/features/auth/types';

export function HomePage() {
  const { data: user } = useSession();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Bienvenido, {user?.fullName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-muted-foreground">
        <p>Tu rol es {user && ROLE_LABELS[user.role]}.</p>
        <p>Usa el menú para acceder a las funciones disponibles para tu cuenta.</p>
      </CardContent>
    </Card>
  );
}
