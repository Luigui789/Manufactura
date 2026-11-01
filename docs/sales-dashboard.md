# D4 — Dashboard de Ventas

Base: `develop` `b458beb110d7f40ac5762e2accb6b0fe92012140`, merge del PR #40
(D3), con D1–D3 y C1–C7 integrados. La reapertura autoriza exclusivamente D4;
D5/D6 siguen excluidos. Los reportes históricos C7 se preservan.

## Acceso y filtros

`GET /api/sales/dashboard` y `/sales/dashboard` son de lectura para cualquier
usuario autenticado. Se añade **Ventas · Dashboard** antes de **Ventas · Órdenes**
sin cambiar `/sales/orders`. Los guards de mutación ADMIN/VENTAS no cambian.

Filtros opcionales: `from`, `to` (`YYYY-MM-DD`) y `customerId` (UUID).
No hay filtros de producto, almacén ni lote. Se permiten clientes inactivos;
un cliente existente sin actividad devuelve ceros. `CatalogPicker kind="customer"`
con `allowInactive` consulta el catálogo completo; sin esa opción mantiene
el filtro de activos de los formularios existentes.

Sin `to` se usa hoy en Managua; sin `from`, 29 días antes de `to`.
Sin filtros son 30 días inclusivos. Máximo 366 días inclusivos.
Fechas/UUID inválidos, `from > to` o más de 366 días: 400.
Cliente inexistente: 404. Sin sesión: 401.

PostgreSQL resuelve los límites locales de `America/Managua`:
`>= inicio local de from` y `< inicio local del día posterior a to`.
Se reutiliza el enfoque de D1–D3, sin fijar un offset UTC para toda la historia.

## Contrato y KPIs

Respuesta `{ data, message }`, con `data`:

```json
{
  "period": {
    "from": "2026-10-03",
    "to": "2026-11-01",
    "timeZone": "America/Managua",
    "granularity": "day"
  },
  "selectedCustomer": null,
  "customers": { "active": 5, "usedInPeriod": 3 },
  "pipeline": { "awaitingDispatch": 4 },
  "orders": {
    "total": 15,
    "draft": 2,
    "confirmed": 3,
    "partiallyDispatched": 2,
    "dispatched": 7,
    "cancelled": 1
  },
  "amounts": { "confirmed": "15420.75" },
  "dispatches": { "total": 8, "lines": 11 },
  "activityByPeriod": [{ "period": "2026-11-01", "orders": 3, "dispatches": 2 }],
  "topCustomers": [],
  "recentOrders": []
}
```

Los números ilustran el contrato; no son valores prometidos para el seed.
`selectedCustomer` es null o `{ id, code, name }`.

| Campo                                                             | Definición exacta                                                                                                                 | Dimensión temporal                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `customers.active`                                                | COUNT Customer con isActive=true, global e independiente de customerId                                                            | Estado actual, ignora from/to                   |
| `pipeline.awaitingDispatch`                                       | COUNT OV actualmente CONFIRMED o PARTIALLY_DISPATCHED; excluye DRAFT, DISPATCHED y CANCELLED                                      | Estado actual, ignora from/to; respeta cliente  |
| `orders.total`                                                    | COUNT OV emitidas por orderedAt dentro del período                                                                                | Período y cliente                               |
| `orders.draft/confirmed/partiallyDispatched/dispatched/cancelled` | Estado actual de esas OV; la suma coincide con total                                                                              | Período por orderedAt y cliente                 |
| `customers.usedInPeriod`                                          | COUNT DISTINCT customerId de esas OV, cualquier estado                                                                            | Período y cliente; 0 o 1 al seleccionar cliente |
| `amounts.confirmed`                                               | SUM lineTotal persistido de OV del período actualmente CONFIRMED, PARTIALLY_DISPATCHED o DISPATCHED; DRAFT/CANCELLED aportan cero | Período por orderedAt y cliente                 |
| `dispatches.total`                                                | COUNT SaleDispatch por dispatchedAt dentro del período                                                                            | Período y cliente de la OV                      |
| `dispatches.lines`                                                | COUNT SaleDispatchItem pertenecientes a esos despachos                                                                            | Período por dispatchedAt y cliente de la OV     |

Las órdenes pertenecen al período exclusivamente por `orderedAt`; avanzar su
estado no las mueve a otro período. Los despachos pertenecen exclusivamente por
`dispatchedAt`: el despacho actual de una OV antigua se cuenta aunque esa OV no
forme parte de las órdenes del período actual.

`activityByPeriod` combina ambos relojes sin mezclarlos. PostgreSQL genera
buckets con ceros: día hasta 31 días, semana hasta 180, mes en adelante.
Las semanas comienzan el lunes. El primer bucket puede preceder from, pero
solo se cuentan eventos dentro de los límites del filtro.

`topCustomers` devuelve hasta cinco objetos
`{ customer: { id, code, name }, orders, confirmedAmount }`.
Cuenta todas las OV emitidas en el período y suma sus importes solo para los
tres estados confirmados. Orden: importe numérico DESC, órdenes DESC,
customer.code ASC, customer.id ASC. Con customerId devuelve máximo uno;
los clientes inactivos conservan sus históricos.

`recentOrders` devuelve hasta cinco objetos
`{ id, number, status, orderedAt, total, itemsCount, dispatchesCount, customer }`.
Orden: orderedAt DESC, createdAt DESC, id DESC. `orderedAt` es ISO timestamp;
`total` suma líneas de esa OV en cualquier estado y `dispatchesCount` cuenta
todos sus despachos, incluso fuera del período. Los ids enlazan a
`/sales/orders/:id`. Solo se devuelve la proyección del dashboard.

## Semántica y límites

Los importes se agregan como NUMERIC en PostgreSQL y se formatean mediante
Prisma.Decimal a strings con dos decimales. No se usa JavaScript Number para
sumar dinero ni se recalcula cantidad × precio.

No hay moneda en el modelo: no se inventan símbolos ni códigos monetarios.
**Valor confirmado** expresa pedidos; no se llama ingresos, revenue, facturación
ni ventas cobradas, porque no hay pagos ni reconocimiento contable.
No se calcula valor despachado: SaleDispatchItem carece de importe persistido y
el dominio no define valoración parcial/rounding reutilizable.
No se suman cantidades heterogéneas ni se hacen conversiones.

Confirmar valida disponibilidad consumible, pero **no reserva inventario**.
D4 no presenta stock reservado/disponible, ATP, faltantes, margen ni rentabilidad.
SaleOrder no tiene fecha prometida: no hay vencidas, puntualidad, OTIF ni retrasos.
Schema, migraciones, writers, reglas de FINISHED_GOOD, calidad y seed se conservan.

## Implementación y pruebas

El módulo aislado `backend/src/sales/dashboard/` usa count Prisma y SQL
parametrizado con COUNT, DISTINCT, SUM, CTE y generate_series. Una transacción
RepeatableRead mantiene conciliables los agregados durante despachos concurrentes,
sin locks de escritura. La aplicación no carga el histórico completo ni hace
N+1; la consulta de recientes limita a cinco antes de agregar sus líneas.

La página usa TanStack Query, Recharts y componentes existentes. Dos gráficas:
barras por estado y líneas de órdenes/despachos (trazos distintos, leyenda y
tabla alternativa). Clientes principales y recientes usan tablas. Carga,
error/reintento y período vacío preservan la separación de estado actual.

`sales-dashboard.e2e-spec.ts` verifica autenticación (lector COMPRAS), validación,
clientes activos/inactivos, ceros, estados/pipeline, Decimal, fronteras Managua,
series day/week/month, orden determinista y límites de cinco registros. El flujo
DRAFT → CONFIRMED → PARTIALLY_DISPATCHED → DISPATCHED usa APIs reales y verifica
KPIs y salidas SALE_DISPATCH. Los fixtures solo venden FINISHED_GOOD con stock real.

**Ajuste respecto al plan de fixtures:** PostgreSQL impide actualizar despachos
porque son inmutables. Las ventanas históricas se prueban controlando únicamente
Date en el servidor de prueba y autenticándose en ese reloj; se conservan timers
reales, writers, auditoría, inventario y todos los triggers. No se modifica el
writer para aceptar fechas ni se deshabilita ninguna restricción.

`SalesDashboardPage.test.tsx` cubre carga, error/reintento, vacío, despachos sin
órdenes, KPIs, StatusBadge, gráficas, filtros, clientes activos/inactivos,
detalle, ruta y navegación; además preserva el picker activo de los formularios.
No inspecciona SVG interno de Recharts.

`docker/verify.mjs` verifica auth, proyección, Decimal strings y conciliación;
despacha parcial/completamente desde un lote producido y liberado por inspección
humana en el smoke existente. No fija UUID ni altera el dataset oficial.
Los scripts oficiales y resultados completos se registran en el PR;
no existe `pnpm test` root y se usan los scripts de cada workspace.
