# Compras: informe de implementación y validación

Fecha: 2026-10-13 (America/Managua). Rama: `feature/purchases`; destino: `develop`.
Base recibida: `887d2a108fb063bfbdd04d97659ac37b1de78528`, dos commits delante y ninguno
detrás de `origin/develop`. Los dos commits previos se conservaron. A-1 y C-1 se reutilizan;
no se integra ni se consulta código de `feature/inventory-movements` / PR #15.

## Alcance implementado

- OC DRAFT: creación, listado con filtros/paginación, detalle, edición, confirmación y
  cancelación permitida. Proveedor/productos activos; solo RAW_MATERIAL/CONSUMABLE.
- Cantidades/precios como strings; límites Decimal(18,4)/Decimal(14,4), importes por línea
  ROUND_HALF_UP a dos decimales, rechazo de overflow y total derivado.
- Recepción parcial/completa con filas repetidas y distintos almacenes; cantidades recibidas
  derivadas, validación agregada, mutex PostgreSQL de la OC y relectura tras el bloqueo.
- Reserva conjunta REC + LOT mediante DocumentSequenceService con año de Managua.
- Inventario crea lotes por fila trazable (RELEASED/QUARANTINED) y entradas positivas con
  reason nulo, origen FK, balances reconciliados y ledger append-only.
- Atomicidad de recepción, líneas, lotes, movimientos, saldos, estado y dos eventos RECEIVE.
  Pruebas fuerzan fallo del segundo movimiento y de la segunda auditoría, tras la primera
  escritura, y comprueban rollback total incluidos contadores y auditoría parcial.
- Nest modules sin providers duplicados, API/OpenAPI, RBAC ADMIN/COMPRAS para mutaciones;
  cualquier rol autenticado lee. UI con TanStack Query, RHF/Zod, componentes existentes,
  selección paginada de catálogos, formularios, acciones, historial y estados de carga/error/vacío.

## Migraciones y decisiones

Se conserva `20261013031753_purchase_receipt` porque ya estaba compartida en GitHub.
Se agrega `20261014010000_purchases_invariants`, transaccional, que reemplaza la matriz de
movimientos, añade unicidad/índices, FKs compuestas recepción-línea/producto,
lote-recepción/producto y movimiento-recepción/producto/almacén/cantidad. Detecta lotes
previos sin origen y detiene el upgrade sin backfill. La instalación limpia y el upgrade
con ajustes, stock, auditoría, BOM, OP y contadores existentes se verifican en PostgreSQL 18.
No hay drift. La reversión de un despliegue con recepciones requiere binario compatible o
restauración explícita; no se incluye down migration que pierda datos.

`expectedDate: null` borra la fecha; `items` reemplaza líneas solo en DRAFT. Fechas de calendario
para entrega/vencimiento y timestamp con zona para recepción; UI en Managua. `originatedAt =
receivedAt`. Recepción devuelve detalle de OC y además se ofrece consulta de historial.
Los flags de trazabilidad/calidad se releen bajo lock; si cambian mientras se planifica,
se exige reintentar sin adquirir secuencias después del catálogo. El proveedor también se
revalida activo al recibir. No se modificaron ADR aceptados.

## Contratos compartidos modificados

- DocumentSequenceService: prefijos OC/REC, conservando nextCode/nextCodes y OP/LOT.
- MovementOrigin: unión tipada PURCHASE_RECEIPT con purchaseReceiptItemId.
- resolveMovement: entrada empresarial positiva con reason nulo; ajustes conservados.
- InventoryService: descripción newLot por línea, creación operacional y retorno de movimientos
  con sus lotId; lockPurchaseCatalog obtiene locks de productos/almacenes antes de las FKs de
  documentos y applyMovements reutiliza esos locks dentro de la misma transacción.
- Validadores backend comunes de precio y fecha, conservando tipos JSON originales.
- Validador decimal frontend común: se extrae sin cambiar la regla utilizada por C-1.
- Fixtures de lotes A-1/C-1: ahora tienen origen de compra explícito, sin alterar el inventario.

## Evidencia local

| Comprobación                                             | Resultado                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Backend unitarias                                        | 183/183, 11 suites                                                           |
| Frontend                                                 | 406/406, 16 suites                                                           |
| Backend E2E PostgreSQL 18                                | 309/309, 22 suites                                                           |
| Instalación limpia + upgrade con datos + lotes huérfanos | PASS (`pnpm --filter backend test:migrations`)                               |
| Drift Prisma                                             | Sin diferencias                                                              |
| Prisma generate                                          | PASS                                                                         |
| Lint y formato                                           | PASS, ambos proyectos y repositorio completo                                 |
| Backend/frontend build                                   | PASS                                                                         |
| Docker Compose y smoke empresarial                       | PASS: imágenes, salud, CORS, cookie, API OC/recepciones y reconciliación SQL |
| Diff y publicación                                       | Diff limpio; publicación posterior a la validación local                     |

Las corridas iniciales con numerosos workers agotaron tiempos en suites existentes, con
aproximadamente 300 MB de RAM libre en el equipo. La corrida completa final se ejecutó
secuencialmente, frontend con `--maxWorkers=1`, frontend/E2E con `--testTimeout=30000
--hookTimeout=30000`. No se modificaron las aserciones ni los límites de CI para ocultar fallos.
Las excepciones de auditoría/movimientos en logs son los fallos forzados esperados de rollback.

La validación local completa está verde y la rama está lista para PR contra develop.
Los checks remotos se dispararán al abrir el PR; no equivalen a validación ya ejecutada.
Vite conserva el aviso de chunk principal superior a 500 kB; el build finaliza correctamente.
El stack Compose de validación se detuvo después de verificarlo y utilizó puertos/volumen
propios. La base PostgreSQL 18 de E2E también es una base *_test aislada.

## Limitaciones de alcance

No hay idempotencia HTTP parcial, reversas, transferencias, reservas, FIFO/FEFO, liberación
manual de cuarentena, C-2, consumo/output de producción, ventas ni despacho. Los flags de
trazabilidad/calidad usan el catálogo existente; su configuración y las vistas de stock,
movimientos y lotes corresponden a A-2 después de actualizarse con Compras integrada.
No se hizo merge a develop. La integración requiere el PR y sus checks de GitHub.

## Archivos de esta continuación

La relación completa se obtiene con `git diff --name-only 887d2a1..HEAD` tras los commits.
Se incluye a continuación el manifiesto concreto de archivos cambiados.

- `.github/workflows/ci.yml`
- `backend/eslint.config.mjs`
- `backend/package.json`
- `backend/prisma/migrations/20261014010000_purchases_invariants/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/common/date.dto.ts`
- `backend/src/common/decimal.dto.ts`
- `backend/src/common/document-sequence/document-sequence.service.spec.ts`
- `backend/src/common/document-sequence/document-sequence.service.ts`
- `backend/src/inventory/movements/inventory.service.ts`
- `backend/src/inventory/movements/movement-origin.ts`
- `backend/src/inventory/movements/movement-rules.spec.ts`
- `backend/src/inventory/movements/movement-rules.ts`
- `backend/src/purchases/purchase-orders/dto/create-purchase-order.dto.ts`
- `backend/src/purchases/purchase-orders/dto/purchase-orders-query.dto.ts`
- `backend/src/purchases/purchase-orders/dto/purchase-orders.dto.spec.ts`
- `backend/src/purchases/purchase-orders/dto/receive-purchase-order.dto.ts`
- `backend/src/purchases/purchase-orders/dto/update-purchase-order.dto.ts`
- `backend/src/purchases/purchase-orders/purchase-order-errors.ts`
- `backend/src/purchases/purchase-orders/purchase-order-mapping.ts`
- `backend/src/purchases/purchase-orders/purchase-order-rules.spec.ts`
- `backend/src/purchases/purchase-orders/purchase-order-rules.ts`
- `backend/src/purchases/purchase-orders/purchase-orders-response.ts`
- `backend/src/purchases/purchase-orders/purchase-orders.controller.ts`
- `backend/src/purchases/purchase-orders/purchase-orders.module.ts`
- `backend/src/purchases/purchase-orders/purchase-orders.service.ts`
- `backend/src/purchases/purchase-orders/purchase-receipts.service.ts`
- `backend/src/purchases/purchases.module.ts`
- `backend/test/foundation.e2e-spec.ts`
- `backend/test/purchases-migrations.mjs`
- `backend/test/purchases.e2e-spec.ts`
- `backend/test/support/inventory-fixtures.ts`
- `docker/verify.mjs`
- `docs/api.md`
- `docs/database.md`
- `docs/progress.md`
- `docs/purchases-validation.md`
- `docs/requirements.md`
- `docs/specs/2026-10-10-inventory-purchases-production-design.md`
- `frontend/src/features/production/schemas.ts`
- `frontend/src/features/purchases/api/orders.ts`
- `frontend/src/features/purchases/components/OrderCatalogPicker.tsx`
- `frontend/src/features/purchases/components/PurchaseOrderForm.tsx`
- `frontend/src/features/purchases/components/PurchaseReceiptForm.tsx`
- `frontend/src/features/purchases/order-schemas.test.ts`
- `frontend/src/features/purchases/order-schemas.ts`
- `frontend/src/features/purchases/pages/NewPurchaseOrderPage.tsx`
- `frontend/src/features/purchases/pages/PurchaseOrderDetailPage.tsx`
- `frontend/src/features/purchases/pages/PurchaseOrders.test.tsx`
- `frontend/src/features/purchases/pages/PurchaseOrdersPage.tsx`
- `frontend/src/layouts/navigation.ts`
- `frontend/src/lib/decimal.ts`
- `frontend/src/routes/AppRoutes.tsx`

## Commits de esta continuación

1. `0667fc6` — persistencia, numeración y contrato de Inventario para recepción.
2. `3a1624f` — DTOs/validación, reglas y servicio de órdenes de compra.
3. `312ad66` — recepción atómica, API/RBAC y E2E.
4. `3056c98` — frontend de Compras y validación decimal compartida.
5. `1ec092d` — pruebas reproducibles de migraciones/upgrade y smoke Docker en CI.
6. `docs(purchases): record workflow and validation evidence` — contrato, estado,
   requisitos, decisiones y este informe. El SHA final se reporta al publicar la rama.
