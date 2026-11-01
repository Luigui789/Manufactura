# D5 — Dashboard de Calidad

D5 es una consulta agregada de lectura. Base: `develop` en
`82dfb1f1757441814fe83ffac71f063ae38e83c9`, merge del PR #41 (D4), con D1–D4.
D6 General/Home continúa excluido. Se conservan las evidencias históricas C7.

## Acceso y filtros

`GET /api/production/quality/dashboard` requiere sesión (`@Authenticated()`),
para cualquier rol. Las mutaciones existentes siguen restringidas a ADMIN y
PRODUCCION. Pantalla: `/quality/dashboard`, navegación **Calidad · Dashboard**.
El detalle de calidad del lote sigue disponible desde Inventario → Lotes.

Filtros opcionales: `from`, `to` (`YYYY-MM-DD`) y `productId` (UUID).
Se aceptan productos inactivos y todos los tipos, incluidos INTERMEDIATE.
Un producto válido sin actividad devuelve ceros; UUID inválido devuelve 400;
producto inexistente, 404. Fecha inexistente, `from > to` o rango mayor de
366 días inclusivos devuelven 400.

Zona: `America/Managua`. Por defecto, los últimos 30 días incluyendo hoy.
Si solo se envía `to`, se calculan 30 días terminando en esa fecha; si solo se
indica `from`, `to` es hoy, sujeto al mismo límite de 366 días.
Intervalo SQL semiabierto: medianoche local de `from` incluida, medianoche
posterior a `to` excluida. Granularidad: hasta 31 días `day`, hasta 180 `week`,
resto `month`. Semanas comienzan el lunes y meses el día 1; el bucket inicial
puede comenzar antes del filtro, pero solo cuenta eventos dentro del intervalo.
Ambas series incluyen buckets vacíos con ceros.

## Contrato

La respuesta sigue el envelope `{ data, message }`. `data` contiene:

```ts
{
  period: { from, to, timeZone, granularity },
  selectedProduct: null | { id, code, name },
  current: { pendingInspection, rejectedAwaitingDisposition, rework },
  inspections: { total, approved, rejected, approvalRatePct },
  dispositions: { total, release, rework, scrap },
  inspectionsByPeriod: [{ period, approved, rejected }],
  dispositionsByPeriod: [{ period, release, rework, scrap }],
  attention: [{ kind, lot: { id, code }, product: { id, code, name },
    productionOrder: { id, number }, since }],
  recentInspections: [{ id, result, inspectedAt, lot: { id, code, status },
    product: { id, code, name }, productionOrder: { id, number } | null,
    inspectedBy: { id, fullName }, disposition: null | { type, decidedAt } }]
}
```

Conteos enteros; timestamps ISO UTC. `approvalRatePct` es un string Decimal con
exactamente dos decimales, o `null` cuando no hay inspecciones (UI: `—`).

## Estado actual

`from/to` no afecta `current` ni `attention`. `productId` afecta todas las
secciones.

- `pendingInspection`: lote con OP (`productionOrderId != null`), estado
  QUARANTINED, producto con `requiresQualityInspection = true` y sin inspección.
  No incluye cuarentena genérica de compras. Una OP sin control de calidad nace
  RELEASED y no se interpreta como inspeccionada.
- `rejectedAwaitingDisposition`: inspección REJECTED, lote actualmente REJECTED
  y sin disposición. Una disposición RELEASE/REWORK/SCRAP elimina ese pendiente.
- `rework`: lotes producidos actualmente REWORK. La etiqueta es «Lotes marcados
  para reproceso»; el dominio no acredita ejecución ni finalización de reproceso.

`attention` devuelve hasta cinco: primero rechazos pendientes, luego inspección
pendiente; dentro del grupo `since ASC, lot.id ASC`. Para rechazos `since` es
`inspectedAt`; para pendientes es `Lot.originatedAt`. No hay SLA ni atrasos.

## Actividad del período

Inspecciones se cuentan exclusivamente por `QualityInspection.inspectedAt`.
`approved + rejected = total`. Cada lote/inspección cuenta una vez sin ponderar
cantidades. La tasa es `Decimal(approved) / total × 100`, redondeada a dos
decimales. Ejemplo: 2/3 → `66.67`. No es yield físico, OEE, first pass yield
por cantidad ni porcentaje de kg buenos.

Disposiciones se cuentan exclusivamente por `QualityDisposition.decidedAt`.
`release + rework + scrap = total`. Las series usan las respectivas fechas en
Managua y no tienen que conciliar entre sí: un rechazo del 31 de octubre y su
SCRAP del 1 de noviembre pertenecen a períodos diferentes.

Las inspecciones recientes pertenecen al período; ordenan por `inspectedAt DESC,
createdAt DESC, id DESC`, máximo cinco. Inspector, producto y OP se incluyen sin
N+1. La disposición asociada puede estar fuera del período y se presenta solo
como contexto actual. No incrementa los contadores del período por aparecer aquí.
Enlaces: `/inventory/lots?lotId=<id>` y `/production/orders/<id>`.

## Tres verdades independientes

| Inspección histórica | Disposición                      | Estado actual del lote |
| -------------------- | -------------------------------- | ---------------------- |
| APPROVED             | Ninguna                          | RELEASED               |
| REJECTED             | Ninguna                          | REJECTED               |
| REJECTED             | RELEASE (Liberación excepcional) | RELEASED               |
| REJECTED             | REWORK (Reproceso)               | REWORK                 |
| REJECTED             | SCRAP (Descarte)                 | SCRAPPED               |

REJECTED + RELEASE continúa sumando una inspección rechazada y una disposición
release; nunca una aprobada. REWORK cuenta en el estado actual, sin afirmar
que se ejecutó. SCRAP usa el writer real que retira el saldo físico restante
mediante QUALITY_SCRAP; D5 solo cuenta inspección/disposición, conserva el ledger
y no suma cantidades entre UNIT, GRAM, KILOGRAM, MILLILITER o LITER.

No se agregan cantidades físicas globales, costes, categorías de defecto,
Pareto ni causa raíz desde `nonConformities` (texto libre). El enlace al lote
permite ver contexto IIoT; D5 no infiere causalidad entre sensores y rechazos.
No incorpora reinspección, workflow de reproceso, CAPA, SPC, exportación o streaming.

## Implementación y prueba

Controller → Service → Prisma/PostgreSQL → TanStack Query → React/Recharts.
Una transacción RepeatableRead incluye producto, conteos SQL con FILTER/GROUP BY,
series con `generate_series` y `date_trunc`, cola SQL acotada e inspecciones
recientes con `findMany(take: 5)`. No se descarga el histórico para reducirlo en
memoria, ni se agrupa en React, ni se adquieren locks de escritura.
No hay cambios de esquema, migraciones, writers ni seed.

`backend/test/quality-dashboard.e2e-spec.ts` usa APIs reales desde completar OP
hasta APPROVED, REJECTED, RELEASE, REWORK y SCRAP, conserva auth, auditoría,
inventario y triggers. Como los eventos usan CURRENT_TIMESTAMP de PostgreSQL,
las ventanas históricas usan una extensión Prisma solo en el fixture que fija
la fecha al INSERT; no actualiza disposiciones inmutables ni modifica writers
productivos. Timers reales durante todo el flujo.

La UI prueba carga, error/reintento, vacío con pendientes actuales, tasa nula,
resultados y disposiciones independientes, filtros, inactivos INTERMEDIATE,
picker con defaults conservados, tablas accesibles de gráficos, ruta y navegación.
Docker verify comprueba auth, contrato, conciliación y los lotes reales de aprobación
y descarte del smoke sin UUID fijos ni cambios del dataset.

Los resultados de gates de esta entrega se registran en `docs/quality-dashboard-validation.md`.
