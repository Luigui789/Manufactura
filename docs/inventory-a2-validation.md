# PR #15 — validación de Inventario A-2 sobre Compras

Base: `develop` en `f73cf89094414e17faebfc36cdc081e1cfcd4968` (PR #16 integrado).
Rama: `feature/inventory-movements`. PR: https://github.com/Luigui789/Manufactura/pull/15.

## Historia y conflicto

Se conserva el HEAD original `0f27076c5970a7e067bcb7de68156f33a6d8aafd` y sus tres commits:
`49d9104`, `c4efea3`, `0f27076`. Se incorpora `origin/develop` mediante merge `89a0ce5`.
El único conflicto fue `frontend/src/routes/AppRoutes.tsx`; se conservaron las rutas
autenticadas de listado/detalle de Compras y las tres pantallas de Inventario,
además de creación de OC protegida por rol. La navegación se combinó automáticamente.
No se hizo rebase, reset, force-push ni merge del PR a develop.

## Commits de actualización

- `89a0ce5` — merge de develop conservando el historial de A-2 y Compras.
- `6a4ede7` — consultas de origen empresarial y referencias de recepción.
- `7201b85` — invalidación específica de inventory/lots tras receive.
- `6730036` — UI de origen, movimientos, calendario y validación de ajustes.
- `50c2367` — pruebas Purchase ↔ A-2, pantallas, rutas y smoke Docker.
- Commit final de documentación — contratos actuales, progreso e informe de validación.

## Resultado funcional

- Consultas de lotes: FK concreta PurchaseReceiptItem → PurchaseReceipt → PurchaseOrder → Supplier;
  lista y detalle exponen `origin` con REC, OC y proveedor. Se excluyen los objetos Prisma internos.
  Un vínculo ausente con FK presente produce error de integridad, nunca un placeholder silencioso.
- Movimientos: `purchaseReceiptItemId`, `businessReference` con REC/OC y null para ajustes;
  filtro y etiqueta de `PURCHASE_RECEIPT`, motivo null y referencia visibles en UI.
- DATE: `expiresAt` se serializa YYYY-MM-DD, se muestra dd/mm/yyyy sin conversión local;
  originatedAt/occurredAt/receivedAt siguen siendo timestamps. expectedDate no se transforma.
- Receive exitoso invalida inventory/lots además de las queries de Compras existentes;
  confirmar, cancelar y recepciones fallidas no invalidan esos prefijos.
- Ajustes: solo ADJUSTMENT_IN/OUT; cantidad decimal compartida, lote obligatorio si trazable,
  errores visibles y reintento de consultas. No crean recepciones ni lotes operativos.
- Productos: se conserva quality → trazabilidad y el bloqueo tras cualquier movimiento,
  incluso saldo cero; unidad/tipo y auditoría siguen sus reglas.
- Stock físico conserva todo estado de lote; disponibilidad consumible solo RELEASED.

No se modifican PurchaseReceiptsService, InventoryService, schema Prisma ni migraciones
respecto de develop. No se incorpora C-2, ejecución de producción, calidad completa, ventas,
transferencias, reservas ni FIFO/FEFO.

## Evidencia nueva

- `purchase-origin.spec.ts`: null para ajustes y fallo explícito ante relación de recepción ausente.
- `purchase-inventory.e2e-spec.ts`: tres recepciones reales por HTTP (sin lote, RELEASED,
  QUARANTINED), consultas stock/movimientos/lotes, fechas, REC/OC/proveedor, actor y almacén,
  stock consumible, REJECTED como existencia física, configuración bloqueada incluso tras agotar
  saldo y rechazo de PURCHASE_RECEIPT en ajustes.
- `lots-api.e2e-spec.ts`: fixtures con origen empresarial explícito.
- `InventoryPages.test.tsx`: existencias/carga/filtros/paginación/empty/permisos de los cinco roles;
  movimientos de ajuste y compra/REC/filtro/paginación; lotes/origen/calendario/detail/empty;
  errores y retry en páginas y detalle; ajustes no trazables/trazables/lote/cantidades/éxito/error.
- `orders.test.tsx`: invalidación de listados y detalle inventory/lots solo tras receive exitoso.
- `calendar-date.test.ts`: demuestra que UTC midnight se vuelve 13 de octubre en Managua,
  mientras formatCalendarDate conserva 14/10/2026.
- `AppRoutes.test.tsx`: rutas OC listado/creación/detalle y navegación Purchase + Inventario.
- `docker/verify.mjs`: mantiene flujo completo Compras y reconciliación SQL; añade endpoints A-2
  autenticados, stock, movimientos con REC/OC y lote real QUARANTINED con origen y fecha DATE.

## Validación

Los checks locales se ejecutan secuencialmente, con un worker frontend y timeout/hook de 30s
por la memoria disponible; no se cambian límites, aserciones ni configuración de CI.
Se reutiliza el lockfile existente y dependencias instaladas, sin cambios de paquetes.

| Check                           | Resultado                                 |
| ------------------------------- | ----------------------------------------- |
| Prisma generate                 | PASS, Prisma 7.10.0                       |
| Lint completo                   | PASS                                      |
| Prettier completo               | PASS                                      |
| Builds backend/frontend         | PASS                                      |
| Backend unitario                | 184 PASS                                  |
| Frontend completo               | 444 PASS                                  |
| AppRoutes                       | 38 PASS dentro de la suite completa       |
| E2E PostgreSQL 18               | 355 PASS                                  |
| Migraciones desde base vacía    | 8 migraciones PASS                        |
| Pruebas upgrade y origen legado | 3 escenarios PASS                         |
| Drift schema vs base migrada    | PASS, sin diferencias                     |
| Docker development              | PASS, build/health/Compras/A-2/SQL/logout |
| git diff --check                | PASS                                      |

Total: **983 pruebas de las suites + 3 escenarios de migración aprobados**.
El proyecto Docker aislado `a2-validation` se construyó y sus contenedores se detuvieron
al terminar; la base exclusiva fue `ecosoap_a2_docker_test`.

Base E2E exclusiva: `ecosoap_a2_integration_test`, PostgreSQL 18-alpine en puerto 5440.
Los escenarios de migración usan schemas efímeros y preservan ledger, balances, auditorías,
BOM, OP y contadores; lotes legados sin origen bloquean la migración atómicamente.
No se crea ni modifica ninguna migración de A-2.

La CI final ejecuta ambos jobs (Quality and tests y Docker development) sobre el HEAD
publicado. Su SHA y el estado final de mergeabilidad se registran en la descripción del
PR #15 y en el informe de entrega tras observar los checks, sin fusionar el PR.
Los avisos de chunk grande de Vite y de pg son informativos; los logs de fallos de auditoría
son provocados por pruebas de rollback y no representan fallos de las suites.

## Archivos del diff contra develop

- `backend/src/inventory/inventory.module.ts`
- `backend/src/inventory/lots/dto/lots-query.dto.ts`
- `backend/src/inventory/lots/lots.controller.ts`
- `backend/src/inventory/lots/lots.module.ts`
- `backend/src/inventory/lots/lots.service.ts`
- `backend/src/inventory/movements/adjustment.controller.ts`
- `backend/src/inventory/movements/adjustment.service.ts`
- `backend/src/inventory/movements/dto/create-adjustment.dto.ts`
- `backend/src/inventory/movements/dto/movements-query.dto.ts`
- `backend/src/inventory/movements/inventory-errors.ts`
- `backend/src/inventory/movements/movement-query.service.ts`
- `backend/src/inventory/movements/movements-query.controller.ts`
- `backend/src/inventory/movements/movements.module.ts`
- `backend/src/inventory/products/dto/products.dto.ts`
- `backend/src/inventory/products/products.controller.ts`
- `backend/src/inventory/products/products.service.ts`
- `backend/src/inventory/purchase-origin.spec.ts`
- `backend/src/inventory/purchase-origin.ts`
- `backend/src/inventory/stock/dto/stock-query.dto.ts`
- `backend/src/inventory/stock/stock-query.service.ts`
- `backend/src/inventory/stock/stock.controller.ts`
- `backend/src/inventory/stock/stock.module.ts`
- `backend/test/catalog-concurrency.e2e-spec.ts`
- `backend/test/inventory-api.e2e-spec.ts`
- `backend/test/lots-api.e2e-spec.ts`
- `backend/test/movements-query.e2e-spec.ts`
- `backend/test/products-history.e2e-spec.ts`
- `backend/test/products.e2e-spec.ts`
- `backend/test/purchase-inventory.e2e-spec.ts`
- `backend/test/stock-api.e2e-spec.ts`
- `docker/verify.mjs`
- `docs/api.md`
- `docs/inventory-a2-validation.md`
- `docs/progress.md`
- `frontend/src/features/inventory/api/inventory-data.ts`
- `frontend/src/features/inventory/api/inventory-hooks.ts`
- `frontend/src/features/inventory/components/products/CreateProductDialog.tsx`
- `frontend/src/features/inventory/components/products/EditProductDialog.tsx`
- `frontend/src/features/inventory/components/products/ProductDetailDialog.tsx`
- `frontend/src/features/inventory/components/stock/AdjustmentDialog.tsx`
- `frontend/src/features/inventory/inventory-labels.ts`
- `frontend/src/features/inventory/pages/InventoryPages.test.tsx`
- `frontend/src/features/inventory/pages/LotsPage.tsx`
- `frontend/src/features/inventory/pages/MovementsPage.tsx`
- `frontend/src/features/inventory/pages/ProductsPage.test.tsx`
- `frontend/src/features/inventory/pages/StockPage.tsx`
- `frontend/src/features/inventory/schemas.ts`
- `frontend/src/features/purchases/api/orders.test.tsx`
- `frontend/src/features/purchases/api/orders.ts`
- `frontend/src/layouts/navigation.ts`
- `frontend/src/lib/calendar-date.test.ts`
- `frontend/src/lib/calendar-date.ts`
- `frontend/src/routes/AppRoutes.test.tsx`
- `frontend/src/routes/AppRoutes.tsx`
