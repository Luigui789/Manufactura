# Registro de decisiones arquitectónicas (ADR)

Cada decisión que cambia de forma difícil de revertir la estructura del sistema se registra aquí
como un ADR corto con tres secciones: **Contexto**, **Decisión** y **Consecuencias**.

## Reglas

- Un ADR describe una decisión, no un manual. Si necesita explicar _cómo se usa_ algo, eso va en
  `docs/`.
- Los ADR **no se editan** una vez aceptados. Si una decisión cambia, se escribe un ADR nuevo que
  declare explícitamente a cuál sustituye, y el antiguo pasa a `Sustituido por NNN`.
- No se crea un ADR para decisiones triviales o reversibles en minutos.

## Estados

| Estado               | Significado                                             |
| -------------------- | ------------------------------------------------------- |
| `Propuesto`          | Redactado, aún no aprobado. No debe implementarse.      |
| `Aceptado`           | Aprobado. Es la decisión vigente y puede implementarse. |
| `Sustituido por NNN` | Ya no rige; el ADR indicado lo reemplaza.               |

Un ADR nunca figura a la vez como aceptado y pendiente. Si `progress.md` y este índice
discrepasen, este índice es el que manda sobre el estado de la decisión.

## Índice

| ADR                                                 | Estado   | Decisión                                                           |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| [001](001-package-manager-pnpm.md)                  | Aceptado | pnpm como gestor único del monorepo                                |
| [002](002-monolito-modular.md)                      | Aceptado | Monolito modular en lugar de microservicios                        |
| [003](003-postgresql-prisma.md)                     | Aceptado | PostgreSQL con Prisma como única vía de persistencia               |
| [004](004-inventario-ledger-y-balance.md)           | Aceptado | Ledger inmutable + balance materializado                           |
| [005](005-estrategia-de-auditoria.md)               | Aceptado | Tres capas de trazabilidad y `AuditLog` append-only                |
| [006](006-estrategia-de-identificadores.md)         | Aceptado | UUIDv7 técnico + código humano separado                            |
| [007](007-trazabilidad-de-lotes.md)                 | Aceptado | Lotes con origen obligatorio y liberación por calidad              |
| [008](008-sesion-jwt-en-cookie.md)                  | Aceptado | Sesión JWT en cookie `HttpOnly` con versión de sesión              |
| [009](009-contrasenas-argon2id.md)                  | Aceptado | Argon2id, política por longitud y contraseñas temporales           |
| [010](010-autorizacion-por-politicas.md)            | Aceptado | Autorización por políticas, denegada por defecto                   |
| [011](011-inventory-single-writer.md)               | Aceptado | Inventario como escritor único y contrato con transacción recibida |
| [012](012-transacciones-y-orden-de-bloqueos.md)     | Aceptado | Transacción del llamador y orden global de bloqueos                |
| [013](013-origen-obligatorio-de-lotes.md)           | Aceptado | Creación por Inventario y origen exclusivo de lotes                |
| [014](014-versionado-bom-y-ejecucion-produccion.md) | Aceptado | BOM/versiones y semántica de ejecución de Producción               |

Los ADR 011–014 forman parte del PR0 de la
[siguiente ronda de desarrollo](../specs/2026-10-10-inventory-purchases-production-design.md).
Quedaron `Aceptado` conceptualmente en la revisión local del 2026-10-10 por aprobación del
responsable. Su implementación está pendiente y fuera de este PR0. 011–013 concretan la
aplicación futura de 004 y 007; 014 detalla Producción. Los ADR 001–010 se conservan íntegros.
Tipos comprables, permisos de recepción, alcance de Calidad para compras y nombres concretos
de archivos/componentes no quedan aprobados como invariantes arquitectónicas.

## Historial

Los ADR 004 a 007 se redactaron el 2026-09-23, se sometieron a una auditoría de diseño el mismo
día y se corrigieron **antes** de ser aceptados. Como nunca llegaron a estar aceptados en una
versión anterior —ni siquiera integrados en el repositorio—, las correcciones se aplicaron en
sitio en lugar de mediante ADR sustitutivos. Cada uno lo indica en su cabecera.

A partir de ahora rige la regla general: un ADR aceptado no se edita.
