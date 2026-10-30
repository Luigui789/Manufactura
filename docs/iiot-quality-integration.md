# Fase 8 · Evidencia IIoT en Calidad

IIoT informa la decisión de Calidad. La aprobación o rechazo requiere una decisión
explícita del inspector; CRITICAL no significa rechazo automático y cero alertas no
significa aprobación. Las reglas siguen siendo **DEMO / SYNTHETIC**, académicas,
sin límites industriales certificados para fabricación de jabón.

## Arquitectura final

```text
Sensores simulados → Simulator → Mosquitto → NestJS ingestion → IiotReading
→ RuleEngine → IiotAlert → Monitoring API → Dashboard IIoT
→ Contexto IIoT en Calidad → Inspector → APPROVED / REJECTED → RELEASED / REJECTED
```

La OP completada produce un Lot en cuarentena si el producto requiere inspección.
El vínculo OP → Lot → QualityInspection conserva el flujo existente; no nace otro
módulo. La ingesta solo acepta OP IN_PROGRESS: las alertas se producen durante la
ejecución y permanecen disponibles cuando la OP pasa a COMPLETED.

## Integración visual

`OrderDetailPage` pasa `current.id` como `productionOrderId` a `LotProductionDetail`.
El detalle de lotes en Inventario pasa el ID ya disponible en su origen de producción.
No se buscan órdenes por número de lote ni se agregan consultas para resolver el vínculo.

Dentro de Calidad, después del estado del lote y antes del formulario o de la
inspección registrada, `QualityIiotContext` muestra:

- Total de lecturas, WARNING, CRITICAL, total de alertas y fechas de última lectura/alerta,
  obtenidos directamente de `useIiotOverview`.
- Últimas métricas presentes en `telemetry.latestByMetric`: etiqueta compartida, valor
  Decimal como string, unidad, dispositivo y fecha de medición en Managua.
- Hasta cinco alertas recientes: severidad textual, tipo, métrica, valor, dispositivo
  y fecha. `reading === null` muestra `—`.
- **Ver monitoreo IIoT completo**, enlace interno a
  `/production/orders/{productionOrderId}/iiot`.

Se reutilizan `useIiotOverview`, `useIiotAlerts`, tipos, query keys, etiquetas y
formatters de Fase 7. Alertas usa la página existente de hasta 20 registros y presenta
solo los cinco primeros; los conteos nunca se calculan descargando el histórico.
No se copia la gráfica ni los selectores del dashboard. No se agregan dependencias.
Los hooks detienen polling en COMPLETED; no hay timers manuales, WebSocket ni SSE.

## Estados y decisión humana

Con WARNING se presenta evidencia. Con CRITICAL se pide revisar las desviaciones,
sin seleccionar Rechazar, rellenar no conformidades, deshabilitar Aprobar ni bloquear
el formulario. Con cero alertas se informa su ausencia sin certificar Calidad.
Con cero lecturas se muestra un EmptyState: la inspección continúa siendo manual.
Carga y errores de overview/alertas se limitan al panel IIoT; el formulario mantiene
su propio estado y permite registrar la decisión.

El POST `/production/lots/:id/inspection` conserva su contrato: `result`,
`observations`, `nonConformities`. REJECTED requiere no conformidades. Solo ADMIN
y PRODUCCION pueden inspeccionar; los usuarios autenticados con acceso de consulta
pueden revisar la evidencia. La confirmación humana existente permanece intacta.
Una inspección registrada conserva responsable, fecha, observaciones y no conformidades,
y el contexto IIoT histórico sigue visible.

## Persistencia e independencia

La evidencia permanece en IiotReading/IiotAlert vinculadas a la OP. No hay snapshots
duplicados en QualityInspection, cambios de schema ni migraciones. No hay cambios
de backend de producción, thresholds o perfiles del simulador. Una inspección no
reconoce alertas: `acknowledgedAt` permanece intacto. No existe endpoint nuevo de
acknowledgement, ni comandos MQTT STOP/PAUSE/REJECT/APPROVE, ni control cerrado.

## Pruebas de aceptación

`QualityIiotContext.test.tsx` usa Vitest, Testing Library y TanStack Query reales
con respuestas HTTP controladas. Comprueba ubicación, resumen, precisión, enlace,
reading nullable, cinco alertas, vacío, WARNING, CRITICAL, historial, permisos y
aprobación explícita aun con carga o error de cada consulta IIoT.

`backend/test/iiot-quality.e2e-spec.ts` ejecuta AppModule y PostgreSQL reales, sin
mock de Prisma: crea OP/BOM/stock, inicia la OP, ingiere temperatura normal, WARNING
y CRITICAL con parser y motor reales, completa producción y consulta monitoreo.
La alerta no crea inspecciones, lotes ni movimientos de Calidad. El lote producido
permanece QUARANTINED con inspection null hasta la decisión humana. Prueba:

- CRITICAL + POST APPROVED → HTTP 201, QualityInspection APPROVED y Lot RELEASED.
- CRITICAL + POST REJECTED → HTTP 201 y Lot REJECTED; sin no conformidades recibe 422.
- Un usuario VENTAS no puede registrar la inspección (403).
- Igualdad completa de todas las filas IIoT antes/después, incluidos conteos, IDs,
  severity, type, readingId, productionOrderId y acknowledgedAt null.
- Overview y alerts siguen consultables e idénticos con OP COMPLETED.

La aceptación Docker existente en `docker/verify.mjs` añade a los cuatro perfiles
reales simulator → Mosquitto → NestJS → PostgreSQL las mismas comprobaciones antes
y después de su inspección APPROVED. `qualityEvidence` captura filas completas y
compara lecturas, alertas y movimientos. No se crea otra infraestructura Docker.
La visibilidad del contexto se prueba con Testing Library; Docker prueba el recorrido
simulador/API/persistencia. No se introduce un framework E2E de navegador.

Ejecutar con base dedicada `_test` según [setup](setup.md#8-pruebas) y
[Docker](docker.md). La CI existente ejecuta suites y aceptación Docker en PostgreSQL 18.

## Roadmap y evidencia de cierre

Verificación local completada el 30 de octubre de 2026, partiendo del merge de
Fase 7 / PR #28 en develop (`1f3ea69`). El PR conserva seis commits separados y
requiere revisión; no se realiza merge automático. CI se consulta sobre el commit
final del PR, sin sustituir su resultado por las pruebas locales.

| Fase | Entrega                   | Estado |
| ---- | ------------------------- | ------ |
| 1    | MQTT infrastructure       | ✅     |
| 2    | Persistence model         | ✅     |
| 3    | Ingestion                 | ✅     |
| 4    | Simulator                 | ✅     |
| 5    | Rules + alerts            | ✅     |
| 6    | Monitoring API            | ✅     |
| 7    | Dashboard                 | ✅     |
| 8    | Quality integration + E2E | ✅     |

| Comprobación ejecutada                                                  | Resultado                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                        | PASS; lockfile intacto                                                                      |
| `prisma:generate`, `prisma validate`                                    | PASS                                                                                        |
| Backend unitarias                                                       | 312 PASS                                                                                    |
| Backend E2E completo, PostgreSQL 18 / Linux                             | 495 PASS, 34 archivos                                                                       |
| Frontend completo, Linux                                                | 551 PASS, 28 archivos                                                                       |
| Casos nuevos de contexto de Calidad                                     | 12 PASS                                                                                     |
| Casos nuevos PostgreSQL, APPROVED y REJECTED                            | 2 PASS, también incluidos en el E2E completo                                                |
| Simulator unitarias                                                     | 51 PASS                                                                                     |
| Migration proofs, Linux                                                 | PASS compras, producción, ventas e IIoT                                                     |
| Prisma migrate diff                                                     | PASS: No difference detected                                                                |
| Frontend build, frontend lint, lint global, format:check y build global | PASS                                                                                        |
| Compose config, up --build -d --wait y ps                               | PASS; servicios saludables                                                                  |
| Docker E2E completo                                                     | PASS; CRITICAL + APPROVED → RELEASED, evidencia intacta                                     |
| Diff final                                                              | Revisado; sin cambios de schema, migraciones, thresholds, simulator o backend de producción |

Los intentos completos simultáneos en Windows sufrieron timeouts y se detuvieron;
las suites completas se ejecutaron después secuencialmente en Linux. El migration
proof existente de ventas usa `spawnSync('pnpm')`, que falla en Windows; el mismo
comando completo pasó dentro de Linux sin modificar el script ni ampliar timeouts.
Docker usó una base `_test` vacía separada de las suites para respetar el bootstrap
del primer administrador; al terminar se restauró la configuración habitual del stack.

La aceptación registró 120 lecturas de bar-normal sin alertas, 120 de bar-deviation
con 12 alertas, 240 de liquid-normal sin alertas y 240 de liquid-deviation con 39
alertas. Ambos perfiles de desviación incluyeron WARNING y CRITICAL. Estos conteos
documentan esta ejecución, sin convertirse en nuevos thresholds ni expectativas rígidas.
