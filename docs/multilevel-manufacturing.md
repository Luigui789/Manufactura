# Manufactura multinivel (C4)

## 1. Objetivo

Cerrar formalmente el soporte de manufactura multinivel del ERP:

```text
RAW_MATERIAL  ──►  INTERMEDIATE  ──►  FINISHED_GOOD
```

C4 **valida, protege y demuestra** una capacidad que el modelo ya tenía (un `INTERMEDIATE` puede
tener fórmula propia y a la vez ser componente de otra fórmula). No convierte el ERP en un MRP.
No agrega tablas, columnas ni migraciones: usa `Product`, `BillOfMaterial`, `BomVersion`,
`BomItem`, `ProductionRoute`, `RouteOperation`, `ProductionOrder`, `Lot` e `InventoryMovement`.

## 2. Qué significa BOM multinivel aquí

La relación entre niveles existe de forma natural:

```text
BomItem.componentProduct → Product → Product.billOfMaterial (fórmula del nivel inferior)
Product → Product.productionRoute (ruta estándar del nivel)
```

**Cada nivel se fabrica con su propia orden de producción explícita.** La fórmula del jabón
lista "aceite filtrado"; no lista el aceite usado recibido que el filtrado consume.

## 3. Por qué no existe explosión automática

El aceite filtrado debe existir **físicamente** en inventario antes de fabricar jabón:

```text
OP aceite filtrado → consume aceite usado recibido → produce lote de aceite filtrado
OP jabón           → consume ese lote de aceite filtrado
```

Así se conservan inventario real, lotes, trazabilidad, movimientos, y quedan abiertos el costeo y
la calidad del intermedio. Una explosión silenciosa ocultaría el stock intermedio y rompería la
cadena de lotes. Por eso `GET /production/orders/:id/requirements` sigue devolviendo **solo los
componentes directos** de la versión de la orden, y completar una OP solo consume esos componentes.

## 4. Flujo RAW → INTERMEDIATE → FINISHED

```text
Aceite usado recibido
RAW
      │
      │ OP-FILTRADO
      ▼
Aceite usado filtrado
INTERMEDIATE
      │
      │ lote intermedio
      ▼
Inventario
      │
      │ consumo por lote
      ▼
OP-JABON
      │
      ├── Soda
      ├── Agua
      └── Esencia
      ▼
Jabón ecológico
FINISHED_GOOD
```

1. OP 1 (`INTERMEDIATE`): `PRODUCTION_CONSUMPTION −1000 mL` de aceite recibido y
   `PRODUCTION_OUTPUT +1000 mL` de aceite filtrado, con lote nuevo `RELEASED` (el intermedio no
   requiere inspección).
2. OP 2 (`FINISHED_GOOD`): como el aceite filtrado es `isLotTracked`, la finalización exige asignar
   explícitamente el lote de la OP 1 (`500 mL`). El movimiento queda con `lotId` de ese lote.
3. El lote del jabón nace `QUARANTINED` porque `requiresQualityInspection = true`; la inspección y
   disposición de C2 no cambian.

## 5. Detección de ciclos

Existe ciclo cuando un producto fabricado vuelve a alcanzarse siguiendo
`producto → fórmula activa → componente INTERMEDIATE → fórmula activa → …`.

- **Grafo vigente:** `BillOfMaterial.isActive = true` y `BomVersion.isActive = true`. Solo
  `INTERMEDIATE` y `FINISHED_GOOD` se expanden; `RAW_MATERIAL` y `CONSUMABLE` son hojas.
- **Versión candidata:** al crear una versión se valida como si fuese la activa del producto,
  aunque nazca inactiva. No se almacena una versión estructuralmente inválida.
- **Revalidación:** activar una versión y reactivar una fórmula (`false → true`) vuelven a validar,
  porque otras fórmulas pudieron cambiar desde la creación.
- **Desactivar siempre está permitido:** solo quita aristas.
- **Algoritmo:** DFS iterativo (sin recursión, sin límite de pila) con conjunto `visited` y camino
  de ancestros. Un nodo compartido por dos ramas (`A → {B, C} → D`) es un DAG válido; solo es ciclo
  el nodo que reaparece en su propio camino actual.
- **Error:** `422` con
  `{ statusCode, code: "BOM_CYCLE_DETECTED", message, path: ["A", "B", "A"] }` (códigos de producto).
  La autorreferencia directa conserva su error previo `BOM_SELF_REFERENCE`.
- El tipo de un producto no puede cambiar mientras una fórmula lo referencia, así que solo
  `createVersion`, `activateVersion` y la reactivación pueden agregar aristas.

Implementación: `backend/src/production/boms/bom-graph.service.ts` (funciones puras
`buildManufacturingGraph` y `findCycle`, más `BomGraphService`).

## 6. Advisory locking

Dos activaciones concurrentes `A → B` y `B → A` son válidas por separado y forman un ciclo juntas.
Los bloqueos de fila no lo impiden porque cada una bloquea una fórmula distinta. Por eso las tres
operaciones que pueden agregar aristas toman primero un **advisory lock transaccional** de
PostgreSQL:

```sql
SELECT pg_advisory_xact_lock(hashtext('ecosoap:bom-manufacturing-graph'));
```

- Orden de bloqueo: **lock del grafo → fórmula (`FOR UPDATE`) → productos ordenados
  (`FOR SHARE`) → versión**. Las órdenes de producción nunca toman este lock, así que su protocolo
  existente (`fórmula FOR UPDATE → productos FOR SHARE`) no puede formar un ciclo de espera con él.
- Se libera en el commit/rollback. La segunda transacción, en `READ COMMITTED`, lee el grafo ya
  confirmado por la primera y rechaza el ciclo.
- No lo toman `GET`, `list`, `calculate`, la estructura de manufactura ni producción.
- Es aceptable un mutex global porque los cambios estructurales del catálogo son poco frecuentes.

La prueba E2E de concurrencia lanza ambas activaciones en paralelo (cinco rondas): siempre una
`200` y una `422`, y el grafo activo queda acíclico. Con el lock deshabilitado la misma prueba
falla (`[200, 200]` y ciclo activo), lo que demuestra que el lock es la protección efectiva.

## 7. Estructura de manufactura

`GET /api/production/manufacturing-structure/:productId` (`@Authenticated()`, solo lectura, sin
auditoría ni locks; instantánea `REPEATABLE READ`).

- Raíz inexistente → `404`; raíz `RAW_MATERIAL`/`CONSUMABLE` → `422
INVALID_MANUFACTURING_STRUCTURE_ROOT`.
- Por cada producto fabricado: producto, fórmula con su **versión activa** (no la última por
  número), ruta (`routeStatus`: `ACTIVE`, `INACTIVE` o `MISSING`), operaciones ordenadas por
  `sequence, id`, `totalStandardMinutes` calculado, componentes e `issues`.
- Cada componente: `product`, `quantity`, `unit`, `type`, `isManufactured` y `child` (subestructura
  si es fabricado; `null` en hojas). Decimales siempre como string.
- Una fórmula inactiva o sin versión activa no expande componentes (igual que el grafo de ciclos).
- `issues`: `PRODUCT_INACTIVE`, `MISSING_BOM`, `BOM_INACTIVE`, `MISSING_ACTIVE_BOM_VERSION`,
  `EMPTY_BOM_VERSION`, `MISSING_ROUTE`, `ROUTE_INACTIVE`, `NO_ROUTE_OPERATIONS`. No bloquean la
  consulta.
- `readiness`: `READY` cuando el nodo y todos sus descendientes fabricados tienen producto activo,
  fórmula activa, versión activa con al menos un componente y ruta activa con al menos una
  operación; si no, `INCOMPLETE`. La raíz agrega `maxDepth` (niveles de componentes).
- Carga por niveles (dos consultas por nivel), sin N+1 por nodo.
- **Guard defensivo:** si datos históricos o manuales contienen un ciclo, responde `409
BOM_GRAPH_CORRUPTED` con el camino, sin recursión infinita.
- `readiness` **no** bloquea producción: crear, iniciar y completar órdenes no exigen ruta.

Pantallas: `/production/structure` (selector de productos intermedios/terminados activos) y
`/production/structure/:productId` (árbol con tarjetas, sangría y bordes; enlaces "Ver BOM" y
"Ver ruta"). El detalle de fórmula y el de ruta enlazan a "Ver estructura de manufactura".

## 8. BOM vs ruta

| Fórmula (BOM)                                         | Ruta                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| Qué se consume y en qué cantidad por unidad de salida | Qué operaciones estándar se realizan y su tiempo  |
| Versionada; la orden fija su `bomVersionId`           | Catálogo estándar (C1); la orden no la referencia |
| Determina consumo de inventario al completar          | No genera movimientos ni ejecución de operaciones |

## 9. Estructura vs trazabilidad histórica

```text
Manufacturing Structure         = configuración vigente (qué debería consumirse hoy)
Lots / Inventory movements      = ejecución histórica (qué se consumió realmente)
```

La pantalla Estructura no es trazabilidad. La genealogía real ya se reconstruye con
`GET /api/production/lots/:id/traceability`: lote de jabón → consumo del lote de aceite filtrado →
lote filtrado con origen en la OP de filtrado → consumo del lote de aceite recibido → recepción de
compra. La prueba E2E multinivel lo verifica.

## 10. Ejemplo EcoSoap de referencia

No forma parte del seed oficial (eso es C5); vive en `backend/test/production-multilevel.e2e-spec.ts`.

**Nivel 1 — Aceite usado filtrado** (`INTERMEDIATE`, `MILLILITER`, `isLotTracked`)

- Fórmula: salida 1000 mL ← 1000 mL de aceite usado recibido.
- Ruta: 10 Filtración (30 min), 20 Verificación visual (5 min).

**Nivel 2 — Jabón ecológico 500 g** (`FINISHED_GOOD`, `UNIT`, `isLotTracked`,
`requiresQualityInspection`)

- Fórmula por 1 UNIT: 500 mL aceite filtrado, 70 g soda cáustica, 180 mL agua, 5 mL esencia.
- Ruta: 10 Mezclado (15), 20 Moldeado (10), 30 Curado / secado (21600), 40 Inspección final (5),
  50 Empaque (5) minutos.

## 11. Compatibilidad

- **C1:** rutas siguen siendo catálogo; sin `routeId` en la orden ni ejecución de operaciones.
- **C2:** el lote final `QUARANTINED` se aprueba o rechaza/dispone igual que antes.
- **C3:** la huella de la OP final toma del ledger el `PRODUCTION_CONSUMPTION` del intermedio y lo
  trata según sus factores; **no** explota la huella a la materia prima del intermedio, que
  pertenece a la OP de filtrado (sin doble conteo).
- **IIoT y dashboards:** sin cambios de contrato.
- **Auditoría:** las mutaciones exitosas siguen auditando `BILL_OF_MATERIAL` y `BOM_VERSION`; una
  mutación rechazada por ciclo no escribe nada. La consulta de estructura no audita.

## 12. Limitaciones

- No MRP.
- No crea automáticamente órdenes hijas.
- No hay consumo recursivo automático.
- No hay programación (scheduling).
- No hay ejecución de operaciones de ruta.
- No hay snapshots de ruta en la orden.
- No hay roll-up recursivo de costos.
- No hay roll-up recursivo de huella de carbono.
