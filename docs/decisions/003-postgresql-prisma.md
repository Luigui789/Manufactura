# ADR 003 — PostgreSQL con Prisma como única vía de persistencia

- **Estado:** Aceptado
- **Fecha:** 2026-09-22
- **Etapa:** 1 — Configuración inicial

## Contexto

El ERP necesita integridad referencial fuerte, tipos decimales exactos para dinero y cantidades,
enums de estado, transacciones y auditoría. El equipo necesita además que los cambios de esquema
sean reproducibles en tres máquinas.

## Decisión

PostgreSQL como motor, ejecutado localmente en Docker Compose, y Prisma como único mecanismo de
acceso. Todo cambio estructural pasa por `schema.prisma` y una migración de Prisma versionada en
Git.

No se escribe SQL manual salvo razón técnica clara y documentada. Cuando ocurra —por ejemplo para
restricciones `CHECK` o disparadores, que Prisma no modela— el SQL vive dentro de la migración, no
disperso en el código.

**El SQL dentro de una migración forma parte de la vía oficial de persistencia, no es una
excepción a ella.** Prisma permite editar una migración recién generada antes de aplicarla, de
modo que ese SQL queda versionado en el historial y la base de datos sombra lo reproduce igual que
al resto. Lo que sí queda prohibido es aplicar SQL solo contra una base local sin registrarlo en
una migración: eso produce bases distintas entre los tres integrantes.

## Consecuencias

- La integridad se refuerza en la base de datos y no solo en NestJS: claves foráneas,
  restricciones de unicidad, `NOT NULL`, `CHECK` e índices.
- Prisma devuelve los `Decimal` como objetos de precisión arbitraria. La aritmética monetaria y de
  cantidades **nunca debe pasar por números de punto flotante de JavaScript**.
- Prisma 7 introdujo dos cambios que condicionan el proyecto: la URL de conexión vive en
  `prisma.config.ts` en lugar del bloque `datasource`, y el cliente se genera como código
  TypeScript en una ruta explícita en lugar de dentro de `node_modules`.
- Las versiones de `prisma` y `@prisma/client` están fijadas al par estable `7.10.0`. El dist-tag
  `latest` de la CLI apunta a un release candidate de la versión 8 mientras el cliente sigue en la
  7; instalar con `latest` produce un par incompatible.
- Una migración ya compartida no se edita nunca: los errores se corrigen con una migración nueva.
