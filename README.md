# EcoSoap ERP

ERP web para **EcoSoap Nicaragua S.A.**, empresa manufacturera de jabón ecológico elaborado a
partir de aceite de cocina usado. Proyecto de la asignatura Sistemas de Manufactura, carrera de
Ingeniería de Sistemas.

## Objetivo

Construir un ERP propio —no una personalización de Odoo ni de ningún ERP existente— que integre
cuatro módulos sobre un único flujo de negocio:

```text
COMPRA → RECEPCIÓN DE MATERIA PRIMA → INVENTARIO → ORDEN DE PRODUCCIÓN
      → CONSUMO DE MATERIA PRIMA → LOTE → PRODUCTO TERMINADO → INVENTARIO
      → ORDEN DE VENTA → DESPACHO
```

La prioridad del proyecto es la **integridad de los procesos empresariales antes que la cantidad
de funcionalidades**: cuatro módulos correctamente integrados valen más que muchas pantallas sin
coherencia entre sí.

## Arquitectura

Cliente-servidor con API REST sobre un monolito modular gestionado como monorepo con pnpm
workspaces.

```text
React + Vite  ──REST/JSON──►  NestJS  ──Prisma──►  PostgreSQL
```

Detalle completo en [`docs/architecture.md`](docs/architecture.md).

## Tecnologías

| Capa            | Tecnologías                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces                                                                           |
| Frontend        | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, React Router, RHF y Zod |
| Backend         | NestJS, REST, Swagger/OpenAPI, JWT en cookie, Argon2id y RBAC                             |
| Persistencia    | PostgreSQL, Prisma ORM                                                                    |
| Infraestructura | Docker Compose                                                                            |
| Calidad         | ESLint, Prettier, Vitest                                                                  |

## Requisitos

| Herramienta    | Versión         |
| -------------- | --------------- |
| Node.js        | >= 22.12        |
| pnpm           | 10.30.3         |
| Docker Desktop | con Compose v2+ |

**pnpm es el gestor oficial del proyecto.** No uses `npm install`, `yarn` ni `bun`; el único
lockfile versionado es `pnpm-lock.yaml`. La versión está fijada en `packageManager`, así que basta
con `corepack enable` para que todos trabajemos con la misma.

> **No clones el repositorio dentro de OneDrive** ni en ninguna carpeta con sincronización
> automática: `node_modules` de pnpm usa enlaces simbólicos que esa sincronización corrompe.

## Instalación

```bash
git clone https://github.com/Luigui789/Manufactura.git
cd Manufactura
corepack enable
pnpm install
```

## Variables de entorno

```bash
cp .env.example .env
```

Un único `.env` en la raíz alimenta a las tres piezas: Docker Compose, el backend y Vite. Solo las
variables con prefijo `VITE_` llegan al navegador, de modo que `DATABASE_URL` y la contraseña de
la base de datos nunca se exponen en el cliente.

`.env` está en `.gitignore` y no debe versionarse: **el repositorio es público**.

Genera `JWT_SECRET` aleatorio de al menos 32 caracteres y reemplaza el marcador `change-me`
(que falla la validación a propósito):

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

No lo compartas ni lo prefijes con `VITE_`. Los pasos completos están en `docs/setup.md`.

## Docker

```bash
pnpm db:up       # levanta PostgreSQL
pnpm db:down     # lo detiene
pnpm db:logs     # sigue sus registros
```

En esta etapa Docker Compose contiene únicamente PostgreSQL; el backend y el frontend se ejecutan
localmente. El contenedor publica el puerto **5433** para no chocar con instalaciones nativas de
PostgreSQL que suelen ocupar el 5432.

## Ejecución

```bash
pnpm dev                          # backend y frontend en paralelo
pnpm --filter backend start:dev   # solo backend
pnpm --filter frontend dev        # solo frontend
```

| Servicio     | URL                              |
| ------------ | -------------------------------- |
| Frontend     | http://localhost:5173            |
| API          | http://localhost:3000/api        |
| Swagger      | http://localhost:3000/api/docs   |
| Health check | http://localhost:3000/api/health |

## Migraciones

```bash
pnpm --filter backend prisma:generate    # regenera el cliente
```

La primera migración implementa solo Foundation. Compras, Producción y Ventas se añaden en
migraciones posteriores. Para aplicar las migraciones pendientes en desarrollo:

```bash
pnpm --filter backend exec prisma migrate dev --name descripcion_del_cambio
```

La migración Foundation contiene SQL adicional para `CHECK` y disparadores append-only. Los
cambios de `schema.prisma` se coordinan con el equipo, y una migración ya compartida no se edita.
El seed idempotente se ejecuta con `pnpm --filter backend db:seed`.

Para un checkout nuevo, aplica las migraciones existentes antes del seed:

```bash
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend db:seed
```

### Primer administrador e ingreso

El seed no crea usuarios. `pnpm --filter backend admin:create` crea solo el primer ADMIN, leyendo
`ADMIN_EMAIL`, `ADMIN_FULL_NAME` y `ADMIN_PASSWORD` del entorno del proceso. Falla si hay un ADMIN
activo o el correo existe y nunca modifica cuentas. La contraseña debe tener 15–128 caracteres;
el bootstrap no exige cambio inicial. El procedimiento por shell está en `docs/setup.md`.
Elimina la variable de contraseña después de usarla. Los demás usuarios se crean desde `/users`
por un ADMIN autenticado, con contraseña temporal y cambio obligatorio.

En `develop` están integrados login, sesión en cookie `HttpOnly`, cambio de contraseña,
menú por rol y administración de usuarios mediante el [PR #3](https://github.com/Luigui789/Manufactura/pull/3).
La etapa pasó las 115 pruebas y los checks de calidad en GitHub Actions; véase `docs/progress.md`.

## Calidad

```bash
pnpm lint            # ESLint en ambos proyectos
pnpm format          # Prettier sobre todo el repositorio
pnpm format:check    # comprueba sin modificar
pnpm build           # compila ambos proyectos

pnpm --filter backend test       # pruebas unitarias
pnpm --filter backend test:e2e   # pruebas e2e (requieren PostgreSQL arriba)
pnpm --filter frontend test      # Vitest + React Testing Library (F1–F6)
```

Las e2e requieren una `DATABASE_URL` de una base dedicada con nombre terminado en `_test`, con
migraciones y seed aplicados. Nunca se ejecutan sobre `ecosoap_erp`; ejemplos en `docs/setup.md`.

## Integración continua

GitHub Actions ejecuta `.github/workflows/ci.yml` en PR hacia `develop`/`main` y en pushes a esas
ramas. El check `Quality and tests` instala el lockfile sin cambios, genera Prisma, aplica
migraciones y seed a PostgreSQL 18 y ejecuta lint, formato, builds y las tres suites de pruebas.
Usa la base efímera `ecosoap_ci_test` y un `JWT_SECRET` aleatorio por ejecución; no necesita
secretos del repositorio ni accede a la base de trabajo. La CI comprueba calidad; no despliega ni
fusiona PR automáticamente.

## Estructura

```text
Manufactura/
├── package.json            privado; scripts del monorepo
├── pnpm-workspace.yaml
├── docker-compose.yml      solo PostgreSQL
├── .env.example
├── CLAUDE.md               identidad del proyecto y reglas de trabajo
│
├── docs/
│   ├── architecture.md     estilo arquitectónico y estructura futura
│   ├── database.md         modelo de datos y reglas de modelado
│   ├── api.md              convenciones y catálogo de endpoints
│   ├── requirements.md     catálogo de requisitos funcionales
│   ├── setup.md            puesta en marcha y problemas frecuentes
│   └── specs/              decisiones de diseño por etapa
│
├── backend/                NestJS + Prisma + Swagger
└── frontend/               React + Vite + Tailwind + shadcn/ui
```

## Flujo de ramas

```text
main        versiones estables
  └── develop        integración
        └── feature/*      trabajo en curso
```

Todo desarrollo parte de `develop`; nadie trabaja directamente sobre `develop` ni `main`.
Las ramas nombran unidades de trabajo, no personas (`feature/inventory`, `fix/negative-stock`).
Los cambios se integran por PR hacia `develop`. Luigui789, líder del proyecto, puede fusionar sus
propios PR tras verificar diff y checks. Los otros dos integrantes necesitan al menos una
aprobación de otro miembro antes del merge. `main` se reserva para bloques estables.

## Documentación

- [Arquitectura](docs/architecture.md) — estilo arquitectónico, capas de trazabilidad, estructura futura
- [Base de datos](docs/database.md) — modelo conceptual, ERD, constraints e índices
- [Auditoría](docs/audit.md) — qué se audita, qué nunca se guarda, correlación y transacciones
- [API](docs/api.md) — convenciones y catálogo de endpoints
- [Requisitos](docs/requirements.md) — catálogo y matriz de trazabilidad
- [Puesta en marcha](docs/setup.md) — instalación y problemas frecuentes
- [Avance](docs/progress.md) — estado real de cada etapa
- [Decisiones (ADR)](docs/decisions/) — decisiones arquitectónicas registradas
