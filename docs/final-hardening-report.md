# C7 — Hardening final

Base: `41f633522d955291fcdea94922b5365a144ab046` (`develop`, PR #37 mergeado).
Alcance: bugs reproducibles, regresiones y operación. Sin features, módulos,
upgrades, cambios de fórmulas, esquema ni migraciones. C6 no se modifica.

## Hallazgos y pruebas

| Área / riesgo                             | Evidencia y resultado antes                                                                                                                        | Fix / regresión                                                                                                                                                                                                            | Resultado final                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Logs HTTP / secretos en errores de driver | Error DB controlado en `/auth/me`: respuesta genérica, pero Nest imprimía mensaje/stack con sentinelas DATABASE_URL y passwordHash; regresión roja | `SafeExceptionFilter`, registrado con APP_FILTER, conserva HttpException de dominio y el 500 existente; logs inesperados solo con requestId generado por servidor. Captura de errores del test ahora incluye message/stack | PASS — Windows y E2E completo C7 |
| Windows / falso fallo del preflight C5    | El test lanzaba `pnpm` sin shell con cwd obtenido de URL.pathname; stdout/stderr nulos, regresión roja                                             | `fileURLToPath` y ejecución del CLI pnpm activo con Node/argumentos separados, sin shell; comprueba error de spawn y ausencia de escrituras                                                                                | PASS — Windows y Linux           |
| Ruta de negocio declarada pública         | Test anterior detectaba política ausente pero aceptaba cualquier Public                                                                            | Arquitectura enumera controllers Nest y exige allowlist exacta GET HealthController.check / POST AuthController.login; roles no vacíos/válidos                                                                             | PASS — E2E C7                    |
| Dos simulaciones simultáneas              | Reserva síncrona existente antes del primer await                                                                                                  | Nueva regresión 202/409, exactamente un dispositivo y un child; CANCELLED añadido a estados rechazados                                                                                                                     | PASS — E2E C7                    |
| Dos OP consumen mismo lote                | El test anterior competía solo sobre material sin lote                                                                                             | Extendido a tracked=true: un éxito, un conflicto, lote restante cero, un consumo y reconciliación saldo/ledger                                                                                                             | PASS — E2E C7                    |
| SCRAP después de salida parcial           | Existía cobertura multi-almacén pero sin reducción previa                                                                                          | Nueva regresión: producido 125, ajuste -119, SCRAP -6, saldo cero                                                                                                                                                          | PASS — E2E C7                    |
| Activación de factores por producto       | Índice parcial único existente; faltaba carrera por API                                                                                            | Dos factores inactivos: activación concurrente 200/409, un activo y un ENABLE auditado                                                                                                                                     | PASS — E2E C7                    |

## Auditoría sin duplicar pruebas existentes

`Reviewed — no issue found` indica revisión del mecanismo y evidencia citada; no
significa que se haya inventado una prueba nueva para cada requisito.

| Área revisada / riesgo                         | Mecanismo y evidencia existente                                                                                                                                                                                                                                         | Dictamen                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Auth, cookie, revocación y cambio pendiente    | `auth.e2e-spec.ts`, `users.e2e-spec.ts`; tokenVersion consultado en DB, usuario activo, HS256/expiración, logout global; HttpOnly/Strict y Secure en production                                                                                                         | Reviewed — no issue found |
| Matriz RBAC                                    | Policies de controllers: COMPRAS compras/proveedores/recepción; INVENTARIO catálogos/ajustes; PRODUCCION BOM/rutas/OP/calidad/simulación/huellas; VENTAS clientes/órdenes/despachos; ADMIN usuarios/factores/perfiles circulares. Lecturas Authenticated según contrato | Reviewed — no issue found |
| Recursos inválidos/inexistentes                | ParseUUIDPipe y 404 existentes en OP, lotes/quality, ventas y huellas; `production-orders`, `quality-disposition`, `sales-dispatch`, `sustainability` E2E                                                                                                               | Reviewed — no issue found |
| DTO / cantidades / extras                      | ValidationPipe global whitelist + forbidNonWhitelisted; validadores de UUID/enum/decimal/calendario; DTO specs y E2E de cada módulo                                                                                                                                     | Reviewed — no issue found |
| Paginación / orden estable                     | PaginationQueryDto: 1/20/max100, límites comprobados; listados usan id como desempate o código único. Includes/groupBy en listas/rutas/dashboard y carga por nivel en manufacturing structure                                                                           | Reviewed — no issue found |
| Inventario y doble recepción                   | InventoryService bloquea catálogo/saldos/lotes en orden estable y usa Decimal; `inventory-service`, `catalog-adjustments-concurrency`, `purchases` y `sales-dispatch` E2E                                                                                               | Reviewed — no issue found |
| Inicio/completion y despachos repetidos        | Locks de documento, estados terminales y transacción única; `production-execution`, `sales-dispatch` E2E. No se introduce idempotency key                                                                                                                               | Reviewed — no issue found |
| Inspección/disposition concurrentes            | Lock OP y únicos por lote; `production-execution` y `quality-disposition` E2E, un 201 y un 409; ledger QUALITY_SCRAP no duplicado                                                                                                                                       | Reviewed — no issue found |
| Políticas de lotes                             | Solo RELEASED consumible/despachable; C2 prueba REWORK/SCRAPPED, producción y ventas cubren cuarentena/rechazo, C6 prueba despacho de cuarentena confirmado por venta de control                                                                                        | Reviewed — no issue found |
| Carbono / circularidad / snapshots             | `sustainability.e2e-spec.ts`: duplicados, finalize concurrente, catálogo histórico, missingFactors, mutaciones FINALIZED rechazadas; cantidades positivas impiden división por cero; circularidad separada                                                              | Reviewed — no issue found |
| Decimal                                        | Aritmética de stock/BOM/ventas con Prisma.Decimal; carbono con Decimal de precisión ampliada y redondeo definido. Number solo para conteos/años; sin parseFloat de cantidades                                                                                           | Reviewed — no issue found |
| Auditoría                                      | Mutaciones y AuditLog en misma transacción; fallos inyectados revierten negocio/saldo/secuencia. Actor/entity/action/timestamp comprobados en E2E y C6                                                                                                                  | Reviewed — no issue found |
| Constraints / índices                          | 19 migraciones existentes: únicos de catálogos/lotes/inspection/disposition/footprint y enlaces de movimientos, checks y triggers; índices para consultas reales. No ausencia evidente que justifique migración                                                         | Reviewed — no issue found |
| SQL crudo                                      | En producto, único RawUnsafe encontrado: literal fijo SET TRANSACTION READ ONLY en demo-checks; resto usa plantillas parametrizadas. DDL de test limitado a bases dedicadas                                                                                             | Reviewed — no issue found |
| IIoT / orphan / entorno                        | `iiot-ingestion` rechaza OP/device inválidos sin huérfanos; parser valida topic/UUID/dispositivo y no acepta wildcards. `mqtt.service.spec.ts` prueba reconexión, aislamiento y cierre; runner fijo, sin shell, env mínimo, production deshabilitado                    | Reviewed — no issue found |
| Procesos y handles                             | SimulationService.stop/completion, MqttService.endAsync/pending y app.close; tests runner/servicio y salida normal Vitest, sin forceExit                                                                                                                                | Reviewed — no issue found |
| BOM / ruta / estructura                        | `production-bom-cycles`: A→A, A→B→A, A→B→C→A y activación concurrente; DFS iterativo, visitados y memoización. Rutas con secuencia única y reemplazo bajo lock. No límite de profundidad nuevo                                                                          | Reviewed — no issue found |
| Dashboard / fechas / vacíos                    | `production-dashboard` E2E y frontend: ceros, fechas de Managua, filtro por producto/UOM y sin totales de unidades mezcladas. Calendar-date/planning-dates prueban parsing                                                                                              | Reviewed — no issue found |
| Frontend / carga, vacío, error, doble clic     | LoadingState/EmptyState/ErrorNotice y apiFetch; suites ProductionExecution, QualityDisposition, IiotSimulationControl, Sustainability, PurchaseOrders, SaleOrderDetailPage/DispatchForm cubren pendientes, confirmación, 409 y visibilidad por rol/estado               | Reviewed — no issue found |
| Acceso directo / IDs inválidos / accesibilidad | AppRoutes carga detalles desde URL; errores API manejados sin navigation state; ParseUUIDPipe, notices y guards. FormField usa label/aria-describedby; errores role=alert, acciones type/disabled; pruebas de foco y teclado existentes                                 | Reviewed — no issue found |
| CORS / API URL / consola                       | main.ts restringe origen frontend y credentials, cookies según entorno; apiFetch usa VITE_API_URL/credentials include y oculta 5xx. Sin console.log/debug accidentales en producto (ejemplo de generación de JWT es texto de diagnóstico)                               | Reviewed — no issue found |
| Secretos de repo / seed                        | .env excluido de Git/Docker; ejemplos son placeholders. demo password por entorno/preflight antes de DB, seed no inicia con backend; no valores reales detectados en archivos versionados                                                                               | Reviewed — no issue found |

## Matriz final de regresión

Resultados locales de C7 sobre su código, sin reutilizar ejecuciones de C6.
La aprobación definitiva de CI se consulta en los checks del PR de esta rama:
[ejecuciones C7](https://github.com/Luigui789/Manufactura/actions?query=branch%3Afeature%2Ffinal-hardening-freeze).

| Module         | Unit                    | E2E  | Integrated | Docker | Status |
| -------------- | ----------------------- | ---- | ---------- | ------ | ------ |
| Auth           | PASS                    | PASS | PASS       | PASS   | PASS   |
| Purchases      | PASS                    | PASS | PASS       | PASS   | PASS   |
| Inventory      | PASS                    | PASS | PASS       | PASS   | PASS   |
| Production     | PASS                    | PASS | PASS       | PASS   | PASS   |
| Quality        | PASS (DTO/traceability) | PASS | PASS       | PASS   | PASS   |
| Sales          | — (E2E)                 | PASS | PASS       | PASS   | PASS   |
| IIoT           | PASS                    | PASS | PASS real  | PASS   | PASS   |
| Sustainability | PASS                    | PASS | PASS       | PASS   | PASS   |
| Demo           | PASS                    | PASS | PASS       | PASS   | PASS   |

- Backend: 395 unitarias, 594 E2E en 42 archivos; siete proofs de migraciones PASS.
- Repetición de producción/calidad/sostenibilidad/simulación: 79 tests PASS; drift: No difference detected. Docker top confirma que el worker vuelve a tail, sin Vitest ni simulador residual.
- Frontend: 632 tests, build y lint PASS. Simulador: 51 tests PASS.
- Install frozen lockfile, generate/validate Prisma, root lint y build PASS.
- C6 sin cambios: PASS con PostgreSQL/MQTT/simulador reales (56.1 s de test local).
- Gate limpio: seed/verify READY dos veces; segundo seed sin cambios.
- Gate integrado separado: READY → C6 PASS → NOT READY (salida 1 esperada), ledger inicial PASS.
- PowerShell: demo:seed y demo:verify READY; preflight negativo corregido PASS.
- Docker: boot con volúmenes nuevos, cuatro servicios healthy; restart backend
  conserva 10 productos / 6 movimientos iniciales / 5 usuarios; MQTT reconecta y resuscribe.
- Despachos: carrera de dos salidas 5 sobre saldo 5, un 200/un 409; saldo y lote cero.
- Root format:check PASS; búsqueda de skips/only/todo nuevos vacía antes del commit final.

Performance smoke (lectura por API real contra la base usada de C6; sesión de
prueba firmada para PRODUCCION, sin escrituras ni secretos en la salida):

| Endpoint                      | HTTP | ms locales |
| ----------------------------- | ---- | ---------- |
| Products lista                | 200  | 124        |
| Production dashboard filtrado | 200  | 79         |
| Lot traceability              | 200  | 116        |
| Manufacturing structure       | 200  | 35         |
| IIoT overview                 | 200  | 71         |
| Footprint                     | 200  | 72         |

No es benchmark ni SLA. El smoke manual queda como procedimiento para el ensayo;
la regresión frontend automatizada cubre carga, vacíos, errores y acciones sensibles.

## Operación y límites

El stack de aceptación C7 usa volúmenes/puertos nuevos, sin borrar datos previos.
Los comandos Windows oficiales se verifican con builds secuenciales: no ejecutar
varios `nest build` sobre el mismo dist al mismo tiempo. Linux/CI es el gate de
regresión completa; fallos por timing en Windows se investigan sin inflar timeouts.
`tsc --noEmit` adicional tenía errores de tipos en tests fuera del build oficial;
se documentan y no motivan una refactorización general. No se actualiza argon2
ni approve-builds por un warning con instalación/CI funcionales.

La estructura acíclica se carga por niveles pero su representación es recursiva;
no se promete profundidad arbitraria. Los perfiles IIoT son sintéticos, QoS 0
descartable y el control de simulación reside en memoria de una instancia. C6
valida lecturas, no una cantidad exacta; completar una OP mientras su simulador
continúa publicando puede rechazar lecturas tardías. No se incorpora HA ni MRP.
Ver [freeze](feature-freeze.md) y [runbook](defense-runbook.md).

Warnings no bloqueantes observados: deprecación de consultas concurrentes de pg y MaxListeners en pruebas concurrentes; Vitest termina normalmente sin forceExit. Build frontend advierte chunks grandes. Errores adicionales de tsc fuera del build: traceability.service.spec.ts, production-boms.e2e-spec.ts y purchase-inventory.e2e-spec.ts (preexistentes); no se añaden errores de C7. Los 5xx inesperados omiten el stack crudo por seguridad y conservan correlación por requestId.
