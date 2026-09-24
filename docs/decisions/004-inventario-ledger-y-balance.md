# ADR 004 — Ledger inmutable de inventario con balance materializado

- **Estado:** Aceptado
- **Fecha:** 2026-09-23
- **Etapa:** 2 — Database foundation
- **Nota:** revisado tras la auditoría de diseño del 2026-09-23 antes de su aceptación. Nunca
  llegó a estar aceptado en una versión anterior, de modo que se corrige en sitio en lugar de
  sustituirse por un ADR nuevo.

## Contexto

El inventario es el punto donde se encuentran los cuatro módulos del ERP. La regla número uno del
proyecto es que **el inventario nunca cambia en silencio**.

Tres formas razonables de representar la existencia actual:

1. Un campo `stock` en `Product`. Descartado: no soporta varios almacenes y destruye la
   trazabilidad, que es lo que el proyecto debe demostrar.
2. Existencia derivada, `stock = SUM(movimientos)` en cada consulta. Imposible de desincronizar,
   pero sin una fila que bloquear, impedir existencias negativas bajo concurrencia obliga a
   aislamiento serializable o a bloqueos más toscos.
3. Ledger inmutable **más** balance materializado por producto y almacén.

## Decisión

Se adopta la tercera opción. Dos conceptos distintos y complementarios:

- **`InventoryMovement`** es el libro mayor inmutable. Explica **por qué** cambió el inventario.
- **`StockBalance`** es la existencia actual por `(productId, warehouseId)`, con unicidad sobre
  ese par. Indica **cuánto** hay ahora.

La cantidad del movimiento se almacena **con signo**: positiva en entradas, negativa en salidas.
La invariante del sistema se enuncia en una línea:

```sql
StockBalance.quantity = SUM(InventoryMovement.quantity)
  para el mismo (productId, warehouseId)
```

Una restricción `CHECK` garantiza que el signo concuerde con el tipo, de modo que no pueda existir
una recepción negativa ni un despacho positivo.

### Protocolo transaccional obligatorio

```text
BEGIN
  1. validar la operación empresarial y los estados implicados
  2. obtener o crear la fila de StockBalance
  3. bloquear esa fila            SELECT ... FOR UPDATE
  4. validar la existencia general
  5. validar la existencia y el estado del lote, cuando aplique
  6. crear InventoryMovement
  7. actualizar StockBalance
  8. actualizar el documento empresarial
  9. crear AuditLog
COMMIT
```

Si algo falla, `ROLLBACK`: no queda ni movimiento, ni balance alterado, ni registro de auditoría
afirmando que la operación tuvo éxito.

### La creación de la primera fila también es una carrera

El paso 2 tiene su propia condición de carrera: dos operaciones simultáneas sobre un producto sin
balance previo intentarían insertar la misma fila. Se resuelve con
`INSERT ... ON CONFLICT (product_id, warehouse_id) DO NOTHING` seguido del bloqueo. **Nunca** con
«comprobar si existe y después insertar», que es precisamente la carrera que se quiere evitar.

### Orden estable de bloqueo

Una operación que toca varios productos —completar una producción consume varios componentes—
bloquea sus filas en orden **ascendente por `product_id` y, a igualdad, por `warehouse_id`**. Dos
operaciones concurrentes que compitan por los mismos productos los toman en la misma secuencia, de
modo que una espera a la otra en lugar de bloquearse mutuamente.

### La fila de balance es el mutex del producto

Bloquearla antes de validar cumple dos funciones: impide que dos operaciones lean la misma
existencia y ambas la consideren suficiente, y convierte esa fila en el punto de serialización de
**todos** los movimientos de ese producto en ese almacén.

De ahí se sigue algo importante para los lotes: la disponibilidad de un lote concreto se calcula
sumando sus movimientos **dentro del mismo bloqueo**, y el resultado es consistente sin necesidad
de una tabla `LotBalance`. Se evita duplicar el mecanismo, que es el error que convertiría dos
datos derivados en dos fuentes potenciales de desincronización.

El estado del lote se valida dentro de ese mismo bloqueo, para que una liberación o un rechazo
concurrente no puedan colarse entre la comprobación y el movimiento.

### Un solo escritor

Un único servicio de inventario crea movimientos y actualiza balances. Compras, Producción y
Ventas lo invocan; ninguno escribe `StockBalance` por su cuenta.

### Reconciliación

Debe poder comprobarse en cualquier momento que balance y ledger concuerdan. La consulta está en
[`database.md`](../database.md), sección 9, y forma parte de las pruebas de integridad. No se
implementa como tarea automática todavía.

## Consecuencias

- Consultar existencias es leer una fila, no agregar el historial completo.
- Validar disponibilidad y prevenir existencias negativas es seguro bajo concurrencia.
- El historial sobrevive aunque el balance se recalcule: `StockBalance` es reconstruible desde el
  ledger; el ledger no es reconstruible desde el balance.
- Los movimientos no tienen `updatedAt`: son inmutables. Una corrección es un movimiento
  compensatorio nuevo, nunca una edición. Un vínculo explícito al asiento original requerirá un
  campo adicional cuando exista un flujo formal de correcciones.
- **Riesgo principal:** un dato derivado puede desincronizarse si alguien escribe fuera del
  servicio de inventario. Se mitiga con el servicio único, los disparadores de inmutabilidad y la
  reconciliación en pruebas.
- Las restricciones `CHECK` y los disparadores no son expresables en `schema.prisma`; van como SQL
  dentro de la migración, versionado en el historial para que la base sombra lo reproduzca.

### Sobre las garantías de PostgreSQL

Una versión anterior de este ADR ofrecía retirar las restricciones `CHECK` y los disparadores si
Prisma daba problemas, dejando solo el servicio y las pruebas. **Esa salida queda descartada**:
rebajaría una garantía declarada crítica precisamente en el punto donde más importa.

Las garantías de base de datos se mantienen. La primera migración se aplicó desde cero en
PostgreSQL 16 temporal, una segunda ejecución de `migrate dev` no reportó drift y los rechazos
SQL se comprobaron. Falta repetir esta evidencia en PostgreSQL 18 del proyecto. Si alguna
garantía resultara imposible allí, la discusión se reabriría mediante un ADR nuevo.
