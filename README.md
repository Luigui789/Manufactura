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

| Capa            | Tecnologías                                      |
| --------------- | ------------------------------------------------ |
| Monorepo        | pnpm workspaces                                  |
| Frontend        | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend         | NestJS, TypeScript, REST, Swagger/OpenAPI        |
| Persistencia    | PostgreSQL, Prisma ORM                           |
| Infraestructura | Docker Compose                                   |
| Calidad         | ESLint, Prettier, Vitest                         |

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

En esta etapa `schema.prisma` **no tiene modelos de negocio ni migraciones**: el modelo de datos se
diseña antes de crear la primera. Cuando existan:

```bash
pnpm --filter backend exec prisma migrate dev --name descripcion_del_cambio
```

Los cambios de `schema.prisma` se coordinan con el equipo, y una migración ya compartida no se
edita nunca a mano.

## Calidad

```bash
pnpm lint            # ESLint en ambos proyectos
pnpm format          # Prettier sobre todo el repositorio
pnpm format:check    # comprueba sin modificar
pnpm build           # compila ambos proyectos

pnpm --filter backend test       # pruebas unitarias
pnpm --filter backend test:e2e   # pruebas e2e (requieren PostgreSQL arriba)
```

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

Todo desarrollo parte de `develop`. Nadie modifica `main` directamente. Las ramas nombran unidades
de trabajo, no personas (`feature/inventory`, `fix/negative-stock`). Todo pull request requiere la
revisión de otro integrante antes de fusionarse.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Base de datos](docs/database.md)
- [API](docs/api.md)
- [Requisitos](docs/requirements.md)
- [Puesta en marcha](docs/setup.md)
