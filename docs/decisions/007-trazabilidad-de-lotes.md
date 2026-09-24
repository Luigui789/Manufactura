# ADR 007 — Lotes trazables con origen obligatorio y liberación por calidad

- **Estado:** Aceptado
- **Fecha:** 2026-09-23
- **Etapa:** 2 — Database foundation
- **Nota:** revisado tras la auditoría de diseño del 2026-09-23 antes de su aceptación.

## Contexto

EcoSoap fabrica jabón a partir de aceite de cocina usado. Ante una incidencia de calidad, la
empresa debe poder responder de qué entrega de aceite salió un lote concreto de jabón y quién se
lo suministró.

Limitar los lotes al producto terminado permitiría saber qué materias primas se consumieron, pero
no **de qué entrega concreta** procedían: la cadena se rompería en el eslabón más interesante.

## Decisión

### Un lote pertenece a un producto

`Lot` se relaciona con `Product`, sea materia prima, intermedio o terminado. No hay entidades
distintas para lotes de entrada y de salida: es el mismo concepto en distintos puntos del proceso.

```text
Proveedor → Recepción → Lote de aceite usado → Producción
          → Lote de aceite filtrado → Producción → Lote de jabón terminado
```

Aceite usado → aceite filtrado → jabón terminado se modela como **dos órdenes de producción**,
cada una con su BOM y sus movimientos. No hace falta una entidad de ruta ni de operaciones.

### La trazabilidad es opcional por producto

`Product.isLotTracked` decide si los movimientos de ese producto exigen lote. Para EcoSoap se
activa al menos en el aceite usado recibido, el aceite filtrado y el jabón terminado. La sosa, la
esencia y los consumibles pueden empezar sin trazabilidad y activarla después.

### El producto del lote y del movimiento deben coincidir

`InventoryMovement.productId` debe ser igual a `Lot.productId`. Esto **no se deja a la validación
de backend**: se garantiza con una **clave foránea compuesta**, cuya viabilidad en Prisma 7 se
verificó antes de adoptarla.

```prisma
model Lot {
  @@unique([id, productId])
}

model InventoryMovement {
  lot Lot? @relation(fields: [lotId, productId], references: [id, productId])
}
```

PostgreSQL rechaza así cualquier movimiento cuyo lote pertenezca a otro producto. La misma técnica
se aplicará entre línea recibida y línea ordenada, y entre línea despachada y línea de venta.

### Cambiar `isLotTracked` está prohibido con historial

Modificar la bandera cuando el producto ya tiene movimientos o existencia distinta de cero queda
**prohibido**. Activarla dejaría existencias previas sin lote atribuible; desactivarla rompería
cadenas de trazabilidad ya construidas.

El cambio exige un procedimiento explícito, documentado y auditado: llevar la existencia a cero
con ajustes justificados, cambiar la bandera y recargar el inventario con lotes. El backend
rechaza el cambio directo.

### Todo lote operativo tiene un origen empresarial

| Tipo de lote           | Origen                | Migración |
| ---------------------- | --------------------- | --------- |
| Materia prima          | `PurchaseReceiptItem` | 2         |
| Intermedio y terminado | `ProductionOrder`     | 3         |

Desde la migración 2, un `CHECK` de arco exclusivo exige exactamente un origen por lote. **No
deben existir lotes trazables operativos sin origen identificable.**

Consecuencia directa: **durante la fundación no debe crearse ningún lote operativo**, porque
todavía no existe ningún documento que pueda originarlo. Los únicos movimientos de la fundación
son ajustes, y solo deben aplicarse a productos sin trazabilidad. La carga inicial de inventario
con lotes espera a que exista Compras.

### Liberación por calidad

> **Requisito propuesto, no oficial.** No consta en el documento académico disponible. Registrado
> como `RF-PRO-010`, pendiente de cotejo con la Entrega 1.

```text
Lote creado
  requiresQualityInspection = false  →  RELEASED
  requiresQualityInspection = true   →  QUARANTINED  →  inspección  →  RELEASED | REJECTED
```

`LotStatus` es `QUARANTINED`, `RELEASED` o `REJECTED`.

| Estado        | Despacho  | Consumo en producción | Ajuste de salida |
| ------------- | --------- | --------------------- | ---------------- |
| `QUARANTINED` | Bloqueado | Bloqueado             | Permitido        |
| `RELEASED`    | Permitido | Permitido             | Permitido        |
| `REJECTED`    | Bloqueado | Bloqueado             | Permitido        |

**El consumo se bloquea igual que el despacho.** Fabricar jabón con aceite rechazado contamina un
lote de producto terminado que después habría que retirar del mercado. Bloquear solo el despacho
protege al cliente pero no al proceso, que es donde el daño se multiplica.

El ajuste de salida permanece permitido en todos los estados: es la vía para dar de baja material
rechazado.

Un lote puede tener varias inspecciones si se permite reinspección. **El estado vigente es
`Lot.status`**, no el resultado de la última inspección: la inspección propone y el servicio de
calidad aplica el cambio dentro de una transacción, de modo que no haya dos fuentes de verdad. El
cambio de estado se valida dentro del mismo bloqueo que usa el inventario, para que una liberación
concurrente no se cuele entre la comprobación y el despacho.

### Sin asignación automática

Queda **fuera de alcance**: FIFO, FEFO, algoritmos de asignación, picking avanzado y reservas.
Cuando una producción o un despacho consuman material trazable, el lote se **selecciona
explícitamente**. La asignación automática podrá añadirse después como capa superior sin tocar el
modelo: seguirá eligiendo un `lotId` y creando el mismo movimiento.

### La existencia por lote se deriva del ledger

No hay tabla de balance por lote. La disponibilidad se calcula sumando los movimientos del lote
dentro del bloqueo de `StockBalance` descrito en el [ADR 004](004-inventario-ledger-y-balance.md).

## Consecuencias

- «¿De qué aceite salió este jabón?» se responde recorriendo: lote de jabón → orden de producción
  → movimientos de consumo → lotes de entrada → recepción → proveedor.
- Registrar lotes exige disciplina operativa: quien recibe debe identificar el lote y quien
  produce debe indicar de cuál consume. Es trabajo real que el sistema no puede adivinar, y es la
  razón de que la trazabilidad sea opcional por producto.
- Recibir sin asignar lote a un producto trazable rompe la cadena; el backend lo impide.
- Consultar la existencia de un lote es una agregación sobre sus movimientos. Un lote acumula
  pocas decenas de movimientos en su vida, de modo que con el índice `(lot_id, warehouse_id)` el
  coste es despreciable.
- La coherencia entre `isLotTracked` y la presencia de `lotId`, y el bloqueo por estado del lote,
  no son expresables en un `CHECK` —no puede consultar otra tabla— y viven en el servicio con
  prueba propia.
- Al no haber asignación automática, la interfaz debe mostrar los lotes disponibles y liberados
  con su existencia calculada para que el usuario elija. Es requisito de pantalla, no de modelo.
