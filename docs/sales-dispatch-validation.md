# RF-VEN-003 — informe de implementación y validación

## Identificación

- Rama: `feature/sales-dispatch`.
- Base prevista: merge del PR #19, `d410d397728d81cd72058693d334df044570b10e`.
- HEAD revisado en esta sesión: `d410d39` (base); los cambios descritos siguen sin commit.
- Alcance: despachos de órdenes de venta y salida automática de producto terminado.
- Estado: **In Progress**. No afirmar `Verified` ni `Integrated` antes de completar validaciones y merge.

## Implementación local

- La migración `20261027110000_sales_dispatch_enums` agrega los enums y la secuencia. `20261027120000_sales_dispatch` agrega `SaleDispatch`, `SaleDispatchItem`, la FK de origen, restricciones de ledger e inmutabilidad.
- `POST /api/sales/orders/:id/dispatch` bloquea la orden, valida pendientes, toma la secuencia DES y bloquea productos, almacenes, balances y lotes en el orden de ADR 012. Delega el plan completo una sola vez al writer `InventoryService` y audita dentro de la transacción.
- La cantidad despachada y pendiente se deriva de los items. No hay reserva, FEFO, FIFO ni asignación automática. Los lotes trazables deben ser `RELEASED` y disponibles en el almacén seleccionado.
- La UI permite varias asignaciones por producto, filtra lotes por producto/almacén/estado, enseña cantidades, presenta resumen y advierte que el despacho descuenta inventario y no se revierte desde la pantalla. Se invalida la caché de órdenes, inventario y lotes.
- Se amplía el historial de la orden con usuario, almacén, lote y cantidad; los movimientos muestran la referencia DES con etiqueta humana.

## Cobertura agregada

El E2E de despacho cubre flujos parcial/completo, líneas repetidas, excedentes, lotes QUARANTINED/REJECTED y ajenos, lote sin saldo en el almacén pedido, lote obligatorio/prohibido según trazabilidad, stock insuficiente, RBAC para roles no autorizados, numeración concurrente, competencia por balance y lote, fallo tardío, inmutabilidad de estado y rollback de auditoría/secuencia. La prueba de migraciones valida constraints SQL, una línea sin movimiento, unicidad e inmutabilidad.

## Estado real de validación

La suite completa E2E fue ejecutada por el usuario contra PostgreSQL en Docker después de corregir los tres fallos: **417 pruebas aprobadas en 30 archivos**. La ejecución duró 106.57 s. `pnpm test:migrations` también pasó en PostgreSQL 18: instalación vacía, upgrade preservando datos, restricciones de despacho, deploy idempotente y drift limpio. La verificación del stack Docker y CI para el HEAD final aún deben ejecutarse; el asistente no tiene acceso al engine Docker desde su entorno.

| Validación                                                     | Estado al editar este informe                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Rama/base y cambios locales                                    | Revisados; HEAD aún es la base `d410d39`                       |
| E2E backend completo                                           | PASS: 417 pruebas en 30 archivos                               |
| E2E RF-VEN-003 ampliado                                        | PASS dentro de la suite completa de PostgreSQL                 |
| Instalación limpia, upgrade, constraints, idempotencia y drift | PASS: `pnpm test:migrations` en PostgreSQL 18                  |
| Suite frontend completa                                        | PASS: 502 pruebas en 24 archivos                               |
| Frontend detalle de despacho                                   | PASS: 10 pruebas                                               |
| Backend unit tests                                             | PASS: 198 pruebas en 14 archivos                               |
| Prisma generate/validate y builds                              | PASS: Prisma, Nest build, `tsc --noEmit` y Vite build          |
| Lint y formato                                                 | PASS: ESLint backend/frontend y Prettier check del repositorio |
| Docker development y CI de GitHub para el HEAD final           | Pendientes; los cambios no están publicados                    |

No se declara el PR listo para merge hasta que estas validaciones se ejecuten y CI termine en verde.
