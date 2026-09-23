import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * PANTALLA TEMPORAL DE VERIFICACION DEL ENTORNO.
 *
 * No forma parte del ERP. Su unica razon de existir es demostrar de una sola
 * vez que toda la cadena esta montada: Tailwind compila, los componentes de
 * shadcn/ui resuelven, el alias "@" funciona, la variable VITE_API_URL llega
 * desde el .env de la raiz y el backend responde con CORS correcto.
 *
 * Se reemplaza en cuanto empiece el layout real del ERP (header, sidebar y
 * contenido), en la etapa siguiente.
 */

interface HealthPayload {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  timestamp: string;
}

interface HealthResponse {
  data: HealthPayload;
  message: string;
}

type EstadoConsulta =
  | { fase: 'cargando' }
  | { fase: 'ok'; respuesta: HealthResponse }
  | { fase: 'error'; motivo: string };

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// API_URL es una constante de modulo, de modo que la ausencia de configuracion
// se conoce antes del primer render y no necesita pasar por un efecto.
const ESTADO_INICIAL: EstadoConsulta = API_URL
  ? { fase: 'cargando' }
  : {
      fase: 'error',
      motivo: 'VITE_API_URL no esta definida. Copia .env.example como .env en la raiz.',
    };

function App() {
  const [estado, setEstado] = useState<EstadoConsulta>(ESTADO_INICIAL);

  // Todo cambio de estado ocurre despues de un await: llamar a setState de
  // forma sincrona dentro de un efecto provoca renders en cascada.
  const consultarSalud = useCallback(async () => {
    if (!API_URL) {
      return;
    }

    try {
      const respuesta = await fetch(`${API_URL}/health`);
      const cuerpo = (await respuesta.json()) as HealthResponse;

      if (!respuesta.ok) {
        setEstado({ fase: 'error', motivo: cuerpo.message || `HTTP ${respuesta.status}` });
        return;
      }

      setEstado({ fase: 'ok', respuesta: cuerpo });
    } catch {
      setEstado({
        fase: 'error',
        motivo: `No se pudo contactar al backend en ${API_URL}. Comprueba que este ejecutandose.`,
      });
    }
  }, []);

  useEffect(() => {
    // react-hooks/set-state-in-effect desaconseja con razon el patron
    // "fetch dentro de un efecto": es exactamente lo que TanStack Query resuelve,
    // y el prompt maestro (§24) lo exige para todo dato proveniente del backend.
    // Aqui se suprime a proposito porque esta pantalla es temporal y TanStack
    // Query todavia no forma parte del alcance de la configuracion inicial.
    // Cuando se instale, esta consulta debe migrar a useQuery y este comentario
    // desaparecer con ella.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void consultarSalud();
  }, [consultarSalud]);

  // El boton si puede marcar "cargando" de forma sincrona: es un manejador de
  // evento, no el cuerpo de un efecto.
  const reintentar = () => {
    setEstado({ fase: 'cargando' });
    void consultarSalud();
  };

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-2xl">EcoSoap ERP</CardTitle>
          <CardDescription>
            Verificacion del entorno de desarrollo. Esta pantalla es temporal y se reemplazara por
            el layout del ERP.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Frontend</dt>
            <dd>
              <Badge variant="secondary">React + Vite + Tailwind + shadcn/ui</Badge>
            </dd>

            <dt className="text-muted-foreground">API</dt>
            <dd className="font-mono text-xs break-all">{API_URL ?? 'no configurada'}</dd>

            <dt className="text-muted-foreground">Backend</dt>
            <dd>
              {estado.fase === 'cargando' && <Badge variant="outline">Consultando...</Badge>}
              {estado.fase === 'ok' && <Badge>{estado.respuesta.message}</Badge>}
              {estado.fase === 'error' && <Badge variant="destructive">Sin respuesta</Badge>}
            </dd>

            <dt className="text-muted-foreground">PostgreSQL</dt>
            <dd>
              {estado.fase === 'ok' ? (
                <Badge
                  variant={estado.respuesta.data.database === 'up' ? 'default' : 'destructive'}
                >
                  {estado.respuesta.data.database === 'up' ? 'Conectada' : 'Caida'}
                </Badge>
              ) : (
                <Badge variant="outline">Desconocido</Badge>
              )}
            </dd>
          </dl>

          {estado.fase === 'error' && (
            <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-md border p-3 text-sm">
              {estado.motivo}
            </p>
          )}

          {estado.fase === 'ok' && (
            <p className="text-muted-foreground text-xs">
              Ultima comprobacion: {new Date(estado.respuesta.data.timestamp).toLocaleString()}
            </p>
          )}

          <Button onClick={reintentar} disabled={estado.fase === 'cargando'}>
            {estado.fase === 'cargando' ? 'Comprobando...' : 'Comprobar de nuevo'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
