# Informe de validación — Sales Traceability & Integration Closeout

## Estado

Fase 3 trabajada en `feature/sales-traceability`. El trabajo local aún no está en un commit ni publicado; por tanto, todavía no hay PR ni CI para esta fase. No se ha hecho merge.

## Base y HEAD

- Base `develop`: `e79e6f7f5cb3a5d6d13a07282c1d2bf473ada0bb` (merge del PR #20).
- HEAD de PR #20 incorporado: `13286aab514d01af5f409aac79081f1999fa2757`.
- HEAD final de Fase 3: pendiente de commit.
- Alcance: trazabilidad de salida RF-VEN-003 y cierre del flujo proveedor → recepción → inventario → producción → calidad → orden de venta → despacho → cliente.

## Integraciones previas

- PR #19 / RF-VEN-002 integrado en `develop`: merge `d410d397728d81cd72058693d334df044570b10e`.
- PR #20 / RF-VEN-003 integrado en `develop`: merge `e79e6f7f5cb3a5d6d13a07282c1d2bf473ada0bb`.
- Los checks de CI de PR #20 fueron reportados como exitosos. No se atribuyen esos checks al trabajo local de esta fase.

## Modelo y contrato de trazabilidad

Esta fase no añade ni modifica migraciones. Reutiliza `SaleOrder`, `SaleOrderItem`, `SaleDispatch`, `SaleDispatchItem`, `InventoryMovement` y el origen empresarial de `Lot`. La trazabilidad de salida se deriva de movimientos `SALE_DISPATCH`; no persiste cantidades redundantes en lotes ni órdenes y no modifica el writer de Inventario.

`GET /api/production/lots/:id/traceability` agrega a cada nodo los movimientos de salida con DES, fecha, cantidad decimal positiva, OV, cliente, almacén y responsable. Los movimientos se consultan en conjunto para los lotes visitados dentro de la transacción `REPEATABLE READ` ya usada por el grafo. Las referencias del historial de movimientos también muestran DES, OV y cliente.

El historial registra las cantidades del ledger sin afirmar que un lote esté agotado o vendido por completo. La interfaz presenta las salidas por lote y conserva el estado vacío cuando no existen despachos.

## Escenarios cubiertos

- Trazabilidad Compra → producción → inspección → despacho parcial a dos clientes, con cancelación y rechazo de un despacho excedido.
- Una misma OV abastecida en una sola solicitud de despacho desde dos lotes de producción aprobados: 1 unidad desde el primero y 2 desde el segundo. La consulta de trazabilidad de ambos lotes identifica la misma OV y refleja `1.0000` y `2.0000`, respectivamente.
- La UI de detalle verifica cantidades derivadas para órdenes `PARTIALLY_DISPATCHED` y `DISPATCHED`, y la ausencia de acciones mutables cuando la orden está completada.
- La UI de trazabilidad verifica referencias compartidas/circulares sin duplicar nodos, enlaces a los registros existentes y estados sin despachos.

## Validación local reportada

| Comprobación                               | Resultado                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Backend unitario                           | PASS: 199 pruebas en 14 archivos                                                                                      |
| Backend E2E PostgreSQL                     | PASS: 423 pruebas en 30 archivos                                                                                      |
| E2E focales de Producción y Sales Dispatch | PASS: 52 pruebas en 2 archivos; incluye OV atendida desde dos lotes                                                   |
| Frontend                                   | PASS: 507 pruebas en 25 archivos                                                                                      |
| Migraciones PostgreSQL 18                  | PASS: instalación vacía, upgrades y preservación de datos, constraints, deploy idempotente y drift limpio             |
| ESLint                                     | PASS: `pnpm lint`                                                                                                     |
| Formato                                    | PASS: `pnpm format:check` después de aplicar Prettier al test de producción                                           |
| Builds                                     | PASS: `pnpm build` para backend y frontend; Vite mostró solo el aviso de tamaño de chunk                              |
| Diff                                       | PASS: `git diff --check`                                                                                              |
| Prisma validate                            | PASS, reportado anteriormente en esta rama                                                                            |
| Docker development completo                | Pendiente de confirmar en esta fase; las pruebas E2E y migraciones sí corrieron en PostgreSQL mediante Docker Compose |
| CI de Fase 3                               | Pendiente de publicar la rama y abrir el PR                                                                           |

Los mensajes de error de auditoría y de ruta sin política que aparecen durante algunas pruebas son errores provocados deliberadamente por los casos de rollback y guard; las suites terminaron exitosamente. También se reportó una advertencia de deprecación de `pg`; no hizo fallar las E2E.

## Cierre

La implementación y las validaciones locales reportadas están completas. Para cerrar el PR faltan revisar el diff final, actualizar este informe con el SHA del commit, publicar la rama, abrir el PR hacia `develop` y verificar que ambos checks de CI terminen en `success`. No se afirma que Fase 3 esté integrada hasta que se haga merge.
