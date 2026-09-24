# CLAUDE.md — EcoSoap ERP

## Project identity

```text
project-id: ecosoap-erp
```

Nombre descriptivo: **EcoSoap ERP**. Repositorio: `Luigui789/Manufactura` (público).

Este identificador es canónico y estable. Úsalo al consultar Obsidian
(`frontmatter_query field=project value=ecosoap-erp`). No lo deduzcas del nombre de la carpeta ni
del repositorio: ambos se llaman «Manufactura», que es el nombre de la asignatura, no del sistema.

## Qué es este proyecto

ERP web propio para EcoSoap Nicaragua S.A., empresa manufacturera ficticia de jabón ecológico
elaborado con aceite de cocina usado. Proyecto de la asignatura Sistemas de Manufactura,
Ingeniería de Sistemas.

Cuatro módulos que deben estar **integrados**, no ser CRUD independientes:

```text
COMPRA → RECEPCIÓN → INVENTARIO → ORDEN DE PRODUCCIÓN → CONSUMO DE MP
      → LOTE → PRODUCTO TERMINADO → INVENTARIO → ORDEN DE VENTA → DESPACHO
```

## Stack cerrado

| Capa            | Tecnologías                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces                                                                  |
| Frontend        | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query/Table, RHF, Zod |
| Backend         | NestJS, TypeScript, REST, Swagger/OpenAPI, JWT, RBAC, class-validator            |
| Persistencia    | PostgreSQL, Prisma ORM, Prisma Migrations                                        |
| Infraestructura | Docker Compose, Git, GitHub                                                      |

**Vetado** sin justificación aprobada: microservicios, Kubernetes, Kafka, RabbitMQ, GraphQL,
MongoDB, Next.js, Redis, event sourcing, CQRS complejo, serverless.

Principio rector: la solución más simple que conserve una arquitectura profesional. El código debe
poder ser entendido, mantenido y defendido por estudiantes.

## Gestor de paquetes

**pnpm es el gestor oficial y exclusivo.** No uses `npm install`, `yarn` ni `bun`. El único
lockfile versionado es `pnpm-lock.yaml`. La versión está fijada en `packageManager` del
`package.json` raíz; asegúrala con Corepack.

```bash
pnpm install                        # instala todo el monorepo
pnpm dev                            # levanta backend y frontend en paralelo
pnpm --filter backend start:dev     # solo backend
pnpm --filter frontend dev          # solo frontend
```

## Reglas de arquitectura que no se negocian

1. **El backend garantiza la regla; el frontend solo ayuda al usuario.** Toda validación de
   negocio existe en el backend aunque también exista en el frontend.
2. **El inventario nunca se modifica en silencio.** Todo cambio de existencias genera un
   `InventoryMovement` con su tipo (`PURCHASE_RECEIPT`, `PRODUCTION_CONSUMPTION`,
   `PRODUCTION_OUTPUT`, `SALE_DISPATCH`, `ADJUSTMENT`). Nunca `stock = stock + cantidad` suelto.
3. **Un solo sistema de movimientos.** Compras, Producción y Ventas usan el mismo mecanismo; no
   se implementan tres lógicas distintas para tocar stock.
4. **Operaciones multi-entidad en transacción.** Completar una producción o recibir una compra es
   atómico: si algo falla, rollback completo.
5. **Los estados son enums**, no texto libre.
6. **Dinero en decimal**, nunca `float`.
7. **Separación Controller → Service → Prisma.** Sin lógica de negocio en los controllers.
8. **Endpoints semánticos** para acciones de negocio (`POST /purchase-orders/:id/receive`), no un
   `PATCH` genérico para todo.
9. **Respuestas consistentes**: `{ data, message }` en éxito, `{ data, meta }` en listas, códigos
   HTTP correctos en error.
10. **Un lote no liberado no se despacha ni se consume.** `QUARANTINED` y `REJECTED` bloquean
    ambas operaciones; solo el ajuste de salida permanece permitido.
11. **Confirmar una venta no reserva inventario.** La comprobación al confirmar es informativa;
    la disponibilidad solo queda determinada al despachar.
12. **La auditoría es append-only.** Nunca escribas endpoints ni código que modifique o borre
    `AuditLog` o `InventoryMovement`. Las correcciones son asientos compensatorios.

## Estado actual

**Etapa 1 (configuración inicial): integrada en `develop`** mediante el pull request #1. El
backend tiene `ConfigModule`, `PrismaModule` y `HealthModule`; el frontend, una pantalla temporal
de verificación que debe reemplazarse al empezar el layout real.

**Etapa 2 (modelo de datos): en curso** en `feature/database-foundation`. El diseño Foundation
está aprobado y su primera migración, seed y pruebas de integridad ya existen. Compras, Producción
y Ventas siguen siendo modelo conceptual en `docs/database.md`. La Etapa 2 no está terminada:
falta cotejar los requisitos con la Entrega 1 y revisar el PR.

No crees carpetas ni módulos vacíos para «mostrar estructura». La arquitectura futura está
descrita en `docs/architecture.md`; cada módulo nace con su funcionalidad real.

El avance real y verificado de cada etapa vive en `docs/progress.md`. Nunca marques una casilla
sin haber ejecutado la comprobación y visto el resultado.

## Flujo de trabajo del equipo

Tres integrantes. Ramas: `main` (estable) → `develop` (integración) → `feature/*` (trabajo).

- Nadie modifica `main` directamente.
- Las ramas nombran unidades de trabajo, no personas: `feature/inventory`, `fix/negative-stock`.
- Todo PR va de `feature/*` a `develop` y **requiere revisión de otro integrante**; nadie fusiona
  su propio PR salvo cambios triviales de documentación.
- `pull` de `develop` antes de empezar; actualizar la rama con `develop` antes de abrir el PR.
- Los cambios de `schema.prisma` se coordinan con el equipo.
- Las migraciones de Prisma **no se editan a mano** una vez compartidas.
- Commits con Conventional Commits.
- El reparto es por funcionalidad, no por capas: una feature incluye Prisma, endpoints, pantallas
  y pruebas antes de considerarse terminada.

## Task Router

| Tipo de tarea                           | Lee primero                                        |
| --------------------------------------- | -------------------------------------------------- |
| Entender la arquitectura general        | `docs/architecture.md`                             |
| Modelo de datos, entidades, Prisma      | `docs/database.md`, `backend/prisma/schema.prisma` |
| Endpoints, contratos, Swagger           | `docs/api.md`                                      |
| Saber qué requisito cubre algo          | `docs/requirements.md`                             |
| Levantar el entorno, problemas de setup | `docs/setup.md`                                    |
| Auditoría y trazabilidad                | `docs/audit.md`                                    |
| Por qué se decidió algo                 | `docs/decisions/`                                  |
| Qué está hecho y verificado             | `docs/progress.md`                                 |
| Diseño de una etapa                     | `docs/specs/`                                      |

Carga solo lo que la tarea necesita. No leas todo el proyecto en cada tarea.

## Antes de implementar

Identifica: qué requisito (`RF-*`) implementa, a qué módulo pertenece, qué entidades afecta, si
modifica inventario, si necesita transacción, si necesita autorización, qué DTO y validaciones
requiere, qué cambia en Prisma, qué pantalla y qué pruebas necesita.
