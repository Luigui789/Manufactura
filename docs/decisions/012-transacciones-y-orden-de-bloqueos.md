# ADR 012 — Transacción del caso de uso y orden global de bloqueos

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Etapa:** Siguiente ronda — Inventario, Compras y Producción
- **Relación:** amplía la coordinación del ADR 004 y preserva su orden de balances.

## Contexto

La recepción y la finalización de producción afectan documentos, contadores, catálogos, saldos y
lotes. Ordenar solamente los saldos no evita un interbloqueo si otro servicio ya bloqueó un producto
o contador en otra secuencia. Una transacción por movimiento dejaría operaciones parciales.

## Decisión

Se adopta una única transacción propiedad del caso de uso llamador, con Inventario participando
en ella. Antes de escribir se recopilan todos los recursos y se toman los bloqueos en este orden:

1. Documento empresarial y recursos de dominio que serializan su transición.
2. `document_sequences`, ordenadas por `(documentType, year)`.
3. `products`, por ID ascendente.
4. `warehouses`, por ID ascendente.
5. `stock_balances`, por `(productId, warehouseId)` ascendente.
6. `lots`, por ID ascendente.

Los contadores de todos los números necesarios se reservan juntos antes de productos. Inventario
recibe todas las líneas y lotes previstos. Dentro del grupo de documentos, si hay varios recursos,
se usa un orden estable por tipo e ID. Compras y Producción no pueden crear/bloquear primero un
lote o producto arbitrario y después solicitar a Inventario el conjunto completo de bloqueos:
invertiría el protocolo y podría causar deadlocks. Los lotes nuevos se insertan
con origen válido y números reservados dentro de esa operación.

Se preserva la carrera segura de primera fila: inserción con conflicto ignorado y posterior
`FOR UPDATE`. Estados y disponibilidad se leen de nuevo después de esperar bloqueos. Calidad
comparte la coordinación de saldos/lotes para que una transición no se intercale entre validación
y consumo. La auditoría participa de la misma transacción.

## Consecuencias

- El protocolo se extiende a todas las operaciones que accedan a esos recursos, incluidas
  transiciones de calidad y numeración. Los modos de bloqueo se verifican contra FKs existentes.
- Las entradas de varias líneas se procesan en conjunto y en orden estable, aunque el usuario
  las envíe en otro orden.
- Se requieren pruebas concurrentes de recepción, consumo, catálogo y calidad, además de
  rollback total y reconciliación.
- La implementación conserva el orden de balances y las garantías del ADR 004; este documento
  no cambia ledger, precisión ni inmutabilidad.

Aceptado conceptualmente en la revisión local de PR0 del 2026-10-10; implementación pendiente.
Detalle operativo en la [especificación de la ronda](../specs/2026-10-10-inventory-purchases-production-design.md).
