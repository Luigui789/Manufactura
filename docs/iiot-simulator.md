# Simulador industrial IIoT — Fase 4

```text
Sensores / controlador simulado (TypeScript)
  → MQTT QoS 0 → Mosquitto → NestJS (Fase 3) → Prisma → PostgreSQL / IiotReading
```

El workspace `simulator` solo genera perfiles con estado y publica telemetría.
No recibe credenciales de base de datos, no usa Prisma ni HTTP y no modifica
órdenes, inventario, lotes, inspecciones ni alertas. No incorpora reglas de Fase 5.

> Los perfiles numéricos del simulador son datos sintéticos para demostración académica y no constituyen especificaciones industriales ni límites de calidad.

## Instalación y scripts

Requiere Node.js 22 (CI: 22.16.0) y pnpm 10.30.3, declarados en el monorepo.

```bash
pnpm install --frozen-lockfile
pnpm --filter simulator test
pnpm --filter simulator lint
pnpm --filter simulator build
```

`simulate` compila y ejecuta; `start` ejecuta `dist/cli.js` previamente compilado.
`pnpm lint`, `pnpm build` y `pnpm format:check` incluyen el nuevo workspace.
No hay script `dev`: el simulador no arranca con `pnpm dev`.

## Preparación de la demo

1. Arranca el stack: `docker compose up --build -d --wait` (o `--watch`).
2. Mediante el flujo habitual del ERP, crea e inicia una OP. Debe existir y estar
   **IN_PROGRESS** antes de publicar. Copia su UUID: el simulador no busca,
   inicia ni completa órdenes. El backend rechaza lecturas de otra situación.
3. Aprovisiona manualmente dispositivos activos según el
   [procedimiento de Fase 3](iiot-mqtt-ingestion.md#prueba-manual-con-docker).
   Por ejemplo, en psql conectado a tu base de desarrollo, usa códigos nuevos:

   ```sql
   INSERT INTO iiot_devices(id,code,name,updated_at)
   VALUES (uuidv7(),'CURING-DEMO-01','Demo barra',now()),
          (uuidv7(),'MIXER-DEMO-01','Demo líquido',now());
   SELECT id,number,status FROM production_orders WHERE status='IN_PROGRESS';
   ```

   No sobrescribas códigos existentes; comprueba primero su estado y propietario.
   Los códigos de ejemplo son identificadores de demo, no restricciones del modelo.

## CLI y environment

La precedencia es **CLI > variables del proceso > valores predeterminados**.
El paquete no carga `.env` automáticamente: exporta las variables o usa Compose.
`--order`, `--device`, `--process` y `--scenario` son obligatorios salvo que
sus variables estén definidas. Se acepta el separador opcional `--` de pnpm.

| CLI             | Variable                  | Predeterminado / validación                       |
| --------------- | ------------------------- | ------------------------------------------------- |
| `--order`       | `SIM_PRODUCTION_ORDER_ID` | Obligatorio; UUID válido                          |
| `--device`      | `SIM_DEVICE_CODE`         | Obligatorio; segmento MQTT de 1–80 caracteres     |
| `--process`     | `SIM_PROCESS`             | Obligatorio; `bar` o `liquid`                     |
| `--scenario`    | `SIM_SCENARIO`            | Obligatorio; `normal` o `deviation`               |
| `--samples`     | `SIM_SAMPLES`             | 60; entero seguro ≥ 1                             |
| `--interval-ms` | `SIM_INTERVAL_MS`         | 1000; entero de 1 a 3600000 ms                    |
| `--seed`        | `SIM_SEED`                | 42; entero de 0 a 4294967295                      |
| `--mqtt-url`    | `MQTT_URL`                | `mqtt://localhost:1883`; URL MQTT/MQTTS de broker |

El código de dispositivo no admite `/`, `+`, `#`, controles ASCII/DEL ni espacios
en los extremos. La URL exige hostname y no admite rutas, query ni fragmento.
La configuración se valida antes de abrir MQTT; los errores salen con código 1
y sin imprimir URLs con credenciales. Un certificado/ACL de producción queda
fuera del alcance del broker local anónimo de Fase 1.

Ejemplo de environment exclusivo del simulador:

```dotenv
MQTT_URL=mqtt://localhost:1883
SIM_PRODUCTION_ORDER_ID=UUID_REAL_DE_OP
SIM_DEVICE_CODE=CURING-DEMO-01
SIM_PROCESS=bar
SIM_SCENARIO=normal
SIM_INTERVAL_MS=1000
SIM_SAMPLES=60
SIM_SEED=42
```

## Cuatro escenarios

Reemplaza `OP_UUID` por la OP real. Estos ejemplos usan Bash; en PowerShell
escribe cada comando en una línea o usa el acento grave para continuarlo.

```bash
# bar-normal: 20 filas (10 temperaturas + 10 humedades)
pnpm --filter simulator simulate -- \
  --order OP_UUID --device CURING-DEMO-01 --process bar --scenario normal \
  --samples 10 --interval-ms 1000 --seed 42

# bar-deviation: calentamiento y aumento de humedad progresivos
pnpm --filter simulator simulate -- \
  --order OP_UUID --device CURING-DEMO-01 --process bar --scenario deviation \
  --samples 60 --interval-ms 1000 --seed 42

# liquid-normal: 40 filas para 10 publicaciones de cuatro métricas
pnpm --filter simulator simulate -- \
  --order OP_UUID --device MIXER-DEMO-01 --process liquid --scenario normal \
  --samples 10 --interval-ms 1000 --seed 42

# liquid-deviation: aumenta temperatura/pH/RPM; nivel sigue descendiendo
pnpm --filter simulator simulate -- \
  --order OP_UUID --device MIXER-DEMO-01 --process liquid --scenario deviation \
  --samples 60 --interval-ms 1000 --seed 42
```

Consulta las lecturas de una demo (filtra también por código si usas varios):

```sql
SELECT d.code,r.metric,r.value,r.unit,r.recorded_at,r.received_at
FROM iiot_readings r JOIN iiot_devices d ON d.id=r.device_id
WHERE r.production_order_id='OP_UUID'
ORDER BY r.recorded_at,r.metric;
```

## Perfiles y reproducibilidad

| Proceso | Métricas y unidades                                | Perfil normal           | Cambio de objetivo en deviation |
| ------- | -------------------------------------------------- | ----------------------- | ------------------------------- |
| Barra   | TEMPERATURE °C, HUMIDITY %                         | Bases 27 y 60           | +12 °C y +22 puntos de humedad  |
| Líquido | TEMPERATURE °C, PH pH, TANK_LEVEL %, MIXER_RPM RPM | Bases 42, 9.4, 80 y 350 | +16 °C, +2 pH y +150 RPM        |

El progreso es `sampleIndex / (samples - 1)`; para una sola muestra se usa 0.
`DEVIATION_START = 0.55` mantiene ambos escenarios idénticos hasta el 55 %.
Desde ahí el objetivo aumenta linealmente hasta el cambio de la tabla. Los valores
se acercan al objetivo con `previous + (target - previous) * 0.25 + noise`;
el último valor puede no alcanzar el objetivo. Cada variable conserva su estado.
El nivel objetivo del tanque baja de 80 a 55 %; el valor se limita a [0,100].
El ruido centrado tiene amplitudes totales 0.25/0.5 para barra y
0.3/0.025/0.08/3 para líquido. No son umbrales ni normas de proceso.

El RNG pequeño Mulberry32 transforma un seed uint32 en una secuencia reproducible;
no usa `Math.random()`. Proceso, escenario, seed y número de muestras iguales
producen los mismos valores, independientemente del intervalo y de los timestamps
reales. Se publican dos decimales como máximo. Una ejecución de una muestra solo
representa el comienzo normal, incluso en `deviation`.

## Contrato y ciclo de vida

El topic exclusivo es
`ecosoap/production/{productionOrderId}/{deviceCode}/telemetry`. Cada mensaje
contiene exactamente `recordedAt` (fecha real UTC con `new Date().toISOString()`)
y `metrics`; cada métrica contiene solo `metric`, `value` y `unit`.
Se respeta el [contrato inalterado de Fase 3](iiot-mqtt-ingestion.md#contrato).

MQTT.js usa sesión limpia, QoS 0, `retain=false`, reconexión cada 2 segundos y
`queueQoSZero=false`. La conexión inicial o reconexión se espera como máximo
10 segundos; no se generan muestras mientras se espera. La publicación también
tiene un límite de 10 segundos. Una muestra que falla durante una desconexión
no se reenvía: puede haberse recibido y QoS 0 no garantiza entrega. No hay colas
persistentes, deduplicación ni reintentos artificiales de muestras.

La primera muestra se publica al conectar y las restantes esperan el intervalo
después de la anterior. SIGINT/SIGTERM interrumpen conexión, publicación o espera
y cierran MQTT. Al completar se usa `endAsync(false)`; si tarda más de 2 segundos,
se fuerza el cierre. Una interrupción solicitada termina limpiamente con código 0.
Los errores de conexión/publicación son mensajes fijos sin secretos.

## Docker

`simulator-dev` reutiliza las dependencias pnpm del monorepo, compila TypeScript
y ejecuta `node dist/cli.js` con usuario `node`. El manifest se copia antes del
install frozen para mantener el lockfile y la caché. No hay segundo npm install.

El servicio está bajo el profile `simulation`. El arranque normal conserva
solo postgres, mosquitto, backend y frontend; no exige variables SIM.
Compose proporciona `bar`/`normal` como valores predeterminados y únicamente
MQTT y las variables SIM al simulador; depende solo de Mosquitto healthy.

```bash
docker compose --profile simulation build simulator
docker compose --profile simulation run --rm \
  -e SIM_PRODUCTION_ORDER_ID=OP_UUID -e SIM_DEVICE_CODE=CURING-DEMO-01 \
  -e SIM_PROCESS=bar -e SIM_SCENARIO=normal \
  -e SIM_SAMPLES=10 -e SIM_SEED=42 simulator
```

Para líquido o deviation cambia sus variables. En Docker siempre se conecta a
`mqtt://mosquitto:1883`; desde host respeta el puerto publicado de tu broker.
El simulador nunca recibe DATABASE_URL, POSTGRES_PASSWORD ni JWT_SECRET.

## Verificación automatizada

Las pruebas Vitest cubren configuración/precedencia, cuatro perfiles, determinismo,
continuidad, tendencia posterior al punto de desviación, precisión, unidades,
nivel porcentual, topic, payload exacto, opciones MQTT, timeout, reconexión sin
republicación, interrupciones y cierre. MQTT se mockea solo en unitarias.

El smoke Docker existente (`docker/verify.mjs`) llama a
`docker/verify-simulator.mjs` entre START y COMPLETE de su OP exclusiva.
Exige una base `_test`, crea cuatro dispositivos activos y ejecuta el CLI compilado
como proceso separado **con un environment que solo contiene MQTT/SIM**.
Con 60 muestras por perfil y seed 42 exige 120 filas de barra y 240 de líquido,
comprueba toda la secuencia determinista, unidades, OP/dispositivo y fechas.
Los perfiles normales no crean alertas; deviation genera los tipos y severidades
documentados en [reglas sintéticas](iiot-alert-rules.md), con FK y OP coherentes. Consulta cada 100 ms hasta 10 segundos, sin sleeps largos.
Reutiliza el Mosquitto, NestJS y PostgreSQL reales del stack; no usa mocks.

También envía las 60 muestras de cada uno de los cuatro perfiles al parser real
`parseTelemetry` compilado del backend. Ese acceso existe solo en el script
externo de aceptación: el runtime y los tests unitarios del paquete no importan
backend ni Prisma. La imagen backend-dev incluye una copia compilada del simulador
para ese proceso de smoke; el backend normal no lo ejecuta.

El job **Quality and tests** ejecuta unitarias del simulador y los checks raíz.
**Docker development** mantiene su smoke de aplicación y añade esta aceptación
al mismo flujo, sin otro broker. Para reproducirlo usa las variables efímeras,
seed y bootstrap de ADMIN documentados en `.github/workflows/ci.yml`; no ejecutes
el smoke contra una base de desarrollo ni reinicies datos para limpiarlo.

El alcance original de Fase 4 terminaba en IiotReading: no incluía alertas, límites de calidad, dashboards,
endpoints IIoT ni integración con PLC real. Fase 5 añade las reglas sintéticas
de alerta de demostración sin modificar los perfiles.

La [Fase 5](iiot-alert-rules.md) añade evaluación determinista de las lecturas
persistidas y alertas transaccionales con umbrales sintéticos de demostración.
Las descripciones de Fases 2–4 corresponden a su alcance original. La aceptación
Docker ahora verifica también ambos perfiles deviation y sus alertas.
