# RF-VEN-003 — validación de despachos de venta

## Identificación

- PR: #20, `feature/sales-dispatch` → `develop`.
- Base incorporada: `d410d397728d81cd72058693d334df044570b10e` (merge de PR #19).
- HEAD publicado revisado antes de estas correcciones: `3f30d27014d8d8a80ff66ea141f583c03530a07d`.
- HEAD corregido integrado: `13286aab514d01af5f409aac79081f1999fa2757`; merge PR #20 en `develop`: `e79e6f7f5cb3a5d6d13a07282c1d2bf473ada0bb`.
- Alcance: RF-VEN-003. No se implementa el trabajo del Integrante 3.
- Estado RF-VEN-003: **Integrated** en `develop` por PR #20. La Fase 3 de trazabilidad de salidas se documenta separadamente en `sales-traceability-validation.md`.

## Correcciones de esta revisión

1. `SaleDispatchForm` asigna una clave local estable a cada fila. La selección de almacén y lote queda dentro de la fila junto con sus valores de request; la eliminación no puede reasociar datos por índice. El resumen usa la misma fila que produce el payload.
2. `InventoryService.prepareExistingMovementResources()` comparte el protocolo de productos ordenados, almacenes ordenados, creación de balances faltantes con `skipDuplicates`, bloqueo ordenado de balances y bloqueo ordenado de lotes. No escribe movimientos. `SalesDispatchService` lo llama dentro de su transacción antes de crear `SaleDispatchItem`; `applyMovements()` reutiliza el mismo helper.
3. Producto/almacén inexistente o inactivo y lote inexistente o ajeno se validan antes de insertar las líneas de despacho. Un almacén inexistente produce `REFERENCE_NOT_FOUND` controlado, no un error FK de Prisma.
4. El selector de lotes muestra etiquetas humanas (`Liberado`, `En cuarentena`, `Rechazado`) a través del helper compartido `inventory-labels.ts`.
5. La prueba de migraciones en CI ahora se denomina “Purchase, production, sales order and dispatch migration proofs”.

## Cobertura añadida

- Frontend: elimina la primera de dos filas y comprueba que resumen y request conservan ALM-B/LOT-B; elimina la fila intermedia de tres y comprueba que A y C conservan sus asignaciones.
- Frontend: el selector muestra `Liberado` y no expone el enum técnico `RELEASED`.
- E2E PostgreSQL: despacho sin balance inicial falla con 409 y revierte el balance cero, DES, despacho, movimientos y estado; dos solicitudes concurrentes sin balance inicial fallan de forma controlada sin dejar balances duplicados; un lote RELEASED sin balance falla limpiamente; un UUID de almacén inexistente devuelve `REFERENCE_NOT_FOUND` y revierte secuencia y documentos.

## Verificación de esta revisión

| Validación                                | Resultado                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Backend unitario                          | PASS: 198 pruebas                                                                                        |
| Backend E2E PostgreSQL 18                 | PASS: 421 pruebas en 30 archivos; Sales Dispatch: 21/21                                                  |
| Frontend focal                            | PASS: 32 pruebas en `InventoryPages.test.tsx` y `SaleDispatchForm.test.tsx`                              |
| Suite frontend completa                   | PASS según salida reportada por el usuario; total no consignado                                          |
| Migraciones, upgrade, idempotencia, drift | PASS: `pnpm test:migrations`                                                                             |
| ESLint                                    | PASS: backend y frontend                                                                                 |
| Prettier                                  | PASS: `pnpm format:check`                                                                                |
| Backend y frontend builds                 | PASS: `pnpm build`                                                                                       |
| Docker development                        | PASS: `docker compose up --build -d --wait --wait-timeout 180`; PostgreSQL, backend y frontend `healthy` |
| `git diff --check`                        | PASS en la última revisión antes de esta actualización                                                   |
| CI de GitHub                              | PASS en PR #20: `CI / Quality and tests` y `CI / Docker development` exitosos                            |

Esta validación corresponde al HEAD corregido de PR #20, que ya se integró en `develop`. No representa la validación de la Fase 3.
