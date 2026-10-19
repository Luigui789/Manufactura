# C-2 — Prompt de ejecución sobre A-2 integrado

Actualizado el 2026-10-14. Estado: **plan listo; implementación de C-2 pendiente**.

Nota del 2026-10-18: se conserva este plan como instrucción histórica de partida. La
implementación y su evidencia actual se registran en el [informe C-2](../production-c2-validation.md).

Este documento consolida las correcciones del responsable para C-2 y el núcleo vigente de la
[especificación de la ronda](2026-10-10-inventory-purchases-production-design.md), §10–13.
Sustituye cualquier instrucción anterior de esperar el merge de A-2 o integrar de nuevo PR #15.
Los apartados siguientes son instrucciones para el agente que implemente C-2.

## 0. Base obligatoria de C-2

PR #15 / A-2 **ya está integrado**. El `develop` de partida confirmado es:

```text
f5fcc28b0bc2c5f30a4a7b839301d6eb921257ba
```

Ese estado contiene A-1, C-1, Purchase y A-2. Al preparar este plan se ejecutó
`git fetch origin` y se verificó que `origin/develop` apunta exactamente a ese commit;
su mensaje es `Merge pull request #15 from Luigui789/feature/inventory-movements`.

Antes de implementar:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git status
git log --oneline --decorate -15
git rev-parse HEAD
git merge-base --is-ancestor f5fcc28b0bc2c5f30a4a7b839301d6eb921257ba HEAD
```

Verificar que HEAD sea el commit indicado o un descendiente posterior; la última orden debe
terminar con código 0. El worktree debe estar limpio antes de cambiar de rama y antes de
crear C-2. Si hay cambios locales, preservarlos y resolver la situación sin descartarlos.

Después:

```bash
git switch -c feature/production-execution
```

C-2 debe nacer del `develop` que ya contiene A-1 + C-1 + Purchase + A-2.
No crear C-2 desde una rama antigua, no basarse directamente en
`feature/inventory-movements` y no volver a mergear PR #15.

## 1. Fuentes y puntos de integración existentes

Leer `CLAUDE.md`, los ADR 011–014 y los documentos canónicos pertinentes antes de editar.
Los ADR aceptados se conservan como registro; no reescribir su historia para describir C-2.

Reutilizar las implementaciones reales:

- `backend/src/production/orders/orders.service.ts` y sus DTO/controller: OP DRAFT de C-1.
- `backend/src/production/boms/bom-calculator.service.ts`: cálculo decimal según la versión
  persistida de la BOM; no recalcular con la versión activa para nuevas órdenes.
- `backend/src/inventory/stock/stock-query.service.ts`: disponibilidad canónica.
- `backend/src/inventory/movements/inventory.service.ts`: único escritor de Inventario.
- `backend/src/inventory/purchase-origin.ts`: origen empresarial de Compras creado por A-2.
- `backend/src/inventory/movements/movement-query.service.ts` y
  `backend/src/inventory/lots/lots.service.ts`: consultas conectadas de A-2.
- `frontend/src/features/inventory/api/inventory-data.ts`: tipos de origen, movimientos,
  lotes y funciones `getInventoryLots`/`getInventoryLot` existentes.
- Páginas de órdenes de Producción y `MovementsPage.tsx`/`LotsPage.tsx` de Inventario:
  extender sus flujos y contratos reales.

Conservar `DocumentSequenceService`, `AuditService`, políticas de acceso, cliente API,
TanStack Query, RHF/Zod y layout existentes.

## 2. Integración con los orígenes A-2 ya existentes

A-2 implementa origen empresarial de Compras en `purchase-origin.ts`, consumido por
`MovementQueryService` y `LotsService`, incluidos los movimientos del detalle de lote.
Actualmente esa infraestructura solo conoce Purchase.

C-2 debe generalizarla para resolver **PurchaseReceiptItem XOR ProductionOrder**, por ejemplo
mediante `backend/src/inventory/business-origin.ts` o una abstracción común equivalente.
Todos los callers deben usar el mismo criterio para resolver origen y referencia empresarial.
No dejar `purchaseOrigin(...)` y `productionOrigin(...)` como sistemas independientes que
obliguen a cada caller a elegir manualmente.

Preservar exactamente los campos y valores de origen y referencia de Purchase ya existentes:

```text
Lote Purchase   → origin.type = PURCHASE_RECEIPT
Lote Production → origin.type = PRODUCTION_ORDER
```

Si existe `purchaseReceiptItemId` y falta su relación, mantener el error de integridad de A-2.
Aplicar la misma regla a `productionOrderId`: un FK presente con relación ausente nunca se
convierte silenciosamente en `null`. Un lote operativo debe tener exactamente un origen;
el XOR se garantiza también en persistencia. Los ajustes carecen de referencia empresarial,
aunque el lote ajustado sí tenga origen.

## 3. Tipos frontend de origen

Los tipos Purchase-only están actualmente en
`frontend/src/features/inventory/api/inventory-data.ts`. Evolucionarlos a una unión discriminada
y reutilizarla en lista y detalle. Se pueden extraer tipos compartidos si resulta necesario.

```ts
type PurchaseOrigin = {
  type: 'PURCHASE_RECEIPT';
  purchaseReceiptItemId: string;
  purchaseReceipt: { id: string; number: string; receivedAt: string };
  purchaseOrder: { id: string; number: string };
  supplier: { id: string; code: string; name: string };
};

type ProductionOrigin = {
  type: 'PRODUCTION_ORDER';
  productionOrder: { id: string; number: string };
  bomVersion?: { id: string; version: number };
};

type InventoryLotOrigin = PurchaseOrigin | ProductionOrigin;

type BusinessReference =
  | {
      type: 'PURCHASE_RECEIPT';
      id: string;
      number: string; // REC-...
      purchaseOrder: { id: string; number: string };
    }
  | {
      type: 'PRODUCTION_ORDER';
      id: string;
      number: string; // OP-...
    }
  | null;
```

`InventoryMovementRow` incorpora `productionOrderId: string | null` y usa `BusinessReference`.
`InventoryLotRow.origin` usa la unión; si se conserva la nulabilidad pública existente, esta
no autoriza a ocultar errores de integridad del backend. Los lotes operativos válidos tienen origen.

No sustituir `PurchaseOrigin` por un objeto genérico sin discriminante. Renderizar REC/OC,
proveedor u OP con `type`, tanto en movimientos como en lista y detalle de lotes.

## 4. Movement query y lot query después de C-2

`MovementQueryService` ya expone `purchaseReceiptItemId` y `businessReference` de Purchase.
Agregar `productionOrderId`, seleccionar la relación `ProductionOrder` y resolver la referencia
OP mediante la abstracción común. Aplicarlo también a los movimientos del detalle de lote.

| Tipo de movimiento       | `businessReference`                                         |
| ------------------------ | ----------------------------------------------------------- |
| `ADJUSTMENT_IN`          | `null`                                                      |
| `ADJUSTMENT_OUT`         | `null`                                                      |
| `PURCHASE_RECEIPT`       | `type = PURCHASE_RECEIPT`, `number = REC-...`, OC existente |
| `PRODUCTION_CONSUMPTION` | `type = PRODUCTION_ORDER`, `number = OP-...`                |
| `PRODUCTION_OUTPUT`      | `type = PRODUCTION_ORDER`, `number = OP-...`                |

La referencia de un consumo pertenece a la OP que consume, aunque el lote consumido provenga
de una REC u otra OP. No romper el contrato existente de REC/OC.

`LotsService` debe resolver el XOR real:

```text
Lot
├── PurchaseReceiptItem → REC → OC → Supplier
└── ProductionOrder → OP → BomVersion
```

Para un lote producido devolver, como mínimo:

```ts
{
  type: 'PRODUCTION_ORDER',
  productionOrder: { id, number }
}
```

Puede incluir `bomVersion` u otra información útil del producto sin duplicar excesivamente el
response. Lista y detalle deben usar la misma semántica. Los lotes Purchase existentes deben
seguir devolviendo exactamente su origen actual. Conservar filtros, paginación, saldos por
almacén y tratamiento de `expiresAt` como fecha calendario de A-2.

## 5. Selección de lotes en COMPLETE

Reutilizar `GET /api/inventory/lots` y `getInventoryLots` para la selección visual de lotes.
Para cada componente trazable consultar con:

```text
productId = componente
warehouseId = almacén de la OP
status = RELEASED
hasStock = true
```

Respetar la paginación; no asumir que la primera página contiene todos los lotes disponibles.
El usuario asigna cantidades explícitas y su suma debe coincidir exactamente con el requerimiento.
No crear `GET /api/production/available-lots` ni otro catálogo paralelo de Inventario.

Esta consulta ayuda a la UI. El backend COMPLETE no confía en ella: `InventoryService` debe
bloquear, releer y validar existencia, producto, almacén, stock y estado dentro de la transacción
real de COMPLETE. Mostrar un conflicto de stock/estado y permitir actualizar la selección.

## 6. START: disponibilidad consistente, sin reserva

`POST /api/production/orders/:id/start` bloquea la OP, exige `DRAFT`, valida los catálogos/BOM
aplicables y obtiene una lectura consistente de disponibilidad consumible para los componentes,
usando la lógica canónica de Inventario. C-1 advierte que su consulta informativa actual no ofrece
una instantánea transaccional de todos los componentes: no reutilizarla sin resolver esa diferencia.

Pasar a `IN_PROGRESS`, registrar `startedAt` y auditoría dentro de la misma transacción.
START no consume, no crea movimientos, no crea reservas ni convierte `IN_PROGRESS` en stock
reservado. Si se necesitan bloqueos para la lectura consistente, siguen el protocolo global
y terminan con la transacción; no mantenerlos después del commit.

Después de START, el stock queda libre para otras operaciones. COMPLETE siempre vuelve a
validar bajo los bloqueos de escritura reales. La cancelación sigue permitida solo desde DRAFT.

## 7. COMPLETE: núcleo vigente y atomicidad

`POST /api/production/orders/:id/complete` exige `IN_PROGRESS` bajo bloqueo y cantidades
decimales válidas con `0 < quantityProduced <= quantityPlanned`.

```text
DRAFT → START → IN_PROGRESS → COMPLETE → COMPLETED
                                ├── consumo según quantityPlanned
                                ├── asignación explícita de lotes
                                ├── una llamada a InventoryService
                                ├── PRODUCTION_CONSUMPTION
                                ├── PRODUCTION_OUTPUT
                                ├── único lote de output con origen OP
                                ├── quantityProduced real
                                └── auditoría COMPLETE
```

Mantener las reglas:

- Un solo almacén para consumos y output; sin FIFO/FEFO, reservas ni expansión recursiva de BOM.
- Output `INTERMEDIATE` o `FINISHED_GOOD`, siempre lot-tracked.
- Consumos calculados según `quantityPlanned` y versión persistida, no según lo producido real.
- Componentes trazables con asignación explícita exacta de lotes RELEASED; componentes no
  trazables con lote nulo. Validar también duplicados y cantidades inválidas.
- Una sola llamada de movimientos a `InventoryService` recibe todos los consumos, el output
  y el lote nuevo. Inventario crea lotes y escribe movimientos/saldos; Producción no los escribe.
- El lote producido nace `QUARANTINED` si requiere inspección y `RELEASED` en caso contrario.
- Una transacción del caso de uso contiene numeración, movimientos, lote, cantidades/estado,
  `completedAt` y auditoría COMPLETE. Un fallo revierte todo y la OP queda IN_PROGRESS.
- Releer después de esperar bloqueos. COMPLETE concurrente o repetido no duplica consumo,
  output, lote ni auditoría; la segunda ejecución se rechaza por estado.

Respetar el orden global del ADR 012: documentos/recursos de dominio → secuencias ordenadas →
productos ordenados → almacenes ordenados → saldos ordenados → lotes ordenados. Incorporar
los recursos nuevos sin invertir el protocolo instalado por A-1 y Purchase.

## 8. Calidad y trazabilidad

Conservar el alcance de Calidad y trazabilidad previsto en la especificación y ADR 014:
inspecciones de lotes producidos, `APPROVED`/`REJECTED`, observaciones, no conformidades,
fecha y responsable. La espera es `Lot.status = QUARANTINED`; no crear resultado `PENDING`.

La inspección y transición del lote son atómicas. Inventario realiza la liberación/rechazo y
participa en los bloqueos compatibles con consumo; auditar con `QUALITY_APPROVE`/
`QUALITY_REJECT`. Mantener bloqueado el consumo de lotes no liberados y las reglas existentes
de ajustes. No ampliar a inspección de compras ni incorporar reinspección sin una decisión
funcional explícita; las compras en cuarentena conservan sus restricciones.

Reconstruir trazabilidad desde los documentos y movimientos reales:

```text
Lote producido → OP → BomVersion → consumos → lotes componentes
               → REC → OC → Supplier
```

Los intermedios enlazan sus OP anteriores; no confundir ese vínculo histórico con expansión
recursiva de BOM para calcular consumos. Para componentes no trazables mostrar producto y
cantidad, sin inventar una recepción/proveedor. Reutilizar las consultas y páginas de A-2.

La resolución de trazabilidad entre lotes producidos debe mantener un conjunto `visited`
o protección equivalente contra ciclos/corrupción de datos. Distinguir los nodos de la ruta
activa de los ya resueltos: compartir un antecesor entre ramas válidas no constituye un ciclo.
No imponer una profundidad arbitraria pequeña a una cadena válida. Si se detecta un ciclo
imposible según el modelo, fallar explícitamente en lugar de entrar en recursión infinita.

## 9. Persistencia, validación y entrega

Ampliar Prisma y restricciones con migraciones nuevas: origen OP de movimientos/lotes,
tipos de movimiento, XOR, signos, coherencia de FKs, unicidad del output e inspecciones.
Preservar todas las migraciones ya existentes en `develop` al crear la rama, los datos Purchase,
ledger/auditoría append-only y saldos no negativos. Probar instalación vacía y upgrade con datos
en PostgreSQL 18, drift y reconciliación. Si PostgreSQL exige separar la incorporación de enums
de su uso, hacerlo mediante migraciones nuevas ordenadas. Documentar rollback compatible sin
borrar datos.

Persistencia C-2 debe garantizar físicamente, mediante restricciones de base de datos:

- `Lot.purchaseReceiptItemId XOR Lot.productionOrderId`: exactamente un origen no nulo.
- `Lot.productionOrderId` único: una OP origina como máximo un lote.
- Producto del lote producido = `ProductionOrder.productId`, preferiblemente mediante FK compuesta.
- `PRODUCTION_OUTPUT` único por OP mediante índice único parcial:
  `UNIQUE(production_order_id) WHERE type = 'PRODUCTION_OUTPUT'`.
- No hacer `productionOrderId` globalmente UNIQUE en `InventoryMovement`, porque una OP genera
  múltiples `PRODUCTION_CONSUMPTION`.

No implementar estas garantías únicamente en TypeScript.

Las mutaciones de Producción usan las políticas existentes `ADMIN`/`PRODUCCION`; las lecturas
usan las políticas autenticadas del proyecto. Toda ruta declara exactamente una política.
Completar DTOs, Swagger y pantallas reales con carga, vacío, errores, permisos y actualización
de OP/requerimientos, stock, movimientos y lotes después del commit exitoso.

Evidencia mínima de aceptación:

- START sin stock se rechaza; START válido cambia estado sin stock/movimientos/reservas.
  Otra operación puede gastar el stock después de START y COMPLETE debe revalidarlo.
- Plan 100/output 95 consume para 100 y genera 95; cantidades inválidas se rechazan.
- Asignaciones incompletas, excesivas, lote/producto/almacén incorrecto, stock insuficiente y
  estados no liberados se rechazan sin efectos parciales.
- COMPLETE concurrente/repetido y carreras con otros consumos, catálogo y Calidad preservan
  atomicidad, orden de bloqueos y reconciliación.
- Fallo de auditoría o de cualquier paso revierte lote, numeración, movimientos, saldos y OP.
- Calidad aprobada/rechazada, cuarentena y trazabilidad hasta proveedor funcionan con datos reales.
- Trazabilidad recursiva de intermedios: cadena válida larga sin un límite arbitrario pequeño,
  antecesor compartido entre ramas sin falso positivo y ciclo/corrupción con error explícito.
- Restricciones físicas probadas directamente en PostgreSQL: rechazo de origen vacío/doble,
  segundo lote por OP, producto de lote incompatible y segundo output por OP; múltiples
  consumos de una misma OP siguen permitidos.
- Regresión de origen/referencia Purchase conserva exactamente su contrato; relación ausente
  con FK presente falla para ambos orígenes; ajustes conservan referencia nula.
- Lista/detalle/movimientos renderizan REC u OP por discriminante; COMPLETE usa filtros y
  paginación del endpoint de lotes existente y muestra conflictos de validación backend.
- Pruebas backend/frontend pertinentes, lint, formato, builds y validación Docker del flujo
  pasan; registrar comandos/resultados reales sin atribuir a C-2 la evidencia anterior de A-2.

Actualizar `docs/api.md`, `docs/database.md`, `docs/audit.md`, requisitos y progreso según la
implementación verificada. La entrega funcional va por PR de `feature/production-execution`
hacia `develop`; la CI debe validar el commit publicado y el merge sigue la política del equipo.

El punto de partida está disponible: **A-1 → C-1 → Purchase → A-2 (#15, f5fcc28) → C-2**.
Este plan elimina el bloqueo de A-2; no acredita que C-2 ya esté implementado o probado.
