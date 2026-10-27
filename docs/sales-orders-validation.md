# Validación de órdenes de venta (RF-VEN-002)

## Base y alcance

- Base verificada: origin/develop en 32a38dee21fc25b79c4958beb72e3589a571e860.
- HEAD de partida del PR: 3909a7b4a7ab8f403a2e8fa8bc63e8a0186d6a6a; el SHA final se completa al publicar las correcciones.
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
- Suite frontend completa: no se obtuvo un resultado final en esta revisión. La corrida global inicial reportó un fallo transitorio de ruta que pasó 47/47 al aislarla; la corrida serial completa quedó sin salida y se interrumpió.
- E2E PostgreSQL, upgrade de migración, drift y Docker development: pendientes. La terminal no puede conectarse al daemon Docker Desktop (dockerDesktopLinuxEngine, acceso denegado).
- CI de GitHub: pendiente de la nueva revisión publicada; no se declara PASS hasta ver los dos jobs exitosos.

## Estado

RF-VEN-002 continúa In Progress mientras el PR no esté integrado. RF-VEN-003 permanece Pending. Esta revisión todavía no acredita las validaciones PostgreSQL/Docker ni CI requeridas para declarar el PR listo.
