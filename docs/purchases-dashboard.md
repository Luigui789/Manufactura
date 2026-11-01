# D3 — Dashboard de Compras

D3 parte de `develop` `9903d5056497c67acb994e02a9f039a4289f5f9e`, merge del
PR #39 (D2), con D1 y C1–C7 integrados. La reapertura es exclusivamente D3;
los reportes históricos C7 se conservan. D4–D6 siguen excluidos.

## Acceso y filtros

`GET /api/purchases/dashboard` y `/purchases/dashboard` son de lectura para
cualquier usuario autenticado, como las consultas de órdenes. La navegación
añade **Compras · Dashboard** antes de **Compras**, cuya ruta se conserva.
Las reglas y guards de mutación no cambian.

Filtros opcionales: `from`, `to` (`YYYY-MM-DD`) y `supplierId` (UUID).
Se permite un proveedor inactivo y un proveedor sin actividad devuelve ceros.
UUID/fechas inválidos, `from > to` y más de 366 días inclusivos devuelven 400;
un proveedor inexistente devuelve 404; sin sesión, 401.
No hay filtros de almacén ni producto.

Sin `to` se usa hoy en Managua; sin `from`, 29 días antes de `to`.
Sin filtros resulta un período de 30 días incluyendo hoy.
PostgreSQL resuelve `America/Managua` tanto para límites como para buckets:
`>= inicio local de from` y `< inicio local del día posterior a to`.
No se fija un offset UTC para toda la historia.

## Contrato

Respuesta envuelta en `{ data, message }`. `data` contiene:

```json
{
  "period": {
    "from": "2026-10-03",
    "to": "2026-11-01",
    "timeZone": "America/Managua",
    "granularity": "day"
  },
  "selectedSupplier": null,
  "suppliers": { "active": 3, "usedInPeriod": 2 },
  "pipeline": { "awaitingReceipt": 4, "overdue": 1 },
  "orders": {
    "total": 12,
    "draft": 2,
    "confirmed": 3,
    "partiallyReceived": 2,
    "received": 4,
    "cancelled": 1
  },
  "amounts": { "committed": "12500.50" },
  "receipts": { "total": 7, "lines": 11 },
  "activityByPeriod": [{ "period": "2026-10-03", "orders": 1, "receipts": 0 }],
  "topSuppliers": [],
  "recentOrders": []
}
```

Los valores anteriores ilustran la forma; no son datos insertados ni resultados
prometidos para el seed. `selectedSupplier` es `null` o `{ id, code, name }`.

| Métrica                                                       | Definición exacta                                                                               | Tiempo / filtro                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `suppliers.active`                                            | COUNT Supplier con `isActive = true`                                                            | Actual, global; ignora fechas y proveedor                  |
| `pipeline.awaitingReceipt`                                    | COUNT OC en CONFIRMED o PARTIALLY_RECEIVED                                                      | Actual; respeta proveedor, ignora fechas                   |
| `pipeline.overdue`                                            | Subconjunto pendiente con expectedDate no nula y anterior a hoy en Managua                      | Actual; respeta proveedor, ignora fechas                   |
| `orders.total`                                                | COUNT OC por orderedAt dentro del período                                                       | Período y proveedor                                        |
| `orders.draft/confirmed/partiallyReceived/received/cancelled` | Estado **actual** de esas OC; suma igual a total                                                | Período y proveedor                                        |
| `suppliers.usedInPeriod`                                      | COUNT DISTINCT supplierId de esas OC, cualquier estado                                          | Período y proveedor; 0 o 1 al seleccionar proveedor        |
| `amounts.committed`                                           | SUM lineTotal persistido de OC del período actualmente CONFIRMED, PARTIALLY_RECEIVED o RECEIVED | Período por orderedAt y proveedor; excluye DRAFT/CANCELLED |
| `receipts.total`                                              | COUNT PurchaseReceipt por receivedAt dentro del período, incluso si su OC se emitió antes       | Período y proveedor de la OC                               |
| `receipts.lines`                                              | COUNT PurchaseReceiptItem de esas recepciones                                                   | Período por receivedAt y proveedor de la OC                |

`expectedDate = hoy` no está vencida; DRAFT, CANCELLED y RECEIVED tampoco.
No se mide puntualidad histórica. Cambiar el estado no mueve la pertenencia
temporal de una OC: solo `orderedAt` decide el período de órdenes; solo
`receivedAt` decide el período de recepciones.

`activityByPeriod` combina conteos independientes de órdenes y recepciones.
Usa días hasta 31 días inclusivos, semanas hasta 180 y meses en adelante.
Las semanas comienzan el lunes (PostgreSQL `date_trunc`); el primer bucket puede
preceder `from`, pero solo cuenta eventos dentro del rango. Todos los buckets
vacíos contienen cero.

`topSuppliers` devuelve como máximo cinco objetos:
`{ supplier: { id, code, name }, orders, committedAmount }`.
`orders` cuenta todas las OC del período; el importe aplica exactamente los
estados comprometidos. Orden: importe numérico DESC, órdenes DESC, código e id ASC.

`recentOrders` contiene como máximo cinco objetos:
`{ id, number, status, orderedAt, expectedDate, total, itemsCount, receiptsCount, supplier }`.
Orden: orderedAt DESC, createdAt DESC, id DESC. `orderedAt` es ISO timestamp;
`expectedDate` es fecha de calendario o null. `total` suma las líneas de esa OC
en cualquier estado; `receiptsCount` cuenta todas sus recepciones, incluso fuera
del período. Cada id enlaza a `/purchases/orders/:id`.

## Implementación y límites

El módulo aislado `backend/src/purchases/dashboard/` usa COUNT, SUM, DISTINCT,
CTE y generate_series en SQL parametrizado, y count Prisma para el catálogo.
Una transacción de lectura RepeatableRead mantiene conciliables los agregados
durante recepciones concurrentes. No hay descarga completa de órdenes ni N+1
de aplicación; la consulta de recientes limita a cinco antes de agregar sus líneas.
Los importes se suman como NUMERIC en PostgreSQL y se formatean con Prisma.Decimal
a strings de dos decimales. No se agrega dinero con JavaScript Number ni se
recalcula cantidad × precio.

No existe moneda en el modelo: la UI muestra **Valor comprometido** y
**Total registrado**, sin símbolos ni códigos monetarios. No se calcula valor
recibido, valor pendiente, cantidades globales ni conversiones entre unidades:
las recepciones no definen valoración/rounding y sus unidades son heterogéneas.
No cambian schema, migraciones, writers, reglas de producto ni dataset.

El frontend usa TanStack Query, Recharts y componentes existentes. Incluye dos
gráficas: barras de los cinco estados y líneas de órdenes/recepciones (con
trazo distinto, leyenda y tabla alternativa). Proveedores principales y recientes
se presentan en tablas. El selector OrderCatalogPicker permite inactivos.
Carga, error/reintento y período sin actividad conservan el pipeline actual.

## Pruebas y operación

`backend/test/purchases-dashboard.e2e-spec.ts` cubre validación, autenticación
(lectura con VENTAS), calendario Managua/microsegundos, períodos, ceros,
filtro inactivo, cinco estados, pipeline/vencidas, importes Decimal, recepción
parcial real, líneas de unidades heterogéneas, series y límites/orden de recientes.
`PurchasesDashboardPage.test.tsx` cubre carga, error/reintento, ceros,
recepciones sin órdenes, KPIs, estados, gráficas, filtros, proveedor inactivo,
detalle, ruta y navegación. No inspecciona SVG interno de Recharts.

`docker/verify.mjs` exige sesión, concilia estados y series, comprueba Decimal
strings y verifica el dashboard tras el flujo real de recepción parcial/completa
ya existente en el smoke. No fija IDs generados ni cambia el seed.
El seed vigente prepara catálogos e inventario inicial; las órdenes y recepciones
del guion se generan por la API real durante smoke/defensa. Un seed sin compras
debe mostrar actividad cero correctamente.

Los scripts oficiales, resultados locales y CI final se registran en el PR.
No existe `pnpm test` en root: se usan los scripts por workspace.
