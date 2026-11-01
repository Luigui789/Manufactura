# D2 — Dashboard de Inventario

Reapertura exclusiva de D2 sobre `develop` base
`4e7c6a7f2ccf8581668ccc565a4657ece7a58cfb`. El reporte C7 es evidencia histórica;
la decisión vigente está en [feature-freeze.md](feature-freeze.md). D3–D6 siguen
fuera de alcance. No se cambian esquema, migraciones, writers ni dataset demo.

## API y filtros

`GET /api/inventory/dashboard` requiere sesión válida, con la misma política de
lectura autenticada de Inventario. Responde `{ data, message }`.

| Parámetro     | Semántica                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `from`, `to`  | Fechas calendario `YYYY-MM-DD` en `America/Managua`; extremos inclusivos por día. PostgreSQL aplica inicio inclusivo y medianoche siguiente exclusiva. |
| `productId`   | UUID de cualquier tipo de producto, activo o inactivo.                                                                                                 |
| `warehouseId` | UUID de almacén activo o inactivo.                                                                                                                     |

Sin fechas: últimos 30 días incluyendo hoy en Managua. Si solo se proporciona
`to`, `from` es 29 días antes; si solo se proporciona `from`, `to` es hoy.
Fechas inexistentes, UUID inválidos, orden invertido y rangos superiores a 366
días producen 400; referencias inexistentes producen 404; sin sesión, 401.

## Contrato y definición de KPIs

| Campo de `data`             | Definición exacta                                                                                                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `period`                    | `{ from, to, timeZone, granularity }`; `day` hasta 31 días, `week` hasta 180, `month` para el resto hasta 366 días inclusivos. Semana ISO con inicio lunes, mes calendario.                                                                                                                   |
| `selectedProduct`           | `null` o `{ id, code, name, unit, isLotTracked }`.                                                                                                                                                                                                                                            |
| `selectedWarehouse`         | `null` o `{ id, code, name }`.                                                                                                                                                                                                                                                                |
| `catalog.activeProducts`    | Conteo global de productos actualmente activos, sin filtros.                                                                                                                                                                                                                                  |
| `catalog.activeWarehouses`  | Conteo global de almacenes actualmente activos, sin filtros.                                                                                                                                                                                                                                  |
| `catalog.productsByType`    | Solo productos activos globales: `rawMaterial`, `intermediate`, `finishedGood`, `consumable`. Suman `activeProducts`.                                                                                                                                                                         |
| `stockPositions.withOnHand` | Registros reales `StockBalance` con cantidad mayor que cero, filtrados por producto/almacén. Una posición es un par materializado producto + almacén.                                                                                                                                         |
| `lotsOnHand`                | Lotes distintos con al menos un saldo positivo actual por lote + almacén, derivado de `SUM(quantity)` firmado del ledger completo, respetando producto/almacén. Un lote en varios almacenes cuenta una sola vez. Campos `total`, `quarantined`, `released`, `rejected`, `rework`, `scrapped`. |
| `stock`                     | `null` sin producto; con producto: `{ onHand, consumable, unit, byWarehouse }`. `byWarehouse` contiene `{ warehouse: { id, code, name }, onHand, consumable }` para almacenes materializados por saldo o ledger liberado; puede incluir ceros. El filtro de almacén limita filas y totales.   |
| `movements`                 | Conteo del período con filtros producto/almacén: `total` y `byType` con `adjustmentIn`, `adjustmentOut`, `purchaseReceipt`, `productionConsumption`, `productionOutput`, `saleDispatch`, `qualityScrap`.                                                                                      |
| `movementQuantity`          | `null` sin producto; con producto: `{ in, out, net, unit }`. `in = SUM(quantity > 0)`, `out = ABS(SUM(quantity < 0))`, `net = SUM(quantity)` del período filtrado.                                                                                                                            |
| `movementsByPeriod`         | `{ period: YYYY-MM-DD, count }[]`, conteo de movimientos por bucket, incluidos vacíos en cero. El primer bucket semanal/mensual puede comenzar antes de `from`; solo cuenta actividad dentro del rango.                                                                                       |
| `recentMovements`           | Máximo cinco del período filtrado, por `occurredAt DESC, id DESC`. Mismo contrato y referencias comerciales que la consulta existente de movimientos.                                                                                                                                         |

Los movimientos recientes incluyen `id`, `type`, `quantity`, `occurredAt`,
`reason`, `product`, `warehouse`, `lot`, `performedByUser`, `businessReference`
y los identificadores de origen existentes. Compra, producción y venta reutilizan
`MovementQueryService`/`business-origin.ts`; un ajuste o descarte sin referencia
comercial conserva `businessReference: null`.

## Existencia actual y actividad histórica

`from/to` solo limita movimientos, flujos, serie y recientes. No limita catálogo,
posiciones, lotes ni stock. No se reconstruye stock histórico. La UI separa
**Existencia actual** y **Actividad del período** y muestra el rango efectivo.

`onHand` suma `StockBalance.quantity`, incluyendo todos los estados de lote.
Para productos sin trazabilidad `consumable = onHand`; para trazables es la suma
firmada del ledger de lotes actualmente `RELEASED`, exactamente como
`StockQueryService`. No se limita a entradas ni a saldos positivos para calcular
consumible. `QUARANTINED`, `REJECTED`, `REWORK` y `SCRAPPED` no son consumibles.

Los cinco estados aparecen siempre en el desglose de lotes actuales. Un lote
`SCRAPPED` conciliado a cero queda fuera; uno con saldo positivo se cuenta y la UI
advierte la inconsistencia. No existe ni se supone `Lot.warehouseId`.

`QUALITY_SCRAP` aparece en el desglose, serie y recientes como **Descarte por
calidad**. Su cantidad negativa contribuye automáticamente a salidas/neto por el
signo del ledger. Un lote de 125 con salida parcial de 25 y descarte del restante
100 termina con existencia cero; el dashboard no resta otra vez la cantidad original.

Todas las cantidades son Decimal strings con cuatro decimales. Solo con producto
seleccionado se agregan cantidades físicas; globalmente se presentan conteos.
Cada fila reciente conserva la unidad de su producto. No hay conversiones ni
umbrales inventados de stock bajo, ni métricas de sostenibilidad.

## Consultas y presentación

PostgreSQL/Prisma realiza `count`, `groupBy`, sumas por signo, agrupación de saldo
por lote/almacén, `COUNT(DISTINCT)` y `generate_series` con fechas en Managua.
Consultas independientes se ejecutan con `Promise.all`. El stock consumible de
todos los almacenes se agrupa en una sola consulta, unido al saldo físico;
los totales se combinan con Decimal sobre esas filas ya agregadas. No se descarga
el ledger completo ni hay N+1. Se reutiliza la consulta paginada de recientes,
añadiendo un límite superior exclusivo interno para preservar microsegundos al
final del día sin cambiar la semántica inclusiva del endpoint de movimientos.

La ruta `/inventory/dashboard` usa TanStack Query, Recharts y los componentes de
D1. Navegación: Inventario · Dashboard antes de Existencias. Los selectores no
imponen tipo ni actividad. Las gráficas de conteos tienen también una lista
textual accesible; stock por almacén tiene tabla. Estados de carga, error,
reintento y vacío mantienen las métricas de existencia separadas de actividad.

Cambios compartidos necesarios: `InventoryModule` registra D2;
`MovementsModule` exporta su servicio de lectura; `MovementQueryService` admite
el límite exclusivo interno; navegación y rutas registran la página. No se
modifican reglas de escritura ni rutas existentes. `docker/verify.mjs` extiende
el smoke existente con autenticación de D2, conciliación de conteos, cinco
estados, ausencia de cantidades globales y Decimal strings por producto.
