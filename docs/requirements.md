# Requisitos funcionales — EcoSoap ERP

## Sobre este catálogo

> **Catálogo preliminar derivado del diseño actual del proyecto. Pendiente de cotejo con la
> especificación académica oficial.**

El prompt maestro fija la **nomenclatura** de los requisitos (`RF-COM-*`, `RF-INV-*`, `RF-PRO-*`,
`RF-VEN-*`) y describe los flujos de negocio, pero no su redacción definitiva. Lo que sigue es el
catálogo derivado de esos flujos, para que exista trazabilidad desde el primer día:

```text
Documento → Requisito → Código → API → Prueba
```

> **Pendiente de cotejo.** Antes de la entrega, este catálogo debe contrastarse con el documento
> oficial de la asignatura. Si algún código o redacción difiere, manda el documento oficial y hay
> que actualizar aquí, no al revés.

Cada funcionalidad que se implemente debe declarar qué requisito satisface, tanto en el PR como en
la documentación de su endpoint.

## Estados de implementación

| Símbolo | Significado               |
| ------- | ------------------------- |
| ⬜      | No iniciado               |
| 🟨      | En curso                  |
| ✅      | Implementado y verificado |

## Transversales

| Código     | Requisito                                                                        | Estado |
| ---------- | -------------------------------------------------------------------------------- | ------ |
| RF-SYS-001 | El sistema debe ejecutarse en un entorno reproducible mediante Docker y pnpm     | ✅     |
| RF-SYS-002 | El sistema debe exponer documentación de su API mediante Swagger/OpenAPI         | ✅     |
| RF-SYS-003 | El sistema debe verificar su conectividad con la base de datos                   | ✅     |
| RF-AUT-001 | El sistema debe autenticar usuarios mediante usuario y contraseña, emitiendo JWT | ⬜     |
| RF-AUT-002 | Las contraseñas deben almacenarse con hashing seguro, nunca en texto plano       | ⬜     |
| RF-AUT-003 | El sistema debe restringir el acceso por rol (RBAC) verificándolo en el backend  | ⬜     |

## Compras

| Código     | Requisito                                                                         | Estado |
| ---------- | --------------------------------------------------------------------------------- | ------ |
| RF-COM-001 | Registrar y administrar proveedores                                               | ⬜     |
| RF-COM-002 | Crear órdenes de compra con su detalle de materias primas, cantidades y precios   | ⬜     |
| RF-COM-003 | Confirmar una orden de compra, cambiando su estado de `DRAFT` a `CONFIRMED`       | ⬜     |
| RF-COM-004 | Registrar la recepción de mercancía, total o parcial, de una orden confirmada     | ⬜     |
| RF-COM-005 | La recepción debe aumentar el inventario generando movimientos `PURCHASE_RECEIPT` | ⬜     |
| RF-COM-006 | Crear una orden de compra **no** debe modificar el inventario                     | ⬜     |

## Inventario

| Código     | Requisito                                                                             | Estado |
| ---------- | ------------------------------------------------------------------------------------- | ------ |
| RF-INV-001 | Registrar y administrar productos, distinguiendo materia prima de producto terminado  | ⬜     |
| RF-INV-002 | Consultar existencias actuales por producto y almacén                                 | ⬜     |
| RF-INV-003 | Registrar todo cambio de existencias como un movimiento de inventario tipificado      | ⬜     |
| RF-INV-004 | Consultar el historial de movimientos con su origen, fecha y responsable              | ⬜     |
| RF-INV-005 | Impedir que las existencias queden en negativo                                        | ⬜     |
| RF-INV-006 | Permitir ajustes manuales de inventario, registrados como `ADJUSTMENT` y justificados | ⬜     |

## Producción

| Código     | Requisito                                                                                              | Estado |
| ---------- | ------------------------------------------------------------------------------------------------------ | ------ |
| RF-PRO-001 | Definir la lista de materiales (BOM) de un producto manufacturado                                      | ⬜     |
| RF-PRO-002 | Calcular los materiales necesarios según la cantidad que se desee producir                             | ⬜     |
| RF-PRO-003 | Crear órdenes de producción con producto, cantidad y fecha planificada                                 | ⬜     |
| RF-PRO-004 | Verificar disponibilidad de materia prima antes de iniciar una orden                                   | ⬜     |
| RF-PRO-005 | Completar una orden consumiendo materia prima y generando producto terminado, de forma atómica         | ⬜     |
| RF-PRO-006 | Generar un lote identificable por cada producción completada                                           | ⬜     |
| RF-PRO-007 | Permitir reconstruir la trazabilidad de un lote: orden, materias primas consumidas, cantidades y fecha | ⬜     |
| RF-PRO-008 | Registrar inspecciones de control de calidad asociadas a un lote                                       | ⬜     |
| RF-PRO-009 | Rechazar una producción cuando la materia prima disponible sea insuficiente, sin alterar el inventario | ⬜     |

## Ventas

| Código     | Requisito                                                                      | Estado |
| ---------- | ------------------------------------------------------------------------------ | ------ |
| RF-VEN-001 | Registrar y administrar clientes                                               | ⬜     |
| RF-VEN-002 | Crear órdenes de venta con su detalle de productos, cantidades y precios       | ⬜     |
| RF-VEN-003 | Verificar existencia disponible antes de confirmar una orden de venta          | ⬜     |
| RF-VEN-004 | Registrar el despacho de una orden confirmada                                  | ⬜     |
| RF-VEN-005 | El despacho debe disminuir el inventario generando movimientos `SALE_DISPATCH` | ⬜     |
| RF-VEN-006 | Crear una orden de venta **no** debe modificar el inventario                   | ⬜     |

## Auditoría

| Código     | Requisito                                                                                 | Estado |
| ---------- | ----------------------------------------------------------------------------------------- | ------ |
| RF-AUD-001 | Toda operación relevante debe registrar qué ocurrió, quién, cuándo y sobre qué entidad    | ⬜     |
| RF-AUD-002 | La auditoría debe cubrir movimientos de inventario, compras, producción, ventas y ajustes | ⬜     |

## Reglas de negocio que atraviesan varios requisitos

1. El inventario nunca cambia sin dejar un movimiento que explique por qué.
2. Compras, Producción y Ventas usan el **mismo** mecanismo de movimientos; no hay tres lógicas.
3. Las operaciones que tocan varias entidades son transaccionales: si algo falla, rollback.
4. La validación definitiva siempre ocurre en el backend, aunque el frontend también la haga.
5. Los estados de negocio son enums, no texto libre.
