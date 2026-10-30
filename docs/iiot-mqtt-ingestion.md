# IIoT — Ingesta MQTT (Fase 3)

```text
Publisher → Mosquitto → MqttService → parseTelemetry
         → TelemetryIngestionService → Prisma → PostgreSQL / IiotReading
```

`IiotModule` es un módulo NestJS normal, sin controllers. `MqttService` administra
conexión, suscripción, reconexión y cierre; el parser valida la frontera externa
explícitamente con class-transformer/class-validator, sin depender del pipe HTTP.
El servicio de ingesta verifica OP y dispositivo y escribe únicamente lecturas.

## Configuración y disponibilidad

En el host, agrega a tu `.env` existente:

```dotenv
MQTT_URL=mqtt://localhost:1883
```

`MQTT_PORT` controla el puerto **publicado del broker**. `MQTT_URL` controla el
**cliente del backend**. Si cambias `MQTT_PORT` a 2883, usa
`mqtt://localhost:2883` para NestJS en el host. Compose inyecta siempre
`mqtt://mosquitto:1883`: su DNS y puerto internos no cambian. El frontend no recibe
esta variable y los puertos publicados siguen restringidos a `127.0.0.1`.

La URL es obligatoria y se valida al arrancar en desarrollo/producción; admite
`mqtt://` y `mqtts://`. Esta fase usa el broker local anónimo sin TLS de Fase 1;
no configura certificados, usuarios ni ACL. No es configuración de producción.

Con `NODE_ENV=test`, la URL puede omitirse y el subscriber **nunca abre conexión**,
incluso si está definida. Así las suites HTTP/Prisma no requieren Mosquitto.

Compose espera a PostgreSQL y Mosquitto saludables durante el arranque. Después,
una caída del broker no detiene REST ni cambia `/api/health`: este conserva su
comprobación de base de datos. MQTT.js reintenta cada 2 segundos, con timeout de
conexión de 5 segundos, y el servicio vuelve a suscribirse en cada conexión.
Los mensajes publicados mientras no hay conexión pueden perderse.

Se utiliza sesión limpia y **QoS 0** para telemetría periódica local. No hay
deduplicación, identificador de mensaje ni entrega garantizada. Repetir una
publicación válida crea nuevas lecturas. QoS 1 requeriría idempotencia explícita
en una fase posterior; el productor debe publicar sin retención para evitar
reproducir valores antiguos al reconectar.

El cierre de NestJS deja de aceptar mensajes, cierra el cliente y espera los
procesamientos pendientes. `main.ts` habilita los hooks para señales del proceso.
Los logs de conexión usan LOG; rechazos de entrada/OP/dispositivo, WARN; fallos
inesperados de broker/persistencia, ERROR. No se imprimen payloads ni URLs con
credenciales, ni se registra cada lectura válida.

## Contrato

Topic exacto:

```text
ecosoap/production/{productionOrderId}/{deviceCode}/telemetry
```

Suscripción: `ecosoap/production/+/+/telemetry`. La OP debe ser un UUID válido.
El dispositivo es un segmento no vacío de hasta 80 caracteres, sin espacios en
los extremos, `/`, `+`, `#` ni caracteres de control. No se duplica la OP ni el
dispositivo dentro del payload.

```json
{
  "recordedAt": "2026-10-30T10:00:00Z",
  "metrics": [
    { "metric": "TEMPERATURE", "value": 27.25, "unit": "°C" },
    { "metric": "HUMIDITY", "value": 61.5, "unit": "%" }
  ]
}
```

El mismo formato soporta jabón líquido con PH, TANK_LEVEL y MIXER_RPM:

| Métrica     | Unidad canónica |
| ----------- | --------------- |
| TEMPERATURE | °C              |
| HUMIDITY    | %               |
| PH          | pH              |
| TANK_LEVEL  | %               |
| MIXER_RPM   | RPM             |

Se exige JSON objeto, fecha ISO-8601 válida con `Z` u offset explícito, y entre
1 y 5 métricas únicas. Cada métrica admite exactamente `metric`, `value` y `unit`;
los campos extra se rechazan también en la raíz. No se convierten unidades.
`value` debe ser número JSON finito, con hasta cuatro decimales y valor absoluto
menor que 100000000000000. Se rechaza exceso de escala en vez de redondearlo.
El contrato numérico está sujeto a la precisión de números JSON/JavaScript; no
admite valores expresados como strings. El parser limita cada payload a 16 KiB
para acotar trabajo de validación de un máximo de cinco métricas.

No hay umbrales físicos ni ventanas de antigüedad/futuro: una temperatura negativa
o PH=14 técnicamente válidos se guardan. No se generan `IiotAlert`.

La OP debe existir y estar `IN_PROGRESS`; el dispositivo debe existir y estar
activo. No se crean dispositivos automáticamente ni se cambia el estado de OP.
Los chequeos y `createMany` se ejecutan en una transacción Prisma serializable;
el INSERT del batch es atómico y `receivedAt` conserva el default de persistencia.
Un fallo de validación o escritura no deja lecturas parciales. Un conflicto de
serialización se registra como fallo de persistencia; no se reintenta el mensaje
en este MVP QoS 0.

Cada evento maneja explícitamente sus errores: JSON inválido o una OP no activa
producen un rechazo controlado y los siguientes mensajes siguen procesándose.

## Prueba manual con Docker

1. Ejecuta `docker compose up --build -d --wait`. Comprueba
   `docker compose logs --tail 30 backend`: debe aparecer
   `MQTT subscribed to ecosoap/production/+/+/telemetry`.
2. Usa el flujo habitual del ERP para crear una fórmula/OP con materiales
   disponibles y ejecuta START. Copia el UUID de esa OP `IN_PROGRESS` desde la
   URL de detalle o consultándolo en PostgreSQL. IIoT no inicia órdenes.
3. Aprovisiona un dispositivo de prueba de forma explícita, fuera del seed.
   Desde la raíz, entra a `psql` con el usuario/base de tu `.env` (ejemplo con
   valores predeterminados):

   ```bash
   docker compose exec postgres psql -U ecosoap -d ecosoap_erp
   ```

   Dentro de psql, usa un código exclusivo de esta prueba; si ya existe, verifica
   primero su nombre/estado y no sobrescribas dispositivos ajenos:

   ```sql
   INSERT INTO iiot_devices(id,code,name,updated_at)
   VALUES (uuidv7(),'CURING-MANUAL-01','Prueba manual controlada',now());
   SELECT id,number,status FROM production_orders WHERE status='IN_PROGRESS';
   ```

4. Sustituye `OP_UUID` por el UUID real. En Bash publica sin retener:

   ```bash
   docker compose exec mosquitto mosquitto_pub -h 127.0.0.1 -p 1883 -q 0 -t "ecosoap/production/OP_UUID/CURING-MANUAL-01/telemetry" -m '{"recordedAt":"2026-10-30T10:00:00Z","metrics":[{"metric":"TEMPERATURE","value":27.25,"unit":"°C"},{"metric":"HUMIDITY","value":61.5,"unit":"%"}]}'
   ```

   En PowerShell usa stdin para evitar problemas de comillas JSON entre shells:

   ```powershell
   $opId = 'OP_UUID'
   '{"recordedAt":"2026-10-30T10:00:00Z","metrics":[{"metric":"TEMPERATURE","value":27.25,"unit":"°C"},{"metric":"HUMIDITY","value":61.5,"unit":"%"}]}' | docker compose exec -T mosquitto mosquitto_pub -h 127.0.0.1 -p 1883 -q 0 -t "ecosoap/production/$opId/CURING-MANUAL-01/telemetry" -s
   ```

5. En psql, comprueba las dos filas y sus valores, fuente y timestamps:

   ```sql
   SELECT r.production_order_id,d.code,r.metric,r.value,r.unit,r.recorded_at,r.received_at
   FROM iiot_readings r JOIN iiot_devices d ON d.id=r.device_id
   WHERE r.production_order_id='OP_UUID' AND d.code='CURING-MANUAL-01'
   ORDER BY r.received_at DESC;
   ```

Conserva esas filas como histórico y desactiva después el dispositivo de prueba
si ya no lo necesitas; no elimines datos ni reinicies el seed para limpiar la prueba.

## Pruebas automatizadas

```bash
pnpm --filter backend test
pnpm --filter backend test:e2e
```

Las unitarias cubren parser, URL, aislamiento de errores y ciclo de vida. La nueva
suite e2e usa PostgreSQL real y `TelemetryIngestionService` desde Nest: verifica
fuentes, precisión, estados de OP, dispositivos y rollback completo de un batch.
La base debe terminar en `_test`, con migraciones y seed; ver [setup](setup.md#8-pruebas).

`docker/verify.mjs`, ejecutado por el job **Docker development**, extiende el flujo
C-2 entre START y COMPLETE. Crea un dispositivo exclusivo en la base `_test`,
publica JSON inválido seguido de un batch válido por el Mosquitto real y consulta
PostgreSQL cada 100 ms durante un máximo de 10 segundos. Exige las dos lecturas
con OP/dispositivo, valores, unidades y fechas correctos, y ninguna alerta nueva.
Luego continúa las comprobaciones existentes de producción y calidad. El job
**Quality and tests** conserva `NODE_ENV=test` y no necesita broker.

No ejecutes `verify.mjs` contra tu base de desarrollo: requiere stack y administrador
de prueba. La configuración reproducible de ese stack, seed, bootstrap de ADMIN y
comando de verificación está en `.github/workflows/ci.yml`.

La Fase 3 termina en `IiotReading`. No incluye simulador, alertas automáticas,
control de producción/inventario/calidad, controllers, endpoints ni frontend IIoT.
