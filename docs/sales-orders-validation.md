# Validación de órdenes de venta (RF-VEN-002)

## Base y alcance

- Base verificada: origin/develop en 32a38dee21fc25b79c4958beb72e3589a571e860.
- HEAD de código validado por CI: `15fc312bf6632d35605ef8068f18adbb80bc5d5c` (`fix(sales): align migration fixture lot origin`).
- HEAD actual del PR #19: `4c8a032b38cfd26cd8a86fcf749fa09fd38ad8d2` (`docs(sales): update PR 19 validation status`), cambio solo documental.
- Alcance: RF-VEN-002, flujo de borradores, confirmación informativa y cancelación.
- RF-VEN-003 (despacho) permanece Pending; no se implementa Dispatch ni se modifica el writer de Inventario.
- Migración de Sales Orders: 20261026090000_sales_orders; no se modificaron migraciones publicadas.

## Modelo y reglas

El modelo mantiene SaleOrder, SaleOrderItem y SaleOrderStatus. La creación opera en una sola transacción:

cliente (validar/bloquear) → document sequence SALE_ORDER → productos ordenados por UUID → SaleOrder/items → auditoría.

Los errores de auditoría revierten la orden y el número reservado. Al confirmar, la disponibilidad se agrega por producto antes de comparar líneas repetidas: productos trazables consumen solo lotes RELEASED; productos sin trazabilidad usan el saldo general. Confirmar no reserva existencias ni crea InventoryMovement, ni cambia StockBalance o Lot.

## Cobertura incorporada

- Backend E2E en backend/test/sales-orders.e2e-spec.ts: cliente/producto inactivos o inexistentes, items vacíos, edición de estados, cancelación repetida, disponibilidad por lote, cantidades decimales y overflow, líneas repetidas, concurrencia de confirmación y numeración, rollback de CREATE/UPDATE/CONFIRM/CANCEL e inventario sin cambios.
- Frontend: listado, formulario y detalle; permisos y estados; confirmación/cancelación explícitas; pickers buscables/paginados para cliente y producto, selección remota fuera de la página inicial y filtro FINISHED_GOOD activo. El selector compartido conserva el filtro de tipo usado por Compras.
- Prueba de upgrade: backend/test/sales-orders-migrations.mjs siembra datos previos en un esquema aislado, ejecuta la migración Sales con Prisma, compara los registros históricos, comprueba idempotencia y drift.

## Evidencia ejecutada en esta revisión

- Backend unitario: 197 pruebas en 14 archivos — PASS.
- Backend lint y build — PASS.
- Prisma validate — PASS.
- Frontend lint y build — PASS.
- Suites focalizadas de Ventas (listado/formulario/detalle): 23 pruebas — PASS.
- Compras: 14 pruebas — PASS.
- AppRoutes.test.tsx: 47 pruebas aisladas — PASS.
- Prettier check y git diff --check — PASS.
- pnpm install --frozen-lockfile: no ejecutable en este sandbox; pnpm recibió EPERM al crear un symlink en su almacén de Windows.
- Suite frontend completa — PASS en GitHub Actions para el HEAD de código indicado; el job `Quality and tests` ejecutó `pnpm --filter frontend test`.
- E2E backend contra PostgreSQL 18, migraciones desde esquema limpio, upgrade con datos existentes, idempotencia y drift — PASS en `Quality and tests` para el HEAD de código indicado. La verificación de Docker development — PASS en el job separado. La limitación local de acceso a Docker no afecta estos resultados remotos.
- CI de GitHub — PASS en el [run 48](https://github.com/Luigui789/Manufactura/actions/runs/40443272313): `Quality and tests` y `Docker development` finalizaron en success para el HEAD de código `15fc312` el 2026-10-27. El [run 49](https://github.com/Luigui789/Manufactura/actions/runs/40595316237), disparado por el commit documental actual `4c8a032`, está en curso: `Docker development` pasó y `Quality and tests` continúa ejecutándose; no se declara PASS para el HEAD actual hasta que termine.

## Estado

RF-VEN-002 continúa In Progress porque el PR aún no está integrado. La validación técnica de CI está completa, y el run 49 del HEAD documental actual todavía no termina. Además, el PR mantiene un review formal `CHANGES_REQUESTED` sin aprobación posterior; por ello no se declara listo para merge. RF-VEN-003 permanece Pending y fuera del alcance.
