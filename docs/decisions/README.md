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

| ADR                                         | Estado   | Decisión                                              |
| ------------------------------------------- | -------- | ----------------------------------------------------- |
| [001](001-package-manager-pnpm.md)          | Aceptado | pnpm como gestor único del monorepo                   |
| [002](002-monolito-modular.md)              | Aceptado | Monolito modular en lugar de microservicios           |
| [003](003-postgresql-prisma.md)             | Aceptado | PostgreSQL con Prisma como única vía de persistencia  |
| [004](004-inventario-ledger-y-balance.md)   | Aceptado | Ledger inmutable + balance materializado              |
| [005](005-estrategia-de-auditoria.md)       | Aceptado | Tres capas de trazabilidad y `AuditLog` append-only   |
| [006](006-estrategia-de-identificadores.md) | Aceptado | UUIDv7 técnico + código humano separado               |
| [007](007-trazabilidad-de-lotes.md)         | Aceptado | Lotes con origen obligatorio y liberación por calidad |

## Historial

Los ADR 004 a 007 se redactaron el 2026-09-23, se sometieron a una auditoría de diseño el mismo
día y se corrigieron **antes** de ser aceptados. Como nunca llegaron a estar aceptados en una
versión anterior —ni siquiera integrados en el repositorio—, las correcciones se aplicaron en
sitio en lugar de mediante ADR sustitutivos. Cada uno lo indica en su cabecera.

A partir de ahora rige la regla general: un ADR aceptado no se edita.
