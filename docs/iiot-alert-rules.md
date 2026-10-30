# Alertas IIoT — Fase 5

**DEMO / SYNTHETIC RULES**

> Los umbrales IIoT de Fase 5 son reglas sintéticas de demostración diseñadas para validar el flujo de monitoreo y alertas. No constituyen especificaciones industriales ni criterios reales de calidad del jabón.

Flujo: Simulator → MQTT → Mosquitto → MqttService → parseTelemetry →
TelemetryIngestionService → IiotReading → RuleEngineService → IiotAlert.

El motor injectable es determinista y no consulta ni escribe la base. Solo observa
`metric`, `value` y `unit`; no infiere productos, procesos, escenarios ni seeds.
`demo-rules.ts` centraliza umbrales exactos expresados como strings, unidades y tipos.
`rule-engine.service.ts` compara mediante `Prisma.Decimal.lte/gte`, sin convertir a number.
Una unidad distinta de la unidad demo no aplica la regla; el parser ya rechaza unidades inválidas.

| Métrica (unidad) | WARNING     | CRITICAL    | Tipos (bajo / alto)                |
| ---------------- | ----------- | ----------- | ---------------------------------- |
| TEMPERATURE (°C) | ≤10 / ≥50   | ≤0 / ≥55    | LOW_TEMPERATURE / HIGH_TEMPERATURE |
| HUMIDITY (%)     | ≤30 / ≥70   | ≤20 / ≥78   | LOW_HUMIDITY / HIGH_HUMIDITY       |
| PH (pH)          | ≤8.5 / ≥10  | ≤8 / ≥11    | PH_OUT_OF_RANGE                    |
| TANK_LEVEL (%)   | ≤30 / ≥95   | ≤15 / ≥99   | LOW_TANK_LEVEL / HIGH_TANK_LEVEL   |
| MIXER_RPM (RPM)  | ≤250 / ≥420 | ≤150 / ≥470 | LOW_MIXER_RPM / HIGH_MIXER_RPM     |

Todos los límites son inclusivos. Se evalúa CRITICAL antes de WARNING y se devuelve
una sola decisión o null. Por ejemplo, HUMIDITY=80 genera solo HIGH_HUMIDITY CRITICAL.
Los mensajes incluyen métrica, valor a cuatro decimales, unidad, severidad demo,
dirección y umbral relevante. Ejemplo:
`TEMPERATURE 50.0000 °C is at or above demo warning maximum 50.0000 °C`.
No implican aceptación/rechazo de jabón ni especificaciones químicas.

La ingesta conserva validación de OP IN_PROGRESS y dispositivo activo. Tras validar,
`createManyAndReturn` inserta el batch y devuelve las filas persistidas. Cada fila se
evalúa independientemente, sin asumir orden de retorno. Las alertas usan exclusivamente
`reading.id` y `reading.productionOrderId`; la FK compuesta existente impide cruzar OP.
`receivedAt` conserva su default de base. `acknowledgedAt` conserva su default null.
Solo se invoca `iiotAlert.createMany` si hay decisiones.

Readings y alerts comparten la transacción Serializable. Un fallo en las alertas
revierte el batch completo. Con QoS 0, un rollback inesperado puede implicar pérdida
del mensaje: esta fase no implementa retry ni idempotencia.

Cada lectura desviada genera su propio evento: cinco lecturas desviadas producen
cinco alertas. Un payload publicado dos veces produce dos juegos de readings y alerts.
No hay deduplicación, cooldown, hysteresis, debounce, incident lifecycle, recuperación
ni acknowledgement workflow. No se registra cada evento en AuditLog ni se emite WARN
por cada alerta; la persistencia constituye su historial.

CRITICAL solamente persiste IiotAlert: no cambia OP, lotes, inventario, calidad ni
publica comandos MQTT. No hay controllers, endpoints, frontend ni integración con
calidad (Fase 8) dentro del motor. La [API de monitoreo de Fase 6](iiot-monitoring-api.md)
añade consultas REST autenticadas de readings y alertas, sin acknowledgement ni streaming.

## Verificación

- Unitarias: límites y vecinos decimales para las cinco métricas, tipo, severidad,
  mensajes deterministas, unidad y una decisión con precedencia CRITICAL.
- PostgreSQL (`backend/test/iiot-ingestion.e2e-spec.ts`): normal, warning, critical,
  batch mixto y múltiples violaciones, FK/OP, defaults, rechazos y repetición.
  Un spy devuelve un mensaje vacío para provocar el CHECK real
  `iiot_alerts_message_nonempty_check` y comprobar rollback de readings y alerts.
- Docker (`docker/verify-simulator.mjs`, invocado por `docker/verify.mjs`): los cuatro
  perfiles pasan por simulator → Mosquitto → NestJS → PostgreSQL sobre base `_test`,
  60 muestras, seed 42, intervalo 100 ms, polling cada 100 ms hasta 10 segundos.
  Normales: cero alertas. Bar deviation: HIGH_HUMIDITY WARNING y CRITICAL.
  Liquid deviation: HIGH_TEMPERATURE, PH_OUT_OF_RANGE, HIGH_MIXER_RPM y ambas severidades.
  Se verifican readingId, dispositivo, misma OP y acknowledgedAt null sin fijar un
  total de alertas. Los perfiles Fase 4 permanecen intactos.

Las suites existentes de migraciones y el diff Prisma deben demostrar ausencia de
schema drift; esta fase no modifica schema.prisma ni migraciones históricas.

La [Fase 8](iiot-quality-integration.md) prueba CRITICAL + APPROVED → RELEASED.
Las alertas no deciden Calidad y la inspección no modifica ni reconoce las alertas.
