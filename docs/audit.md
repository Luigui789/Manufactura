# Auditoría y trazabilidad — EcoSoap ERP

> **Estado:** estrategia de Foundation verificada. La trazabilidad y auditoría de operaciones es
> `OFICIAL` por RNF-007 de la Entrega 1; la clasificación de sus controles concretos está en
> [`requirements.md`](requirements.md). Decisión en
> [ADR 005](decisions/005-estrategia-de-auditoria.md); modelo en [`database.md`](database.md).
> La cobertura de Compras, Producción y Ventas llega con sus módulos de negocio.

## 1. Tres capas, tres preguntas

Auditar no es tener una tabla. Conviven tres mecanismos que responden preguntas distintas, y
ninguno sustituye a los otros.

La Entrega requiere conservar usuario responsable, fecha/hora, tipo de operación y entidad
afectada, y reconstruir el flujo entre módulos. Por ello `AuditLog` append-only y los disparadores
contra modificación/borrado son `DERIVADO`; `requestId`, eventos como `LOGIN_FAILED`, actores
`USER`/`SYSTEM`/`ANONYMOUS` y snapshots anterior/nuevo son `PROPUESTO`. La sanitización de
snapshots es `DERIVADO` de RNF-002 si esos snapshots se conservan. Ninguna de esas mejoras se
presenta como exigencia académica literal.

| Capa                       | Mecanismo                   | Pregunta                                                      |
| -------------------------- | --------------------------- | ------------------------------------------------------------- |
| Auditoría del sistema      | `AuditLog`                  | ¿Quién hizo qué y qué cambió?                                 |
| Trazabilidad empresarial   | Documentos y sus números    | ¿Qué operación empresarial ocurrió?                           |
| Trazabilidad de inventario | `InventoryMovement` y `Lot` | ¿Qué cantidad entró o salió, de qué producto, almacén y lote? |

Una recepción de 40 kg de sosa se reconstruye por las tres vías:

```text
CAPA EMPRESARIAL          CAPA DE INVENTARIO            CAPA DE SISTEMA

Usuario Miguel            movimiento +40 kg             AuditLog
    ↓                     tipo PURCHASE_RECEIPT           actorType  = USER
OC-2026-000021            lote LOT-2026-000087            actorUserId= Miguel
    ↓                     almacén ALM-PRINCIPAL           action     = RECEIVE
REC-2026-000014           ocurrido 2026-09-23            entityType = PURCHASE_RECEIPT
    ↓                           ↑                         entityId   = <id REC-...>
línea de recepción ─────────────┘
```

## 2. Alcance de `requestId`

`AuditLog` e `InventoryMovement` llevan la columna `requestId`, de modo que **esos dos registros
se correlacionan directamente** con una sola condición.

Los documentos empresariales **no** la llevan: se alcanzan por sus claves foráneas y por
`entityId`. Decir que «todas las filas comparten `requestId`» sería falso y llevaría a escribir
consultas que no devuelven nada.

```text
requestId = 3f9a...c21

├── AuditLog            RECEIVE sobre PURCHASE_RECEIPT  → entityId apunta al documento
└── InventoryMovement   +40 kg                          → FK apunta a la línea de recepción
```

El identificador se genera al entrar la petición HTTP, se propaga mediante almacenamiento de
contexto asíncrono y viaja también en la respuesta, de modo que un error reportado por un usuario
pueda rastrearse hasta las filas exactas que se escribieron. Los procesos automáticos que se
añadan en el futuro necesitarán un identificador de correlación equivalente.

## 3. Qué se audita

### Ciclo de vida de los datos maestros

`CREATE`, `UPDATE`, `DELETE`, `ENABLE` y `DISABLE` sobre usuarios, roles, productos, almacenes,
proveedores y clientes.

`DELETE` figura en el vocabulario aunque el sistema practique borrado lógico, para los casos
excepcionales de borrado físico descritos en [`database.md`](database.md).

### Seguridad

`LOGIN`, `LOGIN_FAILED` y `LOGOUT`.

### Transiciones empresariales

| Operación                 | Acción            | Entidad              |
| ------------------------- | ----------------- | -------------------- |
| Confirmar orden de compra | `CONFIRM`         | `PURCHASE_ORDER`     |
| Recibir mercancía         | `RECEIVE`         | `PURCHASE_RECEIPT`   |
| Iniciar producción        | `START`           | `PRODUCTION_ORDER`   |
| Completar producción      | `COMPLETE`        | `PRODUCTION_ORDER`   |
| Confirmar venta           | `CONFIRM`         | `SALES_ORDER`        |
| Despachar                 | `DISPATCH`        | `DISPATCH`           |
| Cancelar un documento     | `CANCEL`          | la que corresponda   |
| Ajustar existencias       | `ADJUST_STOCK`    | `INVENTORY_MOVEMENT` |
| Aprobar calidad           | `QUALITY_APPROVE` | `QUALITY_INSPECTION` |
| Rechazar calidad          | `QUALITY_REJECT`  | `QUALITY_INSPECTION` |

Calidad tiene acciones propias en lugar de reutilizar `CONFIRM` y `CANCEL`, que son transiciones
de documentos. Reutilizarlas haría que el historial confundiera una liberación de lote con la
confirmación de una orden.

Registrar «completar una producción» como `UPDATE` genérico obligaría a leer los valores para
entender qué ocurrió. Una acción con nombre propio se entiende de un vistazo y se filtra con una
sola condición.

## 4. Modelo final de `AuditLog`

| Campo            | Tipo              | Nulo | Razón                                                           |
| ---------------- | ----------------- | ---- | --------------------------------------------------------------- |
| `id`             | `uuid`            | No   | Clave primaria                                                  |
| `actorType`      | `ActorType`       | No   | `USER`, `SYSTEM` o `ANONYMOUS`                                  |
| `actorUserId`    | `uuid`            | Sí   | Presente solo con `actorType = USER`                            |
| `action`         | `AuditAction`     | No   | Qué ocurrió, en vocabulario empresarial                         |
| `entityType`     | `AuditEntityType` | Sí   | Nulo solo en `LOGIN_FAILED` sin usuario conocido                |
| `entityId`       | `uuid`            | Sí   | Nulo solo en `LOGIN_FAILED` sin usuario conocido                |
| `previousValues` | `jsonb`           | Sí   | Solo campos permitidos que cambiaron; nulo en creaciones        |
| `newValues`      | `jsonb`           | Sí   | Solo campos permitidos que cambiaron; nulo en borrados          |
| `requestId`      | `string`          | Sí   | Correlación de la petición                                      |
| `ipAddress`      | `string`          | Sí   | Justificado por los eventos de seguridad, no por los de negocio |
| `createdAt`      | `timestamptz`     | No   | Cuándo                                                          |

**No existe `updatedAt`**, porque la tabla no se modifica.

**No se incluyen** `userAgent` ni un campo `metadata` genérico: ninguno tiene caso de uso real en
este ERP, y un campo sin uso solo sirve para que alguien meta ahí lo que no sabe dónde poner.

### El actor no identificado

Un intento de autenticación fallido no acredita la identidad de quien escribió el correo, aunque
ese correo pertenezca a un usuario existente. Por eso `LOGIN_FAILED` siempre tiene actor
`ANONYMOUS`. El usuario existente, si lo hay, es la **entidad objetivo**, nunca el actor:

| Situación                              | `actorType` | `actorUserId` | `entityType` / `entityId` |
| -------------------------------------- | ----------- | ------------- | ------------------------- |
| Operación normal de un usuario         | `USER`      | presente      | presentes                 |
| `LOGIN_FAILED` con usuario existente   | `ANONYMOUS` | nulo          | `USER` + su id            |
| `LOGIN_FAILED` con usuario desconocido | `ANONYMOUS` | nulo          | nulos                     |
| `LOGIN` exitoso                        | `USER`      | presente      | `USER` + el mismo id      |
| Proceso automático                     | `SYSTEM`    | nulo          | presentes                 |

`actor` identifica al ejecutor autenticado o su naturaleza real; `entity` identifica el recurso
afectado. Jamás se infiere la identidad del actor a partir de un identificador proporcionado en un
intento fallido.

No se crea un usuario ficticio en la base para representar lo anónimo: sería un registro real que
podría autenticarse, aparecer en listados y recibir un rol.

### Restricciones que lo garantizan

```sql
-- La entidad va entera o no va
CHECK ((entity_type IS NULL) = (entity_id IS NULL))

-- Solo un fallo de autenticación puede carecer de entidad
CHECK (action = 'LOGIN_FAILED' OR entity_type IS NOT NULL)

-- El actor humano tiene usuario; el anónimo y el sistema, no
CHECK (
  (actor_type = 'USER'   AND actor_user_id IS NOT NULL) OR
  (actor_type IN ('SYSTEM','ANONYMOUS') AND actor_user_id IS NULL)
)

-- Todo fallo de login es anónimo; un login exitoso se refiere al usuario autenticado.
-- La migración usa condiciones explícitas para que NULL no deje pasar casos inválidos.
CHECK (
  (action = 'LOGIN_FAILED' AND actor_type = 'ANONYMOUS'
    AND (entity_type IS NULL OR entity_type = 'USER'))
  OR (action = 'LOGIN' AND actor_type = 'USER'
    AND entity_type = 'USER' AND entity_id = actor_user_id)
  OR (action NOT IN ('LOGIN_FAILED', 'LOGIN') AND actor_type IN ('USER', 'SYSTEM'))
)
```

Para **toda operación empresarial**, tipo e identificador de entidad son obligatorios. La
excepción está acotada por la restricción a un único caso.

### Índices

```text
audit_logs (entity_type, entity_id, created_at)   historial de un documento
audit_logs (actor_user_id, created_at)            actividad de una persona
audit_logs (request_id)                           correlación de una operación
audit_logs (created_at)                           barrido cronológico
```

Se evaluará `(action, created_at)` cuando exista una consulta real por acción.

### Referencia lógica, no clave foránea

`entityType` + `entityId` es una referencia **deliberadamente lógica**: la auditoría debe
sobrevivir aunque el registro original desaparezca. Una clave foránea con `Restrict` impediría
borrar, y con `Cascade` destruiría justamente el historial que se quiere conservar.

La contrapartida es que el backend debe validar tipo e identificador al escribir. Esto es lo
contrario del origen de `InventoryMovement`, donde la clave foránea sí es esencial porque el
documento origen debe existir obligatoriamente.

## 5. Snapshots: lista permitida, no lista prohibida

`previousValues` y `newValues` contienen exclusivamente los campos que cambiaron:

```json
// previousValues          // newValues
{ "status": "DRAFT" }      { "status": "CONFIRMED" }
```

La selección se hace con una **lista permitida de campos auditables por entidad**, no volcando el
objeto y eliminando después las claves peligrosas. La diferencia importa: con lista prohibida,
cualquier campo nuevo que alguien añada a una entidad queda auditado por defecto, y basta que se
llame de una forma no prevista para que un secreto acabe en la tabla. Con lista permitida, lo que
no se declara explícitamente no se audita.

Ejemplo para `User`: la lista permitida es `email`, `fullName`, `roleId`, `isActive`.
`passwordHash` **no está en la lista**, de modo que es imposible que aparezca, incluso cuando es
justamente el campo que cambió. En ese caso se registra la acción indicando que la contraseña fue
modificada, sin su valor.

### Nunca se almacena

```text
password · passwordHash · JWT · refresh tokens
secrets · claves de API · DATABASE_URL
credenciales incrustadas en objetos o en mensajes de error
```

No se enmascaran con asteriscos: un valor enmascarado sigue revelando su longitud y su existencia.
Simplemente no se incluyen.

## 6. Auditoría y transacciones

El registro de una operación empresarial participa de la **misma transacción** que la operación:

```text
BEGIN
  validar la operación
  obtener o crear StockBalance
  bloquear la fila
  validar existencia general y de lote
  crear InventoryMovement
  actualizar StockBalance
  actualizar el documento
  crear AuditLog
COMMIT
```

Ante un `ROLLBACK` no queda nada: ni movimiento, ni balance alterado, ni un registro afirmando que
la operación tuvo éxito. Una auditoría que miente es peor que no tener auditoría, porque se confía
en ella.

**Excepción deliberada:** `LOGIN_FAILED` se escribe fuera de la transacción del intento, porque
debe persistir precisamente cuando la operación fracasa.

## 7. Inmutabilidad

Garantizada en dos niveles:

1. **La API no expone modificación ni borrado.** No existen `PATCH /audit/:id` ni
   `DELETE /audit/:id`.
2. **La base de datos lo impide.** Un disparador sobre `audit_logs` rechaza `UPDATE` y `DELETE`.
   La cuenta de aplicación tampoco debe tener permiso de `TRUNCATE`.

`inventory_movements` lleva la misma protección: una corrección se registra con un movimiento
compensatorio nuevo, nunca editando el asiento. Un vínculo explícito con el original queda para
el futuro flujo de correcciones.

> **Probado en PostgreSQL 16 temporal y 18.6 del proyecto:** la migración y su SQL personalizado se
> aplicaron desde cero; una segunda ejecución de `migrate dev` no reportó drift; `UPDATE` y
> `DELETE` de auditoría y movimientos fueron rechazados.

**Límite honesto:** el disparador no protege frente a un administrador de base con privilegios
para alterarlo o eliminarlo. Ninguna garantía de la aplicación lo hace.

## 8. Consulta

Prevista bajo `GET /api/audit` cuando se implemente:

| Filtro                          | Uso                                      |
| ------------------------------- | ---------------------------------------- |
| `entityType` + `entityId`       | Historial completo de un documento       |
| `actorUserId` + rango de fechas | Qué hizo una persona                     |
| `action`                        | Todas las recepciones, todos los ajustes |
| `requestId`                     | Auditoría y movimientos de una operación |
| Rango de fechas                 | Barrido cronológico, siempre paginado    |

Los resultados se paginan desde el backend. La tabla crece de forma monótona y nunca se devuelve
completa.

## 9. Acceso

| Rol                                             | Permiso                       |
| ----------------------------------------------- | ----------------------------- |
| `ADMIN`                                         | Consultar toda la auditoría   |
| `COMPRAS`, `INVENTARIO`, `PRODUCCION`, `VENTAS` | Sin acceso                    |
| Cualquiera                                      | **Nunca** modificar ni borrar |

Es la política `P-AUD-004`: RNF-002 exige control por roles, pero la Entrega no ordena que solo
`ADMIN` pueda consultar toda la auditoría. Se evaluará más adelante si cada rol debe consultar el
historial de su propio módulo; ampliar un permiso después es más sencillo que retirarlo. El control
se verifica en el backend: ocultar la opción en el frontend no es seguridad.

## 10. Pruebas exigidas

```text
Dado   un documento en estado DRAFT
Cuando el usuario X lo confirma
Entonces su estado es CONFIRMED
Y      existe un AuditLog con actorType USER, actor X, acción CONFIRM,
       previousValues {status: DRAFT} y newValues {status: CONFIRMED}
```

```text
Dado   inventario insuficiente
Cuando se intenta completar una producción
Entonces la operación falla
Y      el inventario no cambia
Y      no se crea ningún lote
Y      la orden conserva su estado anterior
Y      NO queda ningún AuditLog afirmando que se completó
```

```text
Dado   un intento de acceso con un correo que no existe
Cuando se registra el fallo
Entonces existe un AuditLog con actorType ANONYMOUS,
       actorUserId nulo, entityType y entityId nulos, acción LOGIN_FAILED
```

```text
Dado   un intento de acceso fallido con el correo de un usuario existente
Cuando se registra el fallo
Entonces actorType es ANONYMOUS y actorUserId es nulo
Y      entityType es USER y entityId es el id de la cuenta objetivo
```

```text
Dado   un login exitoso
Cuando se registra el acceso
Entonces actorType es USER y actorUserId es el usuario autenticado
Y      entityType es USER y entityId es ese mismo usuario
```

```text
Dado   un registro de auditoría existente
Cuando se intenta modificarlo o borrarlo directamente en la base de datos
Entonces la operación es rechazada por el disparador
```

```text
Dado   un cambio de contraseña de un usuario
Cuando se audita la operación
Entonces ningún snapshot contiene el hash de la contraseña
```

```text
Dado   un lote en estado QUARANTINED
Cuando se intenta despacharlo o consumirlo en producción
Entonces la operación es rechazada
Y      el inventario no cambia
```
