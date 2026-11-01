# ADR 013 — Creación de lotes por Inventario con origen empresarial exclusivo

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Etapa:** Siguiente ronda — Inventario, Compras y Producción
- **Relación:** concreta la implementación incremental del ADR 007; no lo sustituye.

## Contexto

Foundation tiene `Lot` y la FK compuesta lote–producto, pero todavía no tiene recepciones ni
órdenes que puedan originar lotes operativos. Las futuras entregas deben cerrar esa relación
sin permitir lotes persistentes huérfanos o duplicar su creación por dominio.

## Decisión

Todo lote operativo tendrá exactamente un origen empresarial con FK:

```text
PurchaseReceiptItem XOR ProductionOrder
```

Compras incorpora `purchaseReceiptItemId`, obligatorio para los lotes que habilita; C-2 amplía
el CHECK para admitir `productionOrderId` de forma exclusiva. Cada origen es único: un lote por
línea de recepción trazable y un lote de output por OP. La recepción se relaciona con el lote
desde esa FK, sin otro `PurchaseReceiptItem.lotId` que duplique la identidad del origen.

### Alcance por etapa y aclaración de A-1

La invariante de origen es el contrato para habilitar lotes empresariales, pero su validación
física comienza en la migración de Compras, porque Foundation no tiene columnas ni FKs de origen.
La aprobación de este ADR no significa que A-1 ya pueda detectar el origen de una fila `Lot`.

En A-1, `InventoryService.applyMovements` no crea filas de lote. Acepta un `lotId` existente y
valida que el lote exista y pertenezca al producto; no puede comprobar su origen empresarial. No
hay endpoint ni caso de uso de negocio para crear lotes en esta etapa. Las pruebas pueden insertar
lotes directamente como fixtures. Por tanto, una fila preexistente sin origen puede ser referida
por el contrato interno; A-1 no afirma que esa fila sea rechazada como huérfana. Esa limitación
técnica queda aceptada hasta que Compras incorpore la primera FK de origen.

La migración de Compras debe habilitar el flujo operativo de recepción únicamente junto con la FK,
unicidad y CHECK que exijan `PurchaseReceiptItem` para los lotes recibidos. Antes de validar esa
restricción, debe detectar cualquier fila preexistente sin origen y detener la migración para una
resolución explícita; no debe convertirla silenciosamente en un lote operativo. C-2 ampliará el
CHECK a `PurchaseReceiptItem XOR ProductionOrder`.

Inventario es dueño de la creación. Compras y Producción suministran el origen y solicitan su
creación dentro de la transacción y del plan global de recursos; no ejecutan `tx.lot.create()`.
La creación operativa, sus movimientos y sus documentos se confirman o revierten juntos. A-1 no
implementa esa creación empresarial; las filas de lote creadas directamente para pruebas no son
datos operativos ni prueban la invariante de origen.

Se conserva el ADR 007: producto del lote coherente con movimiento, existencia por lote
derivada del ledger, asignación explícita y liberación según calidad.

## Consecuencias

- Cada migración habilita solamente orígenes cuyos documentos existen, con CHECK y FKs propios;
  la validación empieza en Compras y se amplía en C-2.
- La trazabilidad alcanza la recepción/proveedor o la OP de origen sin una referencia genérica.
- Un fallo de recepción o producción revierte también el lote, sin registros huérfanos. A-1
  reconoce que aún no puede validar filas preexistentes sin origen.
- La creación respeta el orden del ADR 012 y utiliza la numeración compartida en `America/Managua`.

Aceptado conceptualmente en la revisión local de PR0 del 2026-10-10; implementación pendiente.
Relaciones y pruebas en la [especificación de la ronda](../specs/2026-10-10-inventory-purchases-production-design.md).
