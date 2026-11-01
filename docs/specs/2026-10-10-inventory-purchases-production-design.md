# Diseño de la siguiente ronda — Inventario, Compras y Producción

- **Fecha:** 2026-10-10, zona empresarial `America/Managua`.
- **Estado:** PR0 revisado; ADR 011–014 aceptados. A-1 integrado; C-1 implementado en su rama, pendiente de integración.
- **Base de C-1:** `develop` en `e7f12bc`, con el contrato real de Inventory A-1.
- **Base inspeccionada:** `develop`, commit `53b7402`, actualizado desde `origin/develop`.
- **Rama de documentación:** `docs/next-development-round` (PR0).
- **Fuente:** chat «Relacionar módulos del sistema», especialmente la instrucción inicial de
  PR0; contraste con el código, las migraciones y los documentos actuales del repositorio.

Los mensajes de asignación de Compras y Producción recuperados por la herramienta de lectura
están truncados. La instrucción de PR0 sí se recuperó completa. Esta especificación consolida
sus decisiones explícitas y registra las diferencias abiertas; no acredita haber recuperado
íntegramente los documentos extensos ni sus anexos.

## 1. Objetivo y alcance

Los tres integrantes desarrollarán funcionalidades completas sobre el monolito existente:
Inventario, Compras y Producción. El resultado de la ronda será recibir materias primas,
consultar sus existencias y transformarlas mediante órdenes de producción, conservando
movimientos, lotes, calidad y auditoría coherentes.

```text
Proveedor → Orden de compra → Recepción → Inventario de materias primas
          → Orden de producción → Consumos → Lote producido → Inventario de terminado
```

Ventas, despachos, reservas, transferencias entre almacenes, asignación automática FIFO/FEFO,
conversiones de unidades, rutas MES y reversas de recepciones o de producción quedan fuera de
esta ronda. El agua se representa como producto inventariable, sin una excepción de consumo.
Las fórmulas de demostración son datos de prueba del ERP; PR0 no prescribe un proceso químico.

PR0 modifica únicamente documentación. Los ADR 011–014 quedaron aceptados conceptualmente
en la revisión local del 2026-10-10, conforme a la aprobación del responsable. Las políticas
de alcance y decisiones abiertas se distinguen en §14. La aceptación no habilita endpoints,
enums, tablas, migraciones ni acredita funcionalidades implementadas.

## 2. Situación actual y reutilización

| Existente en `develop`                     | Reutilización                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Auth, usuarios, guards y permisos          | Sesión, actor y autorización en backend para todas las operaciones.                                             |
| Productos y almacenes                      | Identidad, unidad base, tipo, estado y ubicación; no duplicar catálogos.                                        |
| Proveedores y clientes                     | Compras usa proveedores; clientes queda preparado para Ventas posterior.                                        |
| `InventoryMovement`, `StockBalance`, `Lot` | Foundation del inventario; no reconstruir el ledger ni crear `LotBalance`.                                      |
| `apply-adjustment.ts`                      | Conserva las validaciones y el protocolo probado; actualmente abre su propia transacción y admite solo ajustes. |
| `AuditService.record(tx, event)`           | Auditoría empresarial dentro de la misma transacción y snapshots por lista permitida.                           |
| `DocumentSequence`                         | Infraestructura para numeración; todavía no existe un servicio común de numeración.                             |
| Compose y CI                               | Entorno y verificaciones existentes; PR0 no los cambia.                                                         |

`Lot` todavía no tiene origen empresarial físico. `InventoryMovement.reason` es obligatorio y
su enum solo admite `ADJUSTMENT_IN` y `ADJUSTMENT_OUT`. No existen órdenes o recepciones de
compra, BOM, órdenes de producción, inspecciones ni API de saldos/movimientos/lotes.
`backend/src/production/` y `frontend/src/features/production/` serán nuevos.

`Product.isLotTracked` y `requiresQualityInspection` existen en el schema, pero el DTO y
servicio actuales de Productos no exponen su edición. A-2 planifica habilitarla y bloquear
todo cambio de `isLotTracked` si existe **cualquier `InventoryMovement`**, aunque el saldo
sea cero. Llevar existencias a cero no elimina historial ni habilita cambiar la bandera.
El procedimiento histórico mencionado en ADR 007 no está implementado ni se habilita en
esta ronda; los ADR 001–010 se conservan íntegros.

La evidencia histórica de 433 pruebas de los catálogos está en [progress.md](../progress.md).
No acredita los casos de uso de esta ronda ni constituye una reejecución en PR0.

## 3. Reparto, dependencias e integración

| Responsable                     | Rama / entrega                      | Alcance y condición de cierre                                                                                                                                                |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventario                      | A-1: `feature/inventory-contract`   | Contrato backend reutilizable, movimientos en lote, bloqueos y numeración compartida. Ajustes probados; sin alta operativa de lotes; origen verificable desde Compras.       |
| Compras                         | `feature/purchases`                 | Órdenes, confirmación, cancelación, recepciones parciales/completas, origen de lotes recibidos, frontend y pruebas. Depende de A-1.                                          |
| Inventario                      | A-2: `feature/inventory-movements`  | Consultas de stock/movimientos/lotes, ajustes autorizados, configuración de trazabilidad/calidad y pantallas. Depende de A-1; consulta de lotes operativos requiere Compras. |
| Vos / responsable de Producción | C-1: `feature/production-core`      | BOM/versiones, borradores de OP, edición/cancelación de borradores, cálculo y consulta informativa de disponibilidad, frontend y pruebas; cero cambios de stock.             |
| Vos / responsable de Producción | C-2: `feature/production-execution` | Inicio, finalización, asignación explícita de lotes, consumo/output, calidad y trazabilidad. Depende de A-1, Compras y C-1.                                                  |

```text
PR0 → A-1 → Compras → A-2 → C-1 → C-2
```

A-2 y Compras pueden intercambiarse después de A-1 si se conservan sus restricciones de
dependencia y no se habilitan lotes huérfanos. Antes de C-2 deben estar disponibles **A-1,
Compras y el contrato necesario de Inventario** (movimientos, creación de lotes con origen,
disponibilidad consumible y coordinación de transiciones de calidad), además de C-1.
El PR completo de A-2 no es un gate obligatorio para C-2; si una parte del contrato queda
para A-2, esa parte sí debe integrarse antes. Su posición en la secuencia es recomendada.
C-1 puede prepararse en paralelo, pero sus migraciones definitivas se generan tras actualizar
la rama con las dependencias integradas. La consulta de disponibilidad usa el contrato real
de Inventario; un mock no acredita su integración.

## 4. Propiedad de módulos y archivos

Inventario es el único escritor de `InventoryMovement`, `StockBalance` y los lotes operativos.
Compras posee órdenes y recepciones; Producción posee fórmulas, órdenes e inspecciones.
Los dominios llaman a Inventario dentro de su transacción. Calidad registra la inspección y
solicita a Inventario el cambio de estado del lote, conservando ambos cambios atómicos.

| Archivos                                                                                     | Responsable de cambios                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/inventory/**`, `frontend/src/features/inventory/**`                             | Inventario.                                                                                                                 |
| `backend/src/purchases/**`, `frontend/src/features/purchases/**`                             | Compras; conservar proveedores existentes.                                                                                  |
| `backend/src/production/**`, `frontend/src/features/production/**`                           | Producción.                                                                                                                 |
| Servicio de numeración compartido                                                            | Inventario A-1; interfaz revisada por los tres.                                                                             |
| `backend/prisma/schema.prisma`, nuevas migraciones, enums y constraints                      | Una persona coordinadora designada por el equipo; cada dominio entrega su cambio y lo acuerda antes de generar migraciones. |
| `app.module.ts`, navegación/rutas, `audit-snapshots.ts`, documentación y pruebas compartidas | Coordinación antes de editar; integrar preservando todas las features.                                                      |

Carpetas previstas, creadas solo cuando contengan funcionalidad real:

```text
backend/src/
  inventory/
    inventory.service.ts     contrato central y orquestación de recursos
    stock/                   consultas y disponibilidad consumible
    movements/               consultas y caso de uso de ajustes
    lots/                    creación con origen, consulta y transiciones
    products/                ampliar catálogos existentes cuando corresponda
    warehouses/              conservar catálogo existente
  common/document-sequences/ numeración compartida
  purchases/purchase-orders/ órdenes y recepciones; reutilizar SuppliersModule
  production/
    boms/                    fórmulas, versiones y cálculo
    orders/                  órdenes y ejecución
    quality/                 inspecciones y coordinación con Inventario
    traceability/            consultas de origen/consumo
frontend/src/features/
  inventory/                 ampliar api/, components/, pages/, schemas.ts y types.ts
  purchases/                 ampliar estructura existente para órdenes/recepciones
  production/                api/, components/, pages/, schemas.ts y types.ts nuevos
```

Las rutas de archivos, nombres de componentes frontend y subdivisiones de carpetas son guía
de implementación ajustable, no decisiones arquitectónicas obligatorias. No se crea otra API
de Inventario, otro cliente HTTP ni un módulo paralelo a Compras.

## 5. Contrato interno de Inventario

Contrato conceptual que A-1 debe concretar y probar:

```ts
InventoryService.applyMovements(tx, command);
```

- `tx` es el `Prisma.TransactionClient` del caso de uso llamador.
- `command` contiene actor, instante, `requestId` y todas las líneas de la operación.
- Cada línea identifica producto, almacén, tipo, magnitud decimal positiva, lote cuando
  corresponda y un origen tipado. Inventario determina el signo almacenado por el tipo.
- En A-1, la línea puede referir un lote existente. El servicio valida existencia y relación con
  el producto, pero no origen empresarial: Foundation aún no tiene columnas ni FKs de origen.
  A-1 no ofrece una operación de negocio ni un endpoint para crear lotes; los fixtures de prueba
  sí pueden insertarlos directamente. Referir un lote preexistente sin origen es una limitación
  técnica aceptada de esta etapa, no evidencia de que se rechacen lotes huérfanos.
- Para Compras/C-2, los lotes nuevos se describen en el mismo plan de operación: producto, origen
  empresarial, vencimiento opcional y número reservado. Inventario los crea después de bloquear
  **todos** los recursos y enlaza sus movimientos; no se crea un lote por fuera de ese plan.
- La extensión futura devuelve identificadores de movimientos y lotes creados para la respuesta
  y la auditoría; A-1 solo devuelve movimientos.
- No abre una transacción propia ni hace commit o rollback independientes; propaga errores
  al caso de uso llamador. No registra auditoría empresarial.

El tipo del comando puede anticipar extensiones futuras, pero A-1 solo acepta los tipos que
la base instalada permite. Compras y C-2 habilitan sus variantes junto con sus FKs y CHECK.
El origen tipado de la API interna se persiste como columnas FK concretas, no como una pareja
genérica `sourceType/sourceId` sin integridad referencial.

A-1 también proporciona consulta de disponibilidad general y consumible: para componentes
trazables, únicamente suma existencias de lotes `RELEASED`. La consulta es informativa; las
escrituras vuelven a validar bajo bloqueo. No se contabiliza dos veces un lote ni se agrega un
balance por lote: su saldo se deriva del ledger por `(lotId, warehouseId)`.

El caso de uso de ajustes conserva el comportamiento probado de Foundation, delega en este
contrato y registra `ADJUST_STOCK` mediante `AuditService`. A-1 debe preservar los callers y
las pruebas existentes de `applyAdjustment`, mediante adaptación dentro del mismo PR.

## 6. Transacciones, numeración y concurrencia

Una recepción o finalización de producción usa una sola transacción, incluida auditoría.
Antes de escribir se recopila el conjunto completo de productos, almacenes, saldos, lotes
existentes y números requeridos. No se llama a Inventario una vez por componente.

Orden global aceptado en [ADR 012](../decisions/012-transacciones-y-orden-de-bloqueos.md),
pendiente de implementación:

1. Documento empresarial: fila de OC/OP y recursos de dominio que serializan su transición;
   si son varios, orden estable por tipo e ID.
2. `document_sequences`: todos los pares `(documentType, year)` ordenados.
3. `products`: todos los IDs ordenados, incluidos componentes y producto obtenido.
4. `warehouses`: todos los IDs ordenados.
5. `stock_balances`: pares ordenados por `(productId, warehouseId)`.
6. `lots`: todos los IDs existentes ordenados.

Se mantiene el orden de balances del ADR 004. Para documentos se prevé `FOR NO KEY UPDATE`,
para productos/almacenes `FOR SHARE`, para saldos `FOR UPDATE`; los lotes se bloquean antes
de validar su estado y disponibilidad. Los modos finales de lotes/calidad deben probarse
contra las FKs y las operaciones concurrentes antes de cerrar A-1/C-2.

La primera fila de saldo se obtiene con `INSERT ... ON CONFLICT DO NOTHING` y luego se
bloquea. Las consultas y validaciones se repiten tras esperar bloqueos. Rechazo de stock,
producto/almacén inactivo, lote incorrecto o no liberado revierte toda la operación.

El servicio compartido de numeración debe reservar en una sola operación los contadores
necesarios, con orden estable por tipo/año. Una recepción trazable necesita `REC` y `LOT`;
se reservan ambos antes de bloquear productos. Reservar `REC` y después adquirir `LOT`
independientemente puede invertir el orden. Los nuevos lotes se insertan al final del plan
de recursos, utilizando esos números; no se bloquea primero un producto arbitrario para
crear un lote y después se solicita el bloqueo completo a Inventario.

El año de OC/REC/OP/LOT usa `America/Managua`. Instantes en UTC con `timestamptz`; vencimiento
y fecha esperada de compra son fechas de calendario. Los huecos de numeración son válidos,
los números publicados/cancelados no se reciclan y solo son definitivos después del commit.

Calidad comparte el protocolo de saldos/lotes con consumo y ajustes: inspección y transición
no pueden intercalarse entre la validación y la escritura de un movimiento. Debe probarse
la carrera entre rechazo/liberación y consumo, incluso con varias existencias del mismo lote.

## 7. Movimientos y lotes

| Tipo planificado                   | Signo persistido    | Origen obligatorio             | `reason`     |
| ---------------------------------- | ------------------- | ------------------------------ | ------------ |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | positivo / negativo | Sin FK de documento de dominio | Obligatorio. |
| `PURCHASE_RECEIPT`                 | positivo            | `purchaseReceiptItemId`        | Nulo.        |
| `PRODUCTION_CONSUMPTION`           | negativo            | `productionOrderId`            | Nulo.        |
| `PRODUCTION_OUTPUT`                | positivo            | `productionOrderId`            | Nulo.        |

Cada tipo admite solamente su FK de origen; las demás son nulas. Los movimientos permanecen
append-only y nunca tienen cantidad cero. Se conservan las FKs compuestas lote–producto y se
añade coherencia entre línea recibida y línea ordenada. Producción valida el producto de
output y los componentes contra la OP/version utilizada. Cada línea recibida genera un
movimiento; repetirla debe rechazarse mediante unicidad de su origen.

El modelo objetivo exige que todo lote operativo tenga exactamente un origen:
`PurchaseReceiptItem` XOR `ProductionOrder`. Compras habilita el primero; C-2 amplía el CHECK
preservando las recepciones. Ambos orígenes son FK, únicos para producir un lote por línea recibida
y por OP terminada. La relación de recepción con lote se resuelve desde
`Lot.purchaseReceiptItemId`, sin duplicar un `PurchaseReceiptItem.lotId` editable que pudiera
apuntar a otro lote.

**Alcance A-1 y limitación conocida:** A-1 no crea lotes empresariales ni ofrece endpoint de alta.
`applyMovements` puede recibir un ID de lote existente, comprobar que existe y pertenece al producto,
pero no puede verificar su origen porque el esquema Foundation aún no lo modela. Las pruebas crean
lotes directamente como fixtures. En consecuencia, un lote preexistente sin origen no queda
rechazado por el servicio; la validación de origen se difiere formalmente a Compras. Antes de
habilitar recepciones o creación operativa de lotes, la migración de Compras debe exigir la FK de
origen y detenerse si encuentra filas sin origen que requieran resolución explícita. C-2 amplía
la regla para incluir `ProductionOrder`.

La creación empresarial futura pertenece a Inventario y participa de la transacción de
recepción/producción. El lote nace `RELEASED` si no requiere inspección, y `QUARANTINED` si la
requiere. Hasta disponer de Calidad, un lote en cuarentena no es consumible; no se libera mediante
edición manual del catálogo.

## 8. Compras y recepción

Entidades planificadas: `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseReceipt` y
`PurchaseReceiptItem`, relacionadas con proveedor, productos y almacenes existentes.
Política de alcance cerrada por la solicitud de implementación de Compras (2026-10-13):
solo `RAW_MATERIAL` y `CONSUMABLE`. Esta selección es una regla funcional de esta entrega,
no una nueva invariante arquitectónica ni un cambio de los ADR aceptados.

Estados: `DRAFT`, `CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`.
Solo se edita `DRAFT`. Confirmar valida proveedor y productos activos, sin stock ni lotes.
Cancelar se permite desde `DRAFT` o `CONFIRMED` sin recepciones. Una orden recibida parcial
o totalmente no se cancela ni se modifica mediante este flujo.

Cantidades y precios viajan como strings y se calculan con decimal. `lineTotal` se redondea
a dos decimales con `ROUND_HALF_UP`; el total suma esos importes. Cantidad recibida se deriva
de la suma de recepciones de cada línea; pendiente = ordenada − recibida.

Al recibir se bloquea la OC, se suman las filas nuevas de cada línea antes de comparar con el
pendiente, se reservan números y se crean recepción/líneas. Luego Inventario crea los lotes
necesarios y registra todas las entradas dentro de esa misma transacción. Se actualiza el
estado derivado de la OC y se registra `RECEIVE` mediante `AuditService`.

Una línea puede repartirse entre almacenes/lotes mediante filas separadas. Dos recepciones
concurrentes no pueden exceder lo ordenado. Un error en lote, movimiento, saldo, estado o
auditoría revierte también los documentos y sus líneas. Reintentar una recepción ya completa
no crea entradas adicionales; la política de idempotencia HTTP para recepciones parciales
queda como decisión abierta, pues un segundo envío podría ser otra recepción válida.

## 9. BOM y órdenes de Producción

Modelo planificado conforme al ADR 014 aceptado: `BillOfMaterial` identifica la fórmula del producto;
`BomVersion` contiene versión, `outputQuantity` y componentes `BomItem`. Cada OP referencia
`bomVersionId`. Una versión referenciada por cualquier OP es inmutable; una corrección crea
otra. Solo una versión está activa por fórmula. Activación/uso deben serializarse para que
la versión no se edite mientras una orden la referencia.

La inmutabilidad protege el contenido de la fórmula, su cantidad base y sus componentes;
activar/desactivar una versión cambia su elegibilidad para nuevas OP, sin alterar lo usado
por órdenes anteriores. La activación de una versión nueva conserva las referencias históricas.

Producto fabricable: `INTERMEDIATE` o `FINISHED_GOOD`, activo y `isLotTracked = true`.
Componentes: `RAW_MATERIAL`, `CONSUMABLE` o `INTERMEDIATE`, activos, sin duplicados ni
autorreferencia. Las cantidades se expresan en `Product.unit`; no hay conversiones implícitas.
Se fabrican intermedios mediante OP separadas, sin expansión recursiva automática de BOM.

```text
requiredQuantity = componentQuantity × (quantityPlanned / bomOutputQuantity)
```

Se usan decimales; la versión inmutable permite reconstruir necesidades sin guardar otra
tabla de requerimientos derivada. C-1 adopta rechazo de resultados no representables
exactamente con cuatro decimales o fuera de `Decimal(18,4)`, sin redondeo ni truncamiento.
Esta política concreta la decisión que PR0 dejó abierta; no era una exigencia previa del ADR.

C-1 conserva **todas** las versiones inmutables desde su creación, incluso sin OP asociada;
el mínimo del ADR 014 protegía las versiones utilizadas. La primera versión se activa
automáticamente, y las siguientes requieren activación explícita. Son políticas de implementación
de C-1, no obligaciones previamente prescritas por PR0. El nombre y estado de la cabecera
y la activación de una versión siguen siendo mutables.

Estados de OP aceptados en ADR 014: `DRAFT`, `IN_PROGRESS`,
`COMPLETED`, `CANCELLED`, sin `CONFIRMED`.
Una OP utiliza un único almacén para consumo y output. C-1 crea/edita borradores, permite
cancelarlos y consulta requerimientos/disponibilidad. Crear, editar o cancelar un borrador
produce cero movimientos y cero lotes. C-1 expone únicamente `DRAFT` y cancelación a `CANCELLED`;
inicio y finalización pertenecen a C-2.

**Decisión de planificación cerrada al revisar C-1 (2026-10-10):**
`plannedStartAt` y `plannedEndAt` son opcionales y se almacenan como `timestamptz`/UTC.
Se permite cualquiera de los campos por separado; si existen ambos, `plannedEndAt >= plannedStartAt`.
La UI muestra y edita estos instantes en `America/Managua`, independientemente de la zona del navegador.
Son editables mientras la OP esté en `DRAFT` y distintos de `startedAt`/`completedAt`.
No se agrega `plannedDate`.

La creación usa `DocumentSequenceService.nextCode(tx, OP, createdAt)`; el año es el empresarial
de Managua. Número, OP y auditoría comparten transacción. La edición puede cambiar explícitamente
producto/versión, almacén, cantidad y planificación; una versión nueva debe estar activa y
pertenecer al producto. Omitir esos campos conserva la versión persistida, aunque otra pase a estar activa.
La OP no se rebasa automáticamente a la última fórmula.

`GET /api/production/orders/:id/requirements` calcula la versión almacenada y consulta
`StockQueryService.getConsumableQuantity` por componente y almacén. Devuelve cantidades string
`required`, `available`, `shortage`, más `canStart` y restricciones de elegibilidad. La versión
anterior desactivada conserva su validez para la OP existente; productos, cabecera y almacén
deben seguir activos. La consulta no reserva stock ni ofrece una garantía para C-2.

## 10. Ejecución, calidad y trazabilidad

`START` bloquea OP, valida `DRAFT`, productos, almacén, BOM y disponibilidad consumible
actual. Cambia a `IN_PROGRESS`, registra `startedAt` y auditoría; no consume ni reserva.
La disponibilidad puede cambiar posteriormente y debe comprobarse de nuevo en `COMPLETE`.
La cancelación solo se admite desde `DRAFT` en esta ronda.

`COMPLETE` exige `IN_PROGRESS` y `0 < quantityProduced <= quantityPlanned`. El consumo se
calcula con `quantityPlanned`; el output usa `quantityProduced`. Ejemplo: una OP planifica
100 unidades, obtiene 95 y consume los componentes correspondientes a 100. La diferencia
representa rendimiento implícito, sin otro sistema de merma.

Para cada componente trazable se seleccionan lotes explícitamente. La suma de asignaciones
debe ser exactamente el requerimiento; se validan producto, almacén, disponibilidad y estado
`RELEASED`. Componentes no trazables usan lote nulo. Una sola llamada a Inventario registra
todos los consumos y el output, crea el lote producido con origen OP y participa en la
actualización de cantidades/estado/fecha y en la auditoría `COMPLETE`.

Una segunda finalización de la misma OP debe rechazarse bajo bloqueo sin duplicar consumos,
output ni lote. Ante cualquier fallo se revierte el conjunto y la OP sigue `IN_PROGRESS`.

Calidad registra `QualityInspection`: lote, resultado `APPROVED`/`REJECTED`, observaciones,
no conformidades, fecha y responsable. Si el producto requiere inspección, el lote espera en
`QUARANTINED`; no existe un resultado `PENDING`. Un lote sin ese requisito puede nacer
`RELEASED` sin inspección. Aprobar solicita a Inventario `RELEASED`;
rechazar solicita `REJECTED`. Ambos cambios e inspección son atómicos y usan acciones
`QUALITY_APPROVE`/`QUALITY_REJECT`, conforme al ADR 005. El estado vigente es `Lot.status`.
Consumo y despacho bloquean lotes no liberados; ajustes de salida siguen permitidos.
Reinspección y sus transiciones requieren la decisión pendiente del §14.

El alcance mínimo propuesto de C-2 cubre controles de lotes producidos. Inspeccionar lotes
recibidos es una ampliación funcional por acordar, no una obligación aprobada en los ADR.
Un lote de Compra que requiera inspección permanece en cuarentena hasta disponer del flujo
autorizado; limitar el alcance de Calidad no autoriza liberarlo automáticamente.

La consulta de trazabilidad reconstruye:

```text
Lote producido → OP → versión BOM → movimientos de consumo → lotes de componentes
               → recepciones → órdenes de compra → proveedor
```

Los componentes no trazables se muestran con producto/cantidad y sin atribuirles una entrega
que el sistema no registró. Los intermedios enlazan sus OP anteriores. Se conserva la
distinción entre auditoría del sistema, documentos empresariales y ledger.

## 11. API y pantallas previstas

Esta tabla conserva el alcance previsto de la ronda. Los endpoints C-1 ya están implementados
en `feature/production-core`; su contrato real se registra en `api.md`. Los de Compras, A-2 y C-2
siguen sujetos a sus entregas. Todas las rutas declaran
una política de acceso y reutilizan validación, paginación y respuestas del proyecto.

| Entrega | API prevista                                                                                                                                                        | Pantallas previstas                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A-2     | `GET /api/inventory/stock`, `/movements`, `/lots`, `/lots/:id`; `POST /api/inventory/adjustments`                                                                   | Existencias, movimientos, lotes y formulario de ajuste; ampliar Productos para banderas. |
| Compras | `GET/POST /api/purchase-orders`; `GET/PATCH /:id`; `POST /:id/confirm`, `/cancel`, `/receive`; consultas de recepciones                                             | Listado/detalle/edición de órdenes, recepción y consulta de recepciones.                 |
| C-1     | `GET/POST /api/production/boms`; detalle, nuevas versiones y activación; `GET/POST /api/production/orders`; detalle/edición de borrador, `/requirements`, `/cancel` | Fórmulas/versiones, órdenes, detalle y disponibilidad.                                   |
| C-2     | `POST /api/production/orders/:id/start`, `/complete`; inspecciones y consulta de trazabilidad                                                                       | Ejecución/asignación de lotes, calidad y trazabilidad.                                   |

Roles de mutación propuestos: ajustes/configuración, `ADMIN`/`INVENTARIO`; órdenes y
recepciones, `ADMIN`/`COMPRAS`; BOM/OP/inspecciones, `ADMIN`/`PRODUCCION`. Lecturas para roles
autenticados, salvo restricciones específicas que el equipo acuerde. Las rutas frontend
usan el layout, cliente API, TanStack Query, RHF/Zod y componentes existentes. Cada pantalla
incluye carga, errores, vacío, filtros/paginación cuando aplique y confirmación de acciones.

Esta matriz de RBAC es ajustable antes de implementar cada caso de uso. No decide que
`INVENTARIO` pueda registrar recepciones: por ahora se propone `ADMIN`/`COMPRAS`; cualquier
ampliación debe acordarse. Los nombres de páginas/componentes siguen siendo orientación.

## 12. Migraciones y preservación

PR0 no cambia `schema.prisma` ni migraciones. Cada PR funcional parte de `develop` actualizado
y conserva todas las migraciones compartidas, los catálogos, auth y auditoría.

- A-1 concreta servicios y contrato sin habilitar tipos/orígenes empresariales inexistentes. No
  crea lotes ni tiene endpoint de alta; la FK de origen aún no existe, por lo que un lote existente
  sin origen puede ser referenciado internamente. La validación de origen comienza con Compras.
- Compras incorpora documentos, `PURCHASE_RECEIPT`, su FK de origen, `reason` nullable y el
  origen de lotes recibidos, con CHECK/índices/FKs propios.
- C-1 incorpora BOM/versiones/OP sin habilitar ejecución ni crear lotes.
- C-2 amplía orígenes/tipos para consumo/output, conserva los de Compra e incorpora calidad.
- A-2 coordina cualquier cambio de esquema con esas entregas; no regenera migraciones ajenas.

Prueba obligatoria en PostgreSQL 18: instalación vacía y actualización desde la versión
anterior con datos. Si usar un nuevo valor de enum en la misma transacción da error, separar
la adición del enum y su uso en migraciones nuevas ordenadas; no retirar CHECK para pasar.
Comprobar drift, append-only y reconciliación. Los datos operativos se prueban en bases `_test`.
El retorno de la aplicación debe preservar datos; después de introducir tipos nuevos, una
versión antigua puede no entenderlos. El plan de rollback compatible se especifica en cada
PR de migración, sin prometer downgrade automático ni borrar documentos de dominio.

## 13. Pruebas y Definition of Done

| Entrega | Evidencia mínima esperada                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1     | Ajustes previos preservados; varias líneas atómicas; carrera del primer saldo; dos salidas competidoras; orden invertido de entrada con los mismos recursos; catálogos concurrentes; reconciliación; auditoría con rollback; no hay alta operativa de lotes; un ID inexistente se rechaza y no se crea automáticamente. La validación del origen de una fila existente se difiere a Compras. |
| Compras | Orden/confirmación/cancelación sin stock; recepciones parciales; varias filas de la misma línea; sobre-recepción concurrente; origen y signo/FKs; creación de lote; rollback de auditoría y documentos; rechazar filas operativas sin FK de origen; permisos y frontend.                                                                                                                     |
| A-2     | Filtros/paginación; saldo general y por lote; ajustes con motivo; productos/almacenes inactivos; cambio de `isLotTracked` rechazado con cualquier movimiento, incluso con saldo cero, y permitido sin historial; permisos; estados de interfaz.                                                                                                                                              |
| C-1     | BOM válida/inválida, duplicados/autorreferencia, cantidades decimales; cálculo exacto; versión usada inmutable y una activa; OP con BOM incorrecta/producto no trazable; borradores sin stock; disponibilidad real y permisos/frontend.                                                                                                                                                      |
| C-2     | START sin stock; lotes insuficientes/no liberados; asignaciones exactas; consumo según plan y output real; COMPLETE concurrente/repetido; rollback total; inspección vs consumo; calidad/no conformidades; trazabilidad hasta proveedor y frontend.                                                                                                                                          |

Antes del PR funcional: dependencias integradas, contrato real conectado, backend/frontend y
pruebas del alcance completos, lint/formato/build y suites correspondientes aprobados,
migración nueva verificada cuando aplique, Swagger y documentos canónicos actualizados.
La CI debe aprobar el commit publicado; revisión/merge siguen la política del equipo.
No se marca un RF completo si todavía falta el alcance de otros dominios, especialmente
RF-INV-002 que también incluye Ventas.

PR0 termina con especificación/ADR/índice/documentos alineados, enlaces relativos válidos,
formato y diff revisados, ADR 001–010 intactos y exclusivamente cambios de documentación.
Tras esta revisión, los ADR 011–014 están aceptados; se conserva el borrador local sin commit
ni push. El siguiente paso será el commit de PR0 y después A-1, bajo una nueva instrucción.

## 14. Decisiones vigentes, propuestas y abiertas

Vigentes: ADR 004–007 (ledger/balance, auditoría, identificación, trazabilidad) y ADR 008–010
(auth/políticas). [El índice ADR](../decisions/README.md) determina su estado. Se conservan
íntegros; 011–014 también están aceptados conceptualmente, con implementación pendiente.
011–013 detallan la aplicación futura de 004 y 007 sin sustituir sus invariantes.

| Decisión                                                           | Documento                                                            | Estado    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | --------- |
| Inventario como escritor único y contrato con transacción recibida | [ADR 011](../decisions/011-inventory-single-writer.md)               | Aceptado. |
| Transacción del llamador y orden global de recursos                | [ADR 012](../decisions/012-transacciones-y-orden-de-bloqueos.md)     | Aceptado. |
| Creación de lotes por Inventario y origen XOR                      | [ADR 013](../decisions/013-origen-obligatorio-de-lotes.md)           | Aceptado. |
| BOM/versiones, estados de OP y semántica START/COMPLETE            | [ADR 014](../decisions/014-versionado-bom-y-ejecucion-produccion.md) | Aceptado. |

Diferencias encontradas y tratamiento en PR0:

1. El modelo conceptual anterior incluía `ProductionOrderStatus.CONFIRMED`; el diseño aceptado
   de esta ronda lo elimina. `QualityStatus.PENDING` también se elimina del resultado previsto.
   Ninguno de esos enums de dominio existe todavía en el schema físico.
2. La BOM anterior era `Bom(productId, version, quantityBase)`; el chat separa fórmula y
   `BomVersion(outputQuantity)`. ADR 014 acepta fórmula y versiones con OP → versión concreta.
3. `database.md` describe `reason` nullable como si fuera físico; hoy es obligatorio. El cambio
   se reserva para Compras. La relación recepción–lote aceptada usa el origen en `Lot`.
4. El texto de primera fila mencionaba `upsert`; el código y el ADR 004 usan inserción con
   conflicto ignorado más bloqueo. Se alinea la descripción con lo que está implementado.
5. Algunos párrafos de catálogos aún hablan de integración pendiente; el historial ya contiene
   los PR #6/#8/#9. Se corrigen referencias actuales relacionadas sin reescribir evidencia.
6. La documentación histórica sugería cambiar `isLotTracked` tras dejar el saldo en cero.
   A-2 bloqueará el cambio con cualquier movimiento histórico; el saldo cero no lo habilita.
   El campo físico existente y la edición/protección aún no implementadas se distinguen en §2.
7. Se elimina el gate de A-2 completo antes de C-2: se requieren A-1, Compras y el contrato
   necesario de Inventario, además de C-1. A-2 sigue en el orden recomendado.
8. La falta de inspección no implica siempre cuarentena: depende de `requiresQualityInspection`.
   El alcance de Calidad para compras, RBAC y tipos comprables se separa de los ADR aceptados.

Políticas deliberadamente propuestas y guía ajustable:

- **Tipos comprables:** `RAW_MATERIAL`/`CONSUMABLE` como alcance inicial, ampliable por el equipo.
- **RBAC de recepciones:** `ADMIN`/`COMPRAS`; acceso de `INVENTARIO` sin decidir.
- **Alcance de Calidad:** mínimo propuesto de lotes producidos; lotes de Compra por acordar.
- **Archivos/componentes frontend:** orientación de implementación, sin nombres obligatorios en ADR.

Decisiones concretadas por C-1:

- **Fechas de OP:** inicio/fin opcionales `timestamptz`/UTC, UI Managua y validación de ventana (§9).
  Elección explícita del responsable al revisar C-1, sin `plannedDate` adicional.
- **Precisión BOM:** rechazo si el resultado no cabe exactamente en cuatro decimales (§9).
- **Versiones:** contenido inmutable desde su creación y primera versión activa automáticamente (§9).

Decisiones que aún requieren resolución antes de implementar el punto afectado:

- **Reinspección:** estados desde los que puede aprobarse/rechazarse de nuevo y preservación
  del historial; definir antes de implementar Calidad.
- **Reintentos de recepción parcial:** decidir si se añade clave de idempotencia HTTP; el
  bloqueo y el límite ordenado no detectan por sí solos un doble envío parcial válido.
- **Asignación nominal:** designar los otros dos responsables y la persona que coordina Prisma.

Estas cuestiones no invalidan las cuatro decisiones aceptadas. Deben resolverse antes de
implementar el punto afectado; esta revisión de documentación no inicia código ni migraciones.

### Decisiones de implementación de Compras (2026-10-13)

La recepción devuelve el detalle actualizado de OC y expone además `GET /api/purchase-orders/:id/receipts`.
`expectedDate: null` permite borrar la fecha al editar; `items` reemplaza las líneas solo en DRAFT.
`receivedAt` requiere zona si se envía; el frontend interpreta su entrada en Managua.
`expiresAt` solo aplica a trazables; `originatedAt = receivedAt`. Los importes de línea fuera de
`Decimal(14,2)` se rechazan sin truncamiento. Las mutaciones pertenecen a ADMIN/COMPRAS.
Se conserva la migración compartida y se añade una correctiva transaccional para el origen físico.
No se incorpora idempotencia HTTP parcial; sigue abierta para una etapa posterior.
Compras precede A-2: las vistas de stock, movimientos y lotes de PR #15 deberán adaptarse
tras actualizarse contra `develop` con Compras integrada. Esta rama no depende de A-2.

### Decisiones de implementación C-2 (2026-10-18)

El alcance de [C-2](../production-c2-validation.md) conserva los ADR aceptados y concreta:

- START usa una instantánea REPEATABLE READ de la disponibilidad canónica de Inventario;
  no crea reservas. Un conflicto de serialización se informa como 409 y requiere actualizar.
- COMPLETE recibe `allocations: [{ productId, lots: [{ lotId, quantity }] }]` y `expiresAt`
  opcional DATE. Rechaza duplicados y sumas distintas del requerimiento; consume el plan y
  registra el output real. Inventario exige una OP y exactamente un output en el plan completo.
- Calidad admite solo lotes producidos QUARANTINED y una única decisión. Observaciones son
  obligatorias; rechazo exige no conformidades. Se registran creación, inspección y actor.
- Trazabilidad devuelve un grafo `{ rootLotId, lots }` con enlaces por `lotId`, sin repetir
  antecesores compartidos. DFS iterativo distingue ruta activa de visitados y rechaza ciclos.
  Cada consumo identifica movimiento, almacén y OP, aun cuando el componente no use lote.
- Los enums se agregan en una migración previa a los CHECKs que los utilizan. El rollback
  de aplicación conserva los datos y requiere un build que entienda los tipos nuevos.

Estas son decisiones de implementación y alcance de C-2, sin reescribir ADR 011–014.
