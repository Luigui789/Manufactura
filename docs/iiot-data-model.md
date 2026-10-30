# IIoT — Modelo de persistencia (Fase 2)

La migración `20261030040000_iiot_data_model` añade tres tablas y dos enums.
La Fase 2 solo añade persistencia. La [Fase 3](iiot-mqtt-ingestion.md) conecta
Mosquitto con NestJS para guardar lecturas validadas; no añade endpoints, reglas
ni generación automática de alertas.
El seed principal conserva sus cinco roles y un almacén, sin dispositivos ni telemetría ficticia.

```text
ProductionOrder ──┬── IiotReading ─── IiotAlert (lectura opcional)
                  ├── IiotAlert
                  └── Lot ─── QualityInspection
IiotDevice ─────────── IiotReading
```

Las lecturas pertenecen a `ProductionOrder`, que existe durante la fabricación.
El lote terminado se genera después: su telemetría se obtiene a través de la OP,
sin modificar la semántica de `Lot`, calidad, producción o inventario.

## Modelos

Todos los IDs siguen `uuid(7)` generado por Prisma, almacenado como UUID; SQL directo
debe proporcionar el ID. Los nombres físicos usan `snake_case` y tablas en plural.
Todos los instantes usan `Timestamptz(6)`.

| Modelo / tabla                  | Campos                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `IiotDevice` / `iiot_devices`   | `id`, `code` único (80), `name` (120), `description?` (1000), `isActive` (true), `createdAt` (now), `updatedAt` (@updatedAt) |
| `IiotReading` / `iiot_readings` | `id`, `productionOrderId`, `deviceId`, `metric`, `value` Decimal(18,4), `unit` (16), `recordedAt`, `receivedAt` (now)        |
| `IiotAlert` / `iiot_alerts`     | `id`, `productionOrderId`, `readingId?`, `type` (80), `severity`, `message` (1000), `createdAt` (now), `acknowledgedAt?`     |

Los números entre paréntesis son límites `varchar`. `updatedAt` lo mantiene Prisma,
como en el resto del ERP; no hay un trigger ni default SQL para ese campo.

`IiotMetric`: `TEMPERATURE`, `HUMIDITY`, `PH`, `TANK_LEVEL`, `MIXER_RPM`.
Soporta jabón en barra (temperatura/humedad) y líquido (temperatura/pH/nivel/RPM)
en un único modelo. Las unidades se guardan con la lectura (`°C`, `%`, `pH`, `RPM`),
sin ampliar `UnitOfMeasure`, que corresponde al inventario. El modelo no impone
asociaciones métrica/unidad ni límites del proceso; la ingesta MQTT de Fase 3
valida las unidades canónicas antes de escribir.

`IiotAlertSeverity`: `WARNING`, `CRITICAL`. El tipo de alerta es un string limitado
para permitir evolución del futuro motor (`HIGH_TEMPERATURE`, `LOW_TEMPERATURE`,
`HIGH_HUMIDITY`, `PH_OUT_OF_RANGE`). El reconocimiento solo tiene fecha opcional,
sin usuario ni flujo de reconocimiento en esta fase.

`Decimal(18,4)` conserva cuatro decimales y hasta catorce dígitos enteros; PostgreSQL
redondea entradas con mayor escala. La ingesta MQTT de Fase 3 rechaza el exceso
de escala antes de persistir. Se permiten valores negativos (por ejemplo, temperatura).
El CHECK de finitud rechaza `NaN`; la precisión numérica rechaza infinitos y overflow.
`recordedAt` lo declara la fuente y `receivedAt` lo genera la base; no se exige un
orden entre ambos porque el reloj de la fuente puede diferir del ERP.

## Integridad

- FK obligatorias de lectura a OP y dispositivo, y de alerta a OP.
- `UNIQUE (id, production_order_id)` en lecturas permite la FK compuesta
  `iiot_alerts(reading_id, production_order_id) → iiot_readings(id, production_order_id)`.
  Así una alerta no puede apuntar a la lectura de otra OP, tanto en INSERT como UPDATE.
- La FK compuesta usa el comportamiento normal `MATCH SIMPLE`: si `reading_id` es
  NULL no exige lectura, pero la FK independiente de OP sigue siendo obligatoria.
- Todas estas FK usan `ON DELETE RESTRICT ON UPDATE RESTRICT`: no hay cascadas que
  borren histórico ni cambios de claves que puedan alterar la asociación de una alerta.
- CHECK adicionales para `code`, `name`, `unit`, `type` y `message` no vacíos tras
  `btrim`, y `value <> 'NaN'::numeric`. No hay umbrales de negocio ni triggers de alertas.

Las restricciones protegen referencias; esta fase no crea procesos de eliminación
ni impone una política nueva de inmutabilidad o retención sobre telemetría.

## Índices

Además de PK y código único de dispositivo:

| Tabla    | Columnas                                     | Consulta / integridad                                                           |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| Lecturas | `(production_order_id, recorded_at)`         | Cronología y últimas lecturas de una OP, con recorrido B-tree inverso para DESC |
| Lecturas | `(production_order_id, metric, recorded_at)` | Histórico de una métrica de una OP                                              |
| Lecturas | `(device_id, recorded_at)`                   | Últimas lecturas de un dispositivo                                              |
| Lecturas | UNIQUE `(id, production_order_id)`           | Clave candidata exigida por la FK compuesta                                     |
| Alertas  | `(production_order_id, created_at)`          | Cronología de alertas por OP                                                    |
| Alertas  | `(reading_id, production_order_id)`          | Alertas de una lectura y comprobación de referencias                            |

Los dos índices de OP no son redundantes: intercalar `metric` impide entregar la
cronología de todas las métricas sin ordenar. No se añaden índices simples de OP o
dispositivo porque sus prefijos ya están cubiertos, ni un índice global por tiempo:
las consultas previstas están acotadas por OP/dispositivo. No hay particionado ni
optimización anticipada del motor de reglas.

## Despliegue, compatibilidad y pruebas

La migración es aditiva y transaccional: conserva tablas y datos existentes. Se
puede desplegar antes que los consumidores futuros; el código previo sigue funcionando.
Un fallo revierte el DDL de esta migración. Tras un despliegue exitoso, la reversión
segura de aplicación consiste en volver al código previo conservando las tablas nuevas.
Eliminar tablas con histórico requeriría otra migración y autorización; no se incluye
un rollback destructivo.

En una base **dedicada terminada en `_test`**, con `DATABASE_URL` apuntando a ella:

```bash
pnpm --filter backend prisma:generate
pnpm --filter backend exec prisma validate
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend db:seed
pnpm --filter backend test:migrations
pnpm --filter backend test:e2e
```

`test/iiot-migrations.mjs` se integra en `test:migrations` y en el job existente de CI.
Usa PostgreSQL real y schemas temporales para probar instalación desde cero,
upgrade con OP existentes, preservación de todas las tablas previas, precisión,
defaults, zona horaria, enums, FK inválidas, lectura opcional, consistencia de OP en
INSERT/UPDATE y borrados restringidos. Inspecciona `pg_indexes` para comprobar los
índices reales. Los schemas de prueba se eliminan al finalizar; nunca debe ejecutarse
contra la base de trabajo. La guía de [setup](setup.md#8-pruebas) explica el aislamiento.

`test/iiot-persistence.e2e-spec.ts` prueba además la creación mediante Prisma,
UUID v7, Decimal, defaults y navegación de las relaciones inversas, usando el
cliente generado y la base real de pruebas.

La [Fase 5](iiot-alert-rules.md) añade evaluación determinista de las lecturas
persistidas y alertas transaccionales con umbrales sintéticos de demostración.
Las descripciones de Fases 2–4 corresponden a su alcance original. La aceptación
Docker ahora verifica también ambos perfiles deviation y sus alertas.
