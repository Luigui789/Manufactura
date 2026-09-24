# ADR 005 — Tres capas de trazabilidad y `AuditLog` append-only

- **Estado:** Aceptado
- **Fecha:** 2026-09-23
- **Etapa:** 2 — Database foundation
- **Nota:** revisado tras la auditoría de diseño del 2026-09-23 antes de su aceptación.

## Contexto

La auditoría es un requisito central del proyecto, no un añadido final. El sistema debe poder
explicar qué ocurrió, quién lo hizo, cuándo, sobre qué entidad, qué cambió y qué proceso
empresarial lo provocó.

Un error frecuente es creer que auditar equivale a tener una tabla `AuditLog`. En un ERP de
manufactura hay tres preguntas distintas que ninguna tabla responde sola.

## Decisión

### Tres mecanismos complementarios

| Capa                       | Mecanismo                   | Pregunta                                                      |
| -------------------------- | --------------------------- | ------------------------------------------------------------- |
| Auditoría del sistema      | `AuditLog`                  | ¿Quién hizo qué y qué cambió?                                 |
| Trazabilidad empresarial   | Documentos y sus números    | ¿Qué operación empresarial ocurrió?                           |
| Trazabilidad de inventario | `InventoryMovement` y `Lot` | ¿Qué cantidad entró o salió, de qué producto, almacén y lote? |

Ninguno sustituye a los otros y no deben mezclarse.

### Acciones con nombre empresarial

Las acciones usan un vocabulario controlado que refleja lo ocurrido en la empresa, no la operación
técnica. Completar una producción es `COMPLETE`, no `UPDATE`.

Aprobar y rechazar calidad tienen acciones propias, `QUALITY_APPROVE` y `QUALITY_REJECT`, en lugar
de reutilizar `CONFIRM` y `CANCEL`, que son transiciones de documentos. Reutilizarlas haría que el
historial confundiera la liberación de un lote con la confirmación de una orden.

### El actor puede no estar identificado

`ActorType` admite `USER`, `SYSTEM` y `ANONYMOUS`. Un intento fallido no autentica a quien escribió
el correo, incluso cuando la cuenta indicada existe. En ese caso el usuario es la entidad objetivo,
no el actor.

| Situación                              | `actorType` | `actorUserId` | Entidad        |
| -------------------------------------- | ----------- | ------------- | -------------- |
| Operación normal                       | `USER`      | presente      | presente       |
| `LOGIN_FAILED` con usuario existente   | `ANONYMOUS` | nulo          | `USER` + su id |
| `LOGIN_FAILED` con usuario desconocido | `ANONYMOUS` | nulo          | nula           |
| `LOGIN` exitoso                        | `USER`      | presente      | `USER` + el mismo id |
| Proceso automático                     | `SYSTEM`    | nulo          | presente       |

El actor es la identidad autenticada o la naturaleza real del ejecutor. La entidad es el recurso
afectado. Nunca se deduce el actor del identificador introducido en un intento fallido.

No se crea un usuario ficticio en la base para representar lo anónimo: sería un registro real que
podría autenticarse, aparecer en listados y recibir un rol.

### `entityType` y `entityId` son opcionales solo para autenticación fallida

Para **toda operación empresarial** son obligatorios. La excepción queda acotada por restricciones
en la base:

```sql
CHECK ((entity_type IS NULL) = (entity_id IS NULL))
CHECK (action = 'LOGIN_FAILED' OR entity_type IS NOT NULL)
CHECK (
  (actor_type = 'USER' AND actor_user_id IS NOT NULL) OR
  (actor_type IN ('SYSTEM','ANONYMOUS') AND actor_user_id IS NULL)
)
CHECK (
  (action = 'LOGIN_FAILED' AND actor_type = 'ANONYMOUS'
    AND (entity_type IS NULL OR entity_type = 'USER'))
  OR (action = 'LOGIN' AND actor_type = 'USER'
    AND entity_type = 'USER' AND entity_id = actor_user_id)
  OR (action NOT IN ('LOGIN_FAILED', 'LOGIN') AND actor_type IN ('USER', 'SYSTEM'))
)
```

La referencia a la entidad es **lógica y sin clave foránea**, deliberadamente: la auditoría debe
sobrevivir aunque el registro original desaparezca. Una clave foránea con `Restrict` impediría
borrar; con `Cascade` destruiría el historial que se quiere conservar. La contrapartida es validar
tipo e identificador al escribir.

### Snapshots por lista permitida

`previousValues` y `newValues` contienen solo los campos que cambiaron, seleccionados mediante una
**lista permitida de campos auditables por entidad** —no volcando el objeto y eliminando después
las claves peligrosas.

La diferencia es sustancial. Con lista prohibida, cualquier campo nuevo que alguien añada a una
entidad queda auditado por defecto, y basta que se llame de forma no prevista para que un secreto
acabe en la tabla. Con lista permitida, lo que no se declara explícitamente no se audita.

Queda prohibido almacenar contraseñas, hashes, JWT, refresh tokens, secretos, claves de API,
`DATABASE_URL` y credenciales incrustadas en objetos o mensajes de error. No se enmascaran: un
valor enmascarado sigue revelando su longitud y su existencia.

### Alcance real de `requestId`

Llevan la columna **`AuditLog` e `InventoryMovement`**, que son donde la correlación aporta valor
inmediato. Esos dos registros se correlacionan directamente con una sola condición.

Los documentos empresariales **no** la llevan: se alcanzan por sus claves foráneas y por
`entityId`. Afirmar que «todas las filas comparten `requestId`» sería falso y llevaría a escribir
consultas que no devuelven nada.

El identificador se genera al entrar la petición HTTP y se propaga mediante almacenamiento de
contexto asíncrono. Los procesos automáticos futuros necesitarán un identificador equivalente.

### Auditoría dentro de la transacción

El registro de una operación empresarial participa de la misma transacción que la operación. Ante
un `ROLLBACK` no queda un `AuditLog` afirmando que algo se completó. Una auditoría que miente es
peor que no tener auditoría, porque se confía en ella.

**Excepción deliberada:** `LOGIN_FAILED` se escribe fuera de la transacción del intento, porque
debe persistir precisamente cuando la operación fracasa.

### Append-only

No se exponen `PATCH /audit/:id` ni `DELETE /audit/:id`, y un **disparador** rechaza cualquier
`UPDATE` o `DELETE` sobre `audit_logs`. La cuenta de aplicación tampoco debe tener permiso de
`TRUNCATE`. La disciplina de la aplicación no basta cuando la garantía es que el historial no se
altera.

`AuditLog` tiene `createdAt` pero **no** `updatedAt`: un campo que registra la última modificación
no tiene sentido en una tabla que no se modifica.

### Acceso

Consultar la auditoría queda restringido al rol `ADMIN`. Ningún rol puede modificarla.

## Consecuencias

- El sistema puede responder ante un tribunal de dónde salió cada cambio de inventario y quién lo
  ejecutó, que es el objetivo académico del proyecto.
- `AuditEntityType` y `AuditAction` son enums de PostgreSQL. Incorporar un dominio nuevo exige
  ampliar el enum en su migración; es una consecuencia aceptada, porque añadir un dominio ya
  requiere migración de todos modos.
- La tabla crece de forma monótona. Si algún día fuera un problema, se archiva por rango de
  fechas; nunca se borra.
- El disparador y las restricciones van como SQL dentro de la migración. **Su convivencia con
  Prisma Migrate y su base de datos sombra no está verificada** y debe probarse técnicamente antes
  de darse por buena.
- **Límite honesto:** el disparador no protege frente a un administrador de base con privilegios
  para alterarlo. Ninguna garantía de la aplicación lo hace.
