# ADR 011 — Inventario como escritor único de movimientos y existencias

- **Estado:** Aceptado
- **Fecha:** 2026-10-10
- **Etapa:** Siguiente ronda — Inventario, Compras y Producción
- **Relación:** detalla el escritor único del ADR 004; no lo sustituye.

## Contexto

Foundation ya contiene ledger, balance y un protocolo de ajustes que abre su propia transacción.
Recibir una compra o completar una producción exige coordinar documentos y varias líneas de
inventario dentro de una única transacción. Duplicar las reglas por dominio rompería la
reconciliación y el control de concurrencia.

## Decisión

Inventario es el único escritor de `InventoryMovement` y `StockBalance` y controla las reglas
de saldo y lotes aplicables a movimientos. Compras, Producción y posteriormente Ventas no
escriben directamente esas tablas: usarán el contrato interno equivalente a
`InventoryService.applyMovements(tx, command)`.

El contrato recibe la transacción del caso de uso llamador y todas las líneas de la operación.
Inventario no abre otra transacción ni hace commit o rollback independientes; propaga los errores
al llamador, que controla la confirmación o reversión del conjunto. No registra auditoría
empresarial. El llamador actualiza sus documentos y usa `AuditService.record(tx, event)` dentro
de la misma transacción. El caso de uso de ajustes
también sigue este esquema, preservando el comportamiento ya probado de Foundation.

Los lotes operativos se crean mediante Inventario con origen empresarial verificable, según
el ADR 013. La consulta de disponibilidad consumible también pertenece a Inventario; Producción
no reconstruye una lógica distinta para lotes liberados.

## Consecuencias

- Los dominios dependen de la interfaz exportada por Inventario; Inventario no importa sus
  servicios, evitando dependencias circulares.
- Una operación fallida revierte documentos, lotes, movimientos, saldos y auditoría juntos.
- A-1 conserva los tipos de movimiento permitidos por la migración instalada. Las extensiones
  de dominio llegan con su integridad referencial, no con orígenes genéricos sin FK.
- Las pruebas verifican reconciliación, concurrencia y que los otros dominios escriban stock
  mediante el servicio común.

Aceptado conceptualmente en la revisión local de PR0 del 2026-10-10; implementación pendiente.
Alcance y contrato en la [especificación de la ronda](../specs/2026-10-10-inventory-purchases-production-design.md).
