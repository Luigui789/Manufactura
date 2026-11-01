# C6 — Mapa de evidencia de defensa

Fuente automatizada: `backend/test/integrated-defense.e2e-spec.ts`, ejecutada con
`pnpm demo:e2e`. Preparación y navegación manual: [guion](defense-demo-checklist.md).
Las transacciones se crean por REST; Prisma se usa exclusivamente para consultar
catálogos y realizar assertions profundas. Se reutiliza el dataset oficial C5.

| Rúbrica      | Evidencia real                                             | Verificación C6                                                                             |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Compras      | PurchaseOrder + PurchaseReceipt                            | SUP-ACU-001, 10000 mL, confirmación, recepción y movimiento con lote                        |
| Inventario   | StockBalance, InventoryMovement, Lot; GET /inventory/stock | Crudo 10000 → 5000; intermedio 5000; barra 10 → 5; lote remanente desde ledger              |
| BOM          | BOM activa v1 multinivel                                   | Requirements exactos por OP, sin explosión de MP-ACU en terminados                          |
| Ruta         | ProductionRoute + RouteOperation                           | Ruta oficial líquido con embotellado, tapado y etiquetado                                   |
| MES          | ProductionOrder + lotes                                    | Inicio IN_PROGRESS; consumos y output reales; intermedio RELEASED y terminados QUARANTINED  |
| Trazabilidad | GET /production/lots/:id/traceability                      | Grafo filtrado → OP → lote crudo → recepción → OC → proveedor                               |
| IIoT         | POST /iiot/production-orders/:id/simulation                | CLI real → MQTT real → persistencia; bar normal/deviation y liquid normal                   |
| Monitoreo    | GET overview, readings, alerts de la OP                    | Dispositivo, lecturas propias, contrato de alertas y WARNING/CRITICAL sin fijar regla       |
| Calidad      | QualityInspection + QualityDisposition                     | Despacho de cuarentena 409 sin efectos; APPROVED → RELEASED; REJECTED → SCRAP               |
| Carbono      | ProductionFootprint + CarbonActivity                       | DRAFT; snapshots de factores; 5 kWh manuales; preview Decimal, FINALIZED, inmutabilidad 409 |
| Circularidad | USED_COOKING_OIL_RECOVERED                                 | 5000 mL = 5 L, separado de la suma de emisiones                                             |
| Packaging    | Movimientos y actividades de líquido                       | Botella/tapa/etiqueta -10 cada una y factores PACKAGING sin faltantes                       |
| Ventas       | SaleOrder + SaleDispatch                                   | CLI-VERDE-001, orden confirmada 5 UNIT, despacho -5 con soapLotId                           |
| KPIs         | GET /production/dashboard?productId=…                      | OP principal completada, planificado/producido en UNIT, sin sumas de unidades distintas     |
| Auditoría    | AuditLog por entityId y actorUser.role                     | CONFIRM, RECEIVE, COMPLETE, QUALITY_APPROVE, FINALIZE_CARBON_FOOTPRINT, DISPATCH            |
| RBAC         | Guards reales con cinco cuentas oficiales                  | Roles funcionales positivos y tres 403 negativos                                            |
| Dataset      | verifyDemoDataset + formatChecks                           | READY antes; NOT READY después; ledger inicial PASS y readiness de inventario FAIL          |

## Límites de la evidencia

Los perfiles IIoT y factores DEMO son sintéticos y académicos. La energía es una
actividad manual; no se infiere de sensores. La huella es parcial cradle-to-gate,
sin compensar carbono con circularidad ni presentar el precio de compra como KPI.
La ruta describe operaciones, sin inventar eventos de ejecución por operación.
No se evalúa visualmente el frontend IIoT dentro del E2E.

Solo existe dashboard de Producción en esta base C5. Inventario, compras, ventas,
calidad y general no tienen endpoints de dashboard; la evidencia correspondiente
son sus contratos transaccionales. C6 no añade módulos, esquema ni migraciones.

## Ejecución en CI y Docker

El job `docker-development`, step `Integrated defense E2E`, crea una base nueva
`ecosoap_defense_ci_test`, aplica migraciones y dataset, comprueba READY y ejecuta
el test dentro de la imagen backend. Usa PostgreSQL y Mosquitto de Compose y el
simulador real empaquetado en esa imagen; no publica MQTT desde la prueba.
La suite E2E general se ejecuta por separado para conservar su aislamiento.
El resultado de CI debe consultarse en el PR; la mera presencia del step no
constituye evidencia de una ejecución exitosa.
