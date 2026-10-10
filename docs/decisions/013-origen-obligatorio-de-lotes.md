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

Todo lote operativo de esta ronda tendrá exactamente un origen empresarial con FK:

```text
PurchaseReceiptItem XOR ProductionOrder
```

Compras incorpora `purchaseReceiptItemId`, obligatorio para los lotes que habilita; C-2 amplía
el CHECK para admitir `productionOrderId` de forma exclusiva. Cada origen es único: un lote por
línea de recepción trazable y un lote de output por OP. La recepción se relaciona con el lote
desde esa FK, sin otro `PurchaseReceiptItem.lotId` que duplique la identidad del origen.

Inventario es dueño de la creación. Compras y Producción suministran el origen y solicitan su
creación dentro de la transacción y del plan global de recursos; no ejecutan `tx.lot.create()`.
A-1 no crea lotes operativos sin documentos de origen. La creación, sus movimientos y sus
documentos se confirman o revierten juntos. Preparar infraestructura en A-1 no permite persistir
lotes empresariales huérfanos.

Se conserva el ADR 007: producto del lote coherente con movimiento, existencia por lote
derivada del ledger, asignación explícita y liberación según calidad.

## Consecuencias

- Cada migración habilita solamente orígenes cuyos documentos existen, con CHECK y FKs propios.
- La trazabilidad alcanza la recepción/proveedor o la OP de origen sin una referencia genérica.
- Un fallo de recepción o producción revierte también el lote, sin registros huérfanos.
- La creación respeta el orden del ADR 012 y utiliza la numeración compartida en `America/Managua`.

Aceptado conceptualmente en la revisión local de PR0 del 2026-10-10; implementación pendiente.
Relaciones y pruebas en la [especificación de la ronda](../specs/2026-10-10-inventory-purchases-production-design.md).
