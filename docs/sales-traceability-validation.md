# Informe de validación — Sales Traceability & Integration Closeout

## Estado actual

- PR: [#21 — feat(sales): add lot dispatch traceability](https://github.com/Luigui789/Manufactura/pull/21)
- Rama: `feature/sales-traceability`
- Base: `develop`
- Estado de Fase 3: `Verified` sobre el HEAD indicado abajo; PR aún no integrado.
- Aprobación formal: pendiente según el estado comunicado.

## Base y HEAD revisados

- Base SHA: `e79e6f7f5cb3a5d6d13a07282c1d2bf473ada0bb` (merge del PR #20).
- HEAD revisado por CI #55: `b6f15e59ca2208e40d55642d572cceae61c5083d`.
- Este informe se actualizará en un commit documental posterior al HEAD revisado. El SHA de ese commit no se copia aquí para evitar autorreferencia; la CI final debe verificarse contra el nuevo HEAD.

## Integraciones previas

- PR #19 / RF-VEN-002 integrado en `develop`: merge `d410d397728d81cd72058693d334df044570b10e`.
- PR #20 / Sales Dispatch, RF-VEN-003, integrado en `develop`: merge `e79e6f7f5cb3a5d6d13a07282c1d2bf473ada0bb`.
- PR #21 extiende la trazabilidad de lotes de ventas y sigue sin merge.

## Modelo y contrato de trazabilidad

Fase 3 no añade ni modifica migraciones. Reutiliza `SaleOrder`, `SaleOrderItem`, `SaleDispatch`, `SaleDispatchItem`, `InventoryMovement` y el origen empresarial de `Lot`. La trazabilidad de salida deriva de movimientos `SALE_DISPATCH`; no persiste cantidades redundantes en lotes u órdenes y no modifica el writer de Inventario.

`GET /api/production/lots/:id/traceability` agrega a cada nodo los movimientos de salida con DES, fecha, cantidad decimal positiva, OV, cliente, almacén y responsable. Los movimientos se consultan en conjunto para los lotes visitados dentro de la transacción `REPEATABLE READ` ya usada por el grafo. Las referencias del historial de movimientos también muestran DES, OV y cliente.

El historial registra las cantidades del ledger sin afirmar que un lote esté agotado o vendido por completo. La interfaz presenta las salidas por lote y conserva el estado vacío cuando no existen despachos.

## Escenarios cubiertos

- Trazabilidad Compra → producción → inspección → despacho parcial a dos clientes, con cancelación y rechazo de un despacho excedido.
- Una misma OV abastecida en una sola solicitud de despacho desde dos lotes de producción aprobados: 1 unidad desde el primero y 2 desde el segundo. La consulta de ambos lotes identifica la misma OV y refleja `1.0000` y `2.0000`.
- La UI de detalle verifica cantidades derivadas para órdenes `PARTIALLY_DISPATCHED` y `DISPATCHED`, y la ausencia de acciones mutables cuando la orden está completada.
- La UI de trazabilidad verifica referencias compartidas/circulares sin duplicar nodos, enlaces a registros existentes y estados sin despachos.

## Validación reportada

| Comprobación                               | Resultado                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Backend unitario                           | PASS: 199 pruebas en 14 archivos                                                           |
| Backend E2E PostgreSQL                     | PASS: 423 pruebas en 30 archivos                                                           |
| E2E focales de Producción y Sales Dispatch | PASS: 52 pruebas en 2 archivos; incluye OV atendida desde dos lotes                        |
| Frontend                                   | PASS: 507 pruebas en 25 archivos                                                           |
| Migration proofs y drift                   | PASS: instalación vacía, upgrade con datos, constraints, deploy idempotente y drift limpio |
| ESLint                                     | PASS: `pnpm lint`                                                                          |
| Formato                                    | PASS: `pnpm format:check`                                                                  |
| Builds                                     | PASS: backend y frontend con `pnpm build`; Vite reportó una advertencia de tamaño de chunk |
| Docker development                         | PASS en GitHub Actions CI #55                                                              |
| CI #55 — Quality and tests                 | SUCCESS para HEAD `b6f15e59ca2208e40d55642d572cceae61c5083d`                               |
| CI #55 — Docker development                | SUCCESS para HEAD `b6f15e59ca2208e40d55642d572cceae61c5083d`                               |

Los mensajes de error de auditoría y de ruta sin política en pruebas son provocados deliberadamente por casos de rollback y guard; las suites terminaron exitosamente. También se reportó una advertencia de deprecación de `pg`, que no hizo fallar las E2E.

## Cierre

La implementación de Sales Traceability & Integration Closeout está verificada sobre el HEAD revisado `b6f15e59ca2208e40d55642d572cceae61c5083d`. Las pruebas locales reportadas y ambos jobs de GitHub CI #55 están aprobados. El PR #21 permanece sin integrar hasta obtener aprobación formal y fusionarse a `develop`. El commit documental posterior requiere sus propios checks de CI verdes antes del merge.
