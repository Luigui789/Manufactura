# Requisitos funcionales — EcoSoap ERP

## Sobre este catálogo

El prompt maestro fija la **nomenclatura** de los requisitos (`RF-COM-*`, `RF-INV-*`, `RF-PRO-*`,
`RF-VEN-*`) y describe los flujos de negocio, pero no su redacción definitiva. Lo que sigue es el
catálogo derivado de esos flujos, para que exista trazabilidad desde el primer día:

```text
Documento → Requisito → Código → API → Prueba
```

> **Pendiente de cotejo.** Antes de la entrega, este catálogo debe contrastarse con el documento
> oficial de la asignatura. Si algún código o redacción difiere, se actualiza aquí, no al revés.

Cada funcionalidad que se implemente debe declarar qué requisito satisface, tanto en el pull
request como en la documentación de su endpoint.

## Estados

| Estado        | Significado                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `Pending`     | No iniciado                                                                                         |
| `In Progress` | Hay código escrito, pero el requisito no está completo                                              |
| `Implemented` | El código está completo y compila                                                                   |
| `Verified`    | Existe **evidencia**: prueba automatizada, respuesta de API validada o flujo de interfaz comprobado |

`Implemented` y `Verified` son cosas distintas y no se usa `Done` para ninguna de las dos.
Implementar es escribir el código; verificar es haber ejecutado la comprobación y visto el
resultado.

## Transversales del sistema

| Requisito  | Descripción                                       | Estado     | Backend              | Frontend          | Prueba               |
| ---------- | ------------------------------------------------- | ---------- | -------------------- | ----------------- | -------------------- |
| RF-SYS-001 | Entorno reproducible mediante Docker y pnpm       | `Verified` | `docker-compose.yml` | —                 | Arranque ejecutado   |
| RF-SYS-002 | Documentación de la API mediante Swagger/OpenAPI  | `Verified` | `main.ts`            | —                 | `GET /api/docs` 200  |
| RF-SYS-003 | Verificación de conectividad con la base de datos | `Verified` | `HealthModule`       | Pantalla temporal | `health.e2e-spec.ts` |

## Autenticación y autorización

| Requisito  | Descripción                                                      | Estado    | Backend | Frontend | Prueba |
| ---------- | ---------------------------------------------------------------- | --------- | ------- | -------- | ------ |
| RF-AUT-001 | Autenticar usuarios con credenciales, emitiendo JWT              | `Pending` | —       | —        | —      |
| RF-AUT-002 | Almacenar contraseñas con hashing seguro, nunca en texto plano   | `Pending` | —       | —        | —      |
| RF-AUT-003 | Restringir el acceso por rol (RBAC), verificándolo en el backend | `Pending` | —       | —        | —      |

## Compras

| Requisito  | Descripción                                                           | Estado    | Backend | Frontend | Prueba |
| ---------- | --------------------------------------------------------------------- | --------- | ------- | -------- | ------ |
| RF-COM-001 | Registrar y administrar proveedores                                   | `Pending` | —       | —        | —      |
| RF-COM-002 | Crear órdenes de compra con detalle, cantidades y precios             | `Pending` | —       | —        | —      |
| RF-COM-003 | Confirmar una orden de compra (`DRAFT` → `CONFIRMED`)                 | `Pending` | —       | —        | —      |
| RF-COM-004 | Registrar recepciones, totales o parciales, de una orden confirmada   | `Pending` | —       | —        | —      |
| RF-COM-005 | La recepción aumenta el inventario con movimientos `PURCHASE_RECEIPT` | `Pending` | —       | —        | —      |
| RF-COM-006 | Crear una orden de compra **no** modifica el inventario               | `Pending` | —       | —        | —      |

## Inventario

| Requisito  | Descripción                                                             | Estado        | Backend                     | Frontend | Prueba                   |
| ---------- | ----------------------------------------------------------------------- | ------------- | --------------------------- | -------- | ------------------------ |
| RF-INV-001 | Registrar productos distinguiendo materia prima, intermedio y terminado | `Pending`     | —                           | —        | —                        |
| RF-INV-002 | Consultar existencias actuales por producto y almacén                   | `Pending`     | —                           | —        | —                        |
| RF-INV-003 | Registrar todo cambio de existencias como movimiento tipificado         | `In Progress` | Ajustes Foundation          | —        | `foundation.e2e-spec.ts` |
| RF-INV-004 | Consultar el historial de movimientos con origen, fecha y responsable   | `Pending`     | —                           | —        | —                        |
| RF-INV-005 | Impedir que las existencias queden en negativo                          | `In Progress` | Ajustes Foundation          | —        | `foundation.e2e-spec.ts` |
| RF-INV-006 | Permitir ajustes manuales con motivo tipificado obligatorio (`reason`)  | `In Progress` | Ajustes Foundation, sin API | —        | `foundation.e2e-spec.ts` |

## Producción

| Requisito  | Descripción                                                                       | Estado    | Backend | Frontend | Prueba |
| ---------- | --------------------------------------------------------------------------------- | --------- | ------- | -------- | ------ |
| RF-PRO-001 | Definir la lista de materiales (BOM) de un producto manufacturado                 | `Pending` | —       | —        | —      |
| RF-PRO-002 | Calcular los materiales necesarios según la cantidad a producir                   | `Pending` | —       | —        | —      |
| RF-PRO-003 | Crear órdenes de producción con producto, cantidad y fecha planificada            | `Pending` | —       | —        | —      |
| RF-PRO-004 | Verificar disponibilidad de materia prima antes de iniciar una orden              | `Pending` | —       | —        | —      |
| RF-PRO-005 | Completar una orden consumiendo materia prima y generando terminado, atómicamente | `Pending` | —       | —        | —      |
| RF-PRO-006 | Generar un lote identificable por cada producción completada                      | `Pending` | —       | —        | —      |
| RF-PRO-007 | Reconstruir la trazabilidad de un lote hasta los lotes de materia prima usados    | `Pending` | —       | —        | —      |
| RF-PRO-008 | Registrar inspecciones de control de calidad asociadas a un lote                  | `Pending` | —       | —        | —      |
| RF-PRO-009 | Rechazar la producción con materia prima insuficiente, sin alterar el inventario  | `Pending` | —       | —        | —      |

## Ventas

| Requisito  | Descripción                                                             | Estado    | Backend | Frontend | Prueba |
| ---------- | ----------------------------------------------------------------------- | --------- | ------- | -------- | ------ |
| RF-VEN-001 | Registrar y administrar clientes                                        | `Pending` | —       | —        | —      |
| RF-VEN-002 | Crear órdenes de venta con detalle, cantidades y precios                | `Pending` | —       | —        | —      |
| RF-VEN-003 | Comprobar existencia de forma **informativa** al confirmar (no reserva) | `Pending` | —       | —        | —      |
| RF-VEN-004 | Registrar despachos, totales o parciales, de una orden confirmada       | `Pending` | —       | —        | —      |
| RF-VEN-005 | El despacho disminuye el inventario con movimientos `SALE_DISPATCH`     | `Pending` | —       | —        | —      |
| RF-VEN-006 | Crear una orden de venta **no** modifica el inventario                  | `Pending` | —       | —        | —      |

## Auditoría

| Requisito  | Descripción                                                               | Estado        | Backend               | Frontend | Prueba                   |
| ---------- | ------------------------------------------------------------------------- | ------------- | --------------------- | -------- | ------------------------ |
| RF-AUD-001 | Registrar qué ocurrió, quién, cuándo y sobre qué entidad                  | `In Progress` | Ajustes Foundation    | —        | `foundation.e2e-spec.ts` |
| RF-AUD-002 | Cubrir movimientos de inventario, compras, producción, ventas y ajustes   | `Pending`     | —                     | —        | —                        |
| RF-AUD-003 | La auditoría es append-only: no puede modificarse ni borrarse             | `In Progress` | Disparador Foundation | —        | `foundation.e2e-spec.ts` |
| RF-AUD-004 | Nunca registrar contraseñas, tokens ni secretos, tampoco en los snapshots | `Pending`     | —                     | —        | —                        |
| RF-AUD-005 | Correlacionar con `requestId` todo lo ocurrido en una misma operación     | `In Progress` | Ajustes Foundation    | —        | `foundation.e2e-spec.ts` |
| RF-AUD-006 | Restringir la consulta de auditoría al rol `ADMIN`                        | `Pending`     | —                     | —        | —                        |

## Requisitos propuestos por el equipo

> **No oficiales.** No constan en el documento académico disponible. Se registran aquí para que el
> diseño no los introduzca de forma implícita, y quedan pendientes de cotejo con la Entrega 1. Si
> el documento oficial no los recoge, la decisión es del equipo: mantenerlos como alcance propio o
> retirarlos.

| Requisito  | Descripción                                                                            | Estado    | Origen                                                    |
| ---------- | -------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| RF-PRO-010 | Un lote en cuarentena o rechazado no puede despacharse **ni consumirse en producción** | `Pending` | [ADR 007](decisions/007-trazabilidad-de-lotes.md)         |
| RF-PRO-011 | Una BOM usada por alguna orden no puede modificarse; las correcciones crean versión    | `Pending` | Auditoría de diseño 2026-09-23                            |
| RF-INV-007 | Prohibir el cambio de `isLotTracked` con movimientos o existencia previos              | `Pending` | [ADR 007](decisions/007-trazabilidad-de-lotes.md)         |
| RF-AUD-007 | Los números de documento publicados o cancelados nunca se reciclan                     | `Pending` | [ADR 006](decisions/006-estrategia-de-identificadores.md) |

La razón de `RF-PRO-010` merece explicitarse: bloquear solo el despacho protegería al cliente pero
no al proceso. Fabricar con materia prima rechazada contamina un lote de producto terminado que
después habría que retirar, de modo que el daño se multiplica aguas abajo.

## Requisitos no funcionales

**No disponibles.** No se ha aportado un catálogo formal de RNF ni el documento académico de la
Entrega 1. Por tanto **no puede certificarse la conformidad** con requisitos oficiales, ni
funcionales ni no funcionales.

Cuando se aporte el documento, este catálogo debe cotejarse entero y los RNF verificables
incorporarse aquí. Hasta entonces, todo lo que figura en este archivo es una derivación del
prompt maestro hecha por el equipo, no una transcripción de requisitos oficiales.

## Reglas de negocio que atraviesan varios requisitos

1. El inventario nunca cambia sin dejar un movimiento que explique por qué.
2. Compras, Producción y Ventas usan el **mismo** servicio de inventario; no hay tres lógicas.
3. Las operaciones que tocan varias entidades son transaccionales: si algo falla, rollback, y no
   queda un registro de auditoría afirmando que la operación tuvo éxito.
4. La validación definitiva siempre ocurre en el backend, aunque el frontend también la haga.
5. Los estados de negocio son enums, no texto libre.
6. Los datos maestros referenciados por transacciones históricas se desactivan, no se borran.
