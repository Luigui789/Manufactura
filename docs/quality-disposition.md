# C2 — Disposición de lotes rechazados

La inspección y la disposición son decisiones distintas. La inspección sigue siendo
inmutable y única: C2 no agrega reinspección, reproceso real ni órdenes automáticas.

```text
QUARANTINED
     ├─ APPROVED ───────────────────→ RELEASED
     └─ REJECTED
            ├─ RELEASE ────────────→ RELEASED (liberación excepcional)
            ├─ REWORK ─────────────→ REWORK
            └─ SCRAP ──────────────→ SCRAPPED
                                         └─ QUALITY_SCRAP (ledger negativo)
```

## Reglas y acceso

Solo lotes producidos, con inspección REJECTED y estado actual REJECTED, pueden
recibir una disposición. Una decisión por lote e inspección; motivo obligatorio
recortado, de 1 a 1000 caracteres útiles; usuario y fecha se guardan del servidor.
Las disposiciones son inmutables: no hay edición ni borrado y SQL los impide.

- RELEASE conserva el rechazo y las no conformidades; libera excepcionalmente.
- REWORK conserva el saldo y bloquea consumo/despacho. No ejecuta reproceso.
- SCRAP retira todo saldo positivo restante de cada almacén, usando Decimal exacto,
  registra QUALITY_SCRAP y deja saldo de lote cero y estado SCRAPPED. Saldo cero no
  genera movimientos vacíos. Un lote descartado no admite nuevos movimientos,
  incluso ajustes de entrada, y nunca puede recibir otra disposición.

Solo RELEASED es utilizable para consumo y ventas. No se modifica esta regla.
IIoT es evidencia contextual: una alerta CRITICAL no decide, no rechaza y no impide
una disposición RELEASE explícita. No se alteran lecturas, alertas ni acknowledgements.

## API

Prefijo `/api/production/lots`:

| Método | Ruta             | Política          | Respuesta                               |
| ------ | ---------------- | ----------------- | --------------------------------------- |
| GET    | /:id/disposition | Authenticated     | `{ data: disposition o null, message }` |
| POST   | /:id/disposition | ADMIN, PRODUCCION | 201, `{ data, message }`                |

Body: `{ "type": "RELEASE|REWORK|SCRAP", "reason": "Justificación" }`.
GET de lote inexistente: 404. POST inexistente: 404. Origen no producido o inspección
inexistente/aprobada: 422. Disposición previa o estado incompatible: 409. DTO inválido
(incluidos campos desconocidos): 400. No se admiten usuario/fecha desde el cliente.
La respuesta incluye decidedBy (id, fullName), decidedAt e inspectionId.
Swagger describe el contrato y la sesión por cookie.

## Persistencia y migración

QualityDisposition enlaza Lot, QualityInspection y User con FK RESTRICT.
UNIQUE lot_id e inspection_id previenen decisiones dobles. La FK compuesta de
inspección y lote garantiza que la inspección corresponda a ese lote.
reason usa CHECK contra cualquier whitespace. Un trigger impide UPDATE y DELETE.
Se añaden REWORK/SCRAPPED, QualityDispositionType, QUALITY_SCRAP y acciones/entidad de auditoría.
La restricción de origen del ledger mantiene todos sus casos previos y añade
QUALITY_SCRAP con cantidad negativa, lote obligatorio, sin reason de ajuste ni
referencias falsas de compra, producción o despacho.

Dos migraciones nuevas separan expansión de enums de las restricciones que usan
sus valores, como requiere PostgreSQL. Las migraciones anteriores no cambian.
Primero se despliega el esquema y los lectores compatibles, después se habilita
el uso humano del nuevo flujo. Ante rollback de aplicación, se suspenden nuevas
disposiciones y se conserva el esquema/datos; no se degradan estados ni se borran
filas para fingir compatibilidad. No se incluye una migración destructiva inversa.

## Atomicidad y bloqueos

DispositionService abre una sola transacción, bloquea ProductionOrder FOR UPDATE,
verifica elegibilidad y delega estado físico a InventoryService.applyQualityDisposition.
Inventario toma producto FOR UPDATE, almacenes por ID, balances por almacén y lote
FOR UPDATE, respetando ADR 012. El bloqueo exclusivo del producto estabiliza el
conjunto de almacenes: ningún ajuste puede agregar un saldo nuevo mientras se
calcula y retira el lote. No se bloquean globalmente productos ajenos.

Se relee el estado después de esperar bloqueos. SCRAP suma el ledger por almacén,
comprueba saldo general suficiente, inserta movimientos negativos y decrementa
StockBalance exactamente. Permite retirar desperdicio de catálogos desactivados.
Después se guarda la disposición y su auditoría en esa misma transacción.
Un fallo en cualquiera de estos pasos revierte todos los cambios.
Dos disposiciones simultáneas: una 201 y otra 409, una decisión y una auditoría;
QUALITY_SCRAP nunca se duplica por una carrera de disposición.

## Auditoría y trazabilidad

Entidad QUALITY_DISPOSITION; acciones QUALITY_DISPOSITION_RELEASE/REWORK/SCRAP.
Snapshot: lotId, inspectionId, inspectionResult, disposition, reason,
previousLotStatus, newLotStatus, decidedByUserId, decidedAt. Para SCRAP añade
scrappedInventory por almacén con quantity decimal string a cuatro decimales.
Ledger conserva productId, warehouseId, lotId, quantity negativa, usuario, fecha y requestId.
No se editan movimientos históricos. El ledger existente sigue mostrando el descarte.

Cada nodo de trazabilidad añade quality.inspection y quality.disposition, con
responsables, fechas, observaciones y motivo. No duplica evidencia IIoT.

## Interfaz

LotProductionDetail conserva estado → IIoT → inspección → disposición → trazabilidad.
Solo ADMIN/PRODUCCION ven formulario ante REJECTED sin disposición. Los lectores
ven “Pendiente de disposición”. El formulario explica la consecuencia de cada acción,
exige motivo y revisión antes de confirmar; cambiar un valor exige revisar de nuevo.
Después muestra acción, motivo, responsable, fecha y estado final, sin controles mutables.
Una liberación excepcional mantiene visible “Inspección rechazada · Liberado
posteriormente por disposición”, el rechazo y las no conformidades originales.

Se invalidan production-quality, quality-disposition, production-traceability,
production-orders, inventory, lots y production-dashboard. No se agrega polling.
Los mapas de etiquetas, badges y filtros incluyen Reproceso, Descartado y Descarte por calidad.

## Pruebas

- DTO: tres decisiones, trim, motivo vacío/whitespace/largo e inválidos.
- PostgreSQL: OP real START/COMPLETE, inspección, tres decisiones, conservación de
  evidencia y ledger, varios almacenes, saldos exactos, concurrencia, rollback,
  permisos, constraints e inmutabilidad; consumo y despacho tras cada disposición.
- Migraciones: desde cero y upgrade preservando lotes, inspecciones, ledger,
  IIoT y rutas C1; enums, checks, FK y drift como CI.
- Frontend: permisos, confirmación, motivo, success/error, invalidación, labels,
  rechazo visible tras RELEASE y ausencia de controles en aprobados o ya dispuestos.
- Docker: añade otra OP al verificador existente para REJECTED → SCRAP, con lectura
  y alerta CRITICAL previas, inspección intacta, ledger negativo y saldo cero.

C1, BOM, operaciones estándar, D1 y el simulador mantienen su comportamiento.
No hay integración REWORK con rutas, nueva OP, múltiples ciclos, carbono ni nuevos KPIs.
