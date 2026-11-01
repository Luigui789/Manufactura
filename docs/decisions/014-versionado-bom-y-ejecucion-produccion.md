# ADR 014 — Versiones de BOM y ejecución atómica de Producción

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Etapa:** Siguiente ronda — Producción C-1 y C-2

## Contexto

Editar una fórmula utilizada reescribiría la historia de las órdenes. Además, inicio y finalización
necesitan una semántica común para disponibilidad, consumo, rendimiento, lote y calidad. Estos
modelos y enums de Producción todavía no existen en el schema físico.

## Decisión

Se separan `BillOfMaterial` y `BomVersion`, con componentes por versión. Las versiones
referenciadas por una OP son inmutables; los cambios crean una nueva versión. La OP referencia
una `BomVersion` concreta mediante `bomVersionId` y utiliza un único almacén para consumo
y producto obtenido.

La inmutabilidad comprende el contenido, cantidad base y componentes de la versión. Cambiar
su activación para nuevas OP no modifica ese contenido ni la referencia de órdenes históricas.

El producto fabricado será `INTERMEDIATE` o `FINISHED_GOOD` con trazabilidad por lote obligatoria.
Las cantidades usan la unidad base del producto y cálculo decimal, sin conversiones implícitas.

Estados de OP: `DRAFT`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`; se omite `CONFIRMED` en esta ronda.
Solo se cancela desde `DRAFT`. `START` valida disponibilidad y cambia el estado sin consumir ni
reservar. `COMPLETE` revalida stock y lotes bajo bloqueo, consume según `quantityPlanned` y genera
output según `quantityProduced`, con `0 < quantityProduced <= quantityPlanned`.

La finalización es una única transacción: consumos, output, lote con origen OP, estado/cantidades
de la orden y auditoría. Cada OP genera un único lote de output. Inventario crea el lote
y escribe stock según los ADR 011–013. Una OP
completada no puede ejecutarse otra vez.

Calidad registra resultados `APPROVED` o `REJECTED`; cuando se requiere inspección, la espera
se expresa con lote `QUARANTINED`. Sin ese requisito, el lote nace `RELEASED` según ADR 007.
La inspección solicita a Inventario la liberación/rechazo del lote dentro de la misma transacción.
Se preservan las acciones específicas del ADR 005 y las restricciones del ADR 007.
El alcance mínimo propuesto de Calidad puede limitarse a lotes producidos. Este ADR no obliga
a inspeccionar todos los lotes de Compra; ampliar ese alcance es una decisión funcional aparte.

## Consecuencias

- C-1 puede entregar fórmulas, borradores y requerimientos sin modificar existencias; C-2 incorpora
  ejecución, calidad y trazabilidad después de las dependencias de Inventario y Compras.
- Obtener menos que lo planificado conserva el consumo planificado como rendimiento implícito.
  Consumo real variable, sobreproducción y reversas requieren otro alcance.
- La disponibilidad consultada o comprobada al iniciar no garantiza disponibilidad al completar.
- Las fechas de planificación, precisión de cálculo no representable y reinspección permanecen
  abiertas en la especificación; este ADR no las aprueba indirectamente.

Aceptado conceptualmente en la revisión local de PR0 del 2026-10-10; implementación pendiente.
Dependencias y casos de prueba en la [especificación de la ronda](../specs/2026-10-10-inventory-purchases-production-design.md).
