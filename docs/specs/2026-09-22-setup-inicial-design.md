# Diseño — Etapa 1: Configuración inicial

- **Proyecto:** EcoSoap ERP (`project-id: ecosoap-erp`)
- **Repositorio:** `Luigui789/Manufactura`
- **Fecha:** 2026-09-22
- **Estado:** aprobado e implementado (ver §10, desviaciones detectadas al ejecutarlo)
- **Prioridad del prompt maestro:** §49.1 «Configuración inicial»

## 1. Objetivo

Obtener un esqueleto limpio, reproducible y documentado del monorepo sobre el cual construir
después los módulos de negocio. Al terminar esta etapa, cualquier integrante debe poder clonar
el repositorio, ejecutar dos comandos y tener frontend, backend y PostgreSQL corriendo en local.

Esta etapa **no implementa ninguna regla de negocio**. Su criterio de éxito es de infraestructura
y calidad, no funcional.

## 2. Alcance

### Incluido

Estructura del monorepo con pnpm workspaces; configuración de Git y `.gitignore`; `.env.example`
como referencia para el equipo; PostgreSQL vía Docker Compose; Prisma configurado y conectado;
NestJS + TypeScript; React + TypeScript + Vite; Tailwind CSS y shadcn/ui; ESLint y Prettier con
criterios consistentes; Swagger/OpenAPI inicial; `README.md` con instrucciones de arranque;
documentación arquitectónica en `docs/`; y verificación ejecutada de que las tres piezas
levantan correctamente.

### Excluido explícitamente

CRUD de productos, Compras, Inventario, Producción, Ventas, autenticación, dashboard, datos seed
de negocio y simulación ISA-95. Tampoco se crea `packages/shared`: si más adelante aparece una
necesidad real de compartir tipos o contratos entre frontend y backend, se analizará entonces.

## 3. Decisiones arquitectónicas

### Decisión A — Monorepo con pnpm workspaces

`frontend/` y `backend/` son aplicaciones independientes, cada una con su propio `package.json`
declarando explícitamente sus dependencias, administradas desde la raíz mediante
`pnpm-workspace.yaml`. **No se mezclan dependencias funcionales entre ambas.**

El `package.json` de la raíz es privado y existe solo para scripts de desarrollo y calidad del
monorepo. La versión de pnpm queda fijada en el campo `packageManager` para que los tres
integrantes trabajen con la misma, asegurada mediante Corepack.

**pnpm es el gestor oficial y exclusivo.** No se usa `npm install`, `yarn` ni `bun`. El único
archivo de bloqueo versionado es `pnpm-lock.yaml`; `package-lock.json` y `yarn.lock` quedan en
`.gitignore`.

### Decisión B — Docker Compose contiene únicamente PostgreSQL

Conforme a §36 del prompt maestro. Frontend y backend se ejecutan localmente mediante pnpm.
Dockerizar el backend se pospone: el hot-reload dentro de un contenedor en Windows es lento y
frágil, y no aporta nada a esta etapa.

### Decisión C — Prisma sin modelo de negocio

`schema.prisma` contiene únicamente `datasource` y `generator`. **No se crean `User`, `Role`,
`Product` ni ninguna otra entidad solo para demostrar que Prisma funciona**, y no se ejecuta
ninguna migración empresarial. El modelo de datos real se diseñará en una etapa posterior, antes
de crear la primera migración.

La conectividad se valida con un endpoint `GET /api/health` que ejecuta `SELECT 1` mediante
`prisma.$queryRaw`. Eso demuestra la cadena completa NestJS → Prisma → PostgreSQL sin modelar
nada prematuramente. Se implementa a mano (unas quince líneas) en lugar de añadir
`@nestjs/terminus`, para no introducir una dependencia que esta etapa no necesita.

### Decisión D — Sin módulos NestJS vacíos

En esta etapa existen realmente solo tres módulos, porque los tres hacen algo: `ConfigModule`,
`PrismaModule` y `HealthModule`. Las áreas futuras (Compras, Inventario, Producción, Ventas,
Auth, Users, Roles) quedan documentadas en `docs/architecture.md`, no como carpetas vacías ni
como clases sin comportamiento. Cuando empiece una funcionalidad real se creará su módulo:
`feature/purchases` traerá consigo `ComprasModule`.

## 4. Versiones fijadas y riesgos detectados

Las versiones se verificaron contra el registro el 2026-09-22. **Dos paquetes clave no deben
instalarse con `latest`**, porque el resultado sería una instalación rota o fuera de soporte.

### Riesgo 1 — El `latest` de Prisma es un release candidate

El dist-tag `latest` de la CLI `prisma` apunta hoy a `8.0.0-rc.15`, mientras que el `latest` de
`@prisma/client` es `7.10.0` estable. Instalar ambos con `latest` produciría una CLI en RC contra
un cliente estable de otra versión mayor.

**Decisión:** fijar el par estable exacto `prisma@7.10.0` y `@prisma/client@7.10.0`.

### Riesgo 2 — El `latest` de TypeScript es incompatible con el resto del stack

El dist-tag `latest` de TypeScript apunta a `7.0.2` (el port nativo). Sin embargo,
`@nestjs/cli@12.0.5` depende de `typescript@~6.0.2`, y `typescript-eslint@8.70.1` declara el rango
`typescript: >=4.8.4 <6.1.0`. TypeScript 7 rompería simultáneamente la compilación de NestJS y el
linting de ambos proyectos.

**Decisión:** fijar `typescript@~6.0.3` en frontend y backend, de modo que el monorepo entero
hable una sola versión de TypeScript.

### Riesgo 3 — pnpm 10 no ejecuta los scripts de instalación de las dependencias

Desde pnpm 10, los lifecycle scripts de las dependencias están bloqueados por defecto. Prisma
necesita su `postinstall` para descargar motores y generar el cliente.

**Decisión:** declarar `onlyBuiltDependencies` en `pnpm-workspace.yaml` con los paquetes que
realmente lo requieran. La lista definitiva se confirma con el aviso que emite pnpm en la primera
instalación, en lugar de adivinarla.

### Tabla de versiones

| Ámbito   | Paquete                        | Versión       | Nota                                   |
| -------- | ------------------------------ | ------------- | -------------------------------------- |
| Entorno  | Node.js                        | 22.16.0       | NestJS 12 pide >= 20; Prisma 7, ^22.12 |
| Entorno  | pnpm                           | 10.30.3       | fijada en `packageManager`             |
| Raíz     | prettier                       | 3.9.8         | única instancia, compartida            |
| Backend  | @nestjs/core, @nestjs/cli      | 12.x          |                                        |
| Backend  | @nestjs/swagger                | 12.0.1        |                                        |
| Backend  | @nestjs/config                 | 12.0.1        |                                        |
| Backend  | prisma / @prisma/client        | 7.10.0        | **fijado**, no `latest`                |
| Backend  | class-validator                | 0.15.1        | requerido por §19                      |
| Backend  | class-transformer              | 0.5.1         |                                        |
| Ambos    | typescript                     | ~6.0.3        | **fijado**, no `latest`                |
| Ambos    | eslint / typescript-eslint     | 10.x / 8.70.1 |                                        |
| Frontend | vite                           | 8.3.0         |                                        |
| Frontend | @vitejs/plugin-react           | 6.1.1         | requiere vite ^8                       |
| Frontend | react / react-dom              | 19.3.0        |                                        |
| Frontend | tailwindcss, @tailwindcss/vite | 4.3.3         | Tailwind 4 usa plugin de Vite          |
| Frontend | shadcn (CLI)                   | 4.21.0        |                                        |

Las versiones exactas quedan registradas en `pnpm-lock.yaml`, que se versiona.

## 5. Estructura resultante

```text
Manufactura/
├── package.json                  privado, scripts del monorepo
├── pnpm-workspace.yaml           packages: frontend, backend + onlyBuiltDependencies
├── pnpm-lock.yaml
├── .editorconfig  .prettierrc  .prettierignore  .gitignore
├── .env.example
├── docker-compose.yml            solo PostgreSQL
├── CLAUDE.md                     project-id, arquitectura, reglas de equipo, Task Router
├── README.md
│
├── docs/
│   ├── architecture.md  database.md  api.md  requirements.md  setup.md
│   └── specs/2026-09-22-setup-inicial-design.md
│
├── backend/
│   ├── package.json  tsconfig.json  eslint.config.mjs  nest-cli.json
│   ├── prisma/schema.prisma       solo datasource + generator
│   └── src/
│       ├── main.ts                bootstrap, Swagger, ValidationPipe, CORS, prefijo /api
│       ├── app.module.ts
│       ├── config/                carga y validación de variables de entorno
│       ├── prisma/                PrismaModule + PrismaService
│       └── health/                HealthModule + HealthController
│
└── frontend/
    ├── package.json  tsconfig*.json  vite.config.ts  eslint.config.js
    ├── components.json            configuración de shadcn/ui
    ├── index.html
    └── src/
        ├── main.tsx  App.tsx  index.css
        ├── lib/utils.ts           helper cn() de shadcn
        └── components/ui/         componentes shadcn instalados
```

## 6. Configuración de cada pieza

### Raíz

`pnpm-workspace.yaml` declara `frontend` y `backend`. El `package.json` raíz es privado, fija
`packageManager: pnpm@10.30.3` y expone scripts que delegan mediante filtros:

| Script                   | Acción                                            |
| ------------------------ | ------------------------------------------------- |
| `pnpm dev`               | `pnpm -r --parallel run dev` (levanta ambos)      |
| `pnpm build`             | `pnpm -r run build`                               |
| `pnpm lint`              | `pnpm -r run lint`                                |
| `pnpm format`            | `prettier --write .` (una sola config en la raíz) |
| `pnpm format:check`      | `prettier --check .`                              |
| `pnpm db:up` / `db:down` | `docker compose up -d` / `down`                   |

El backend expone además `dev` como alias de `start:dev`, de modo que `pnpm dev` en la raíz
funcione y `pnpm --filter backend start:dev` siga siendo válido.

Prettier vive solo en la raíz porque es una herramienta de calidad del monorepo. ESLint vive en
cada proyecto porque los entornos son genuinamente distintos —Node y decoradores en el backend,
navegador y React en el frontend— y forzar una sola configuración sería peor.

### Variables de entorno

Un único `.env` en la raíz como fuente de verdad, con su `.env.example` versionado. El backend
lo carga mediante `@nestjs/config`; Vite lo lee configurando `envDir` hacia la raíz. Vite solo
inyecta en el bundle las variables con prefijo `VITE_`, de modo que `DATABASE_URL` y la
contraseña de PostgreSQL nunca llegan al navegador.

Claves previstas: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
`DATABASE_URL`, `PORT`, `FRONTEND_URL`, `VITE_API_URL`.

### Docker Compose

Un servicio `postgres` con imagen alpine fijada, credenciales tomadas del `.env`, volumen
nombrado para persistir datos y un `healthcheck` con `pg_isready`, para que el estado «sano» del
contenedor sea observable y no una suposición.

### Backend

`main.ts` establece el prefijo global `/api`, habilita CORS contra `FRONTEND_URL`, registra un
`ValidationPipe` global con `whitelist` y `transform` (base de §19), y monta Swagger en
`/api/docs` con los tags por módulo previstos en §34.

`PrismaService` extiende `PrismaClient` e implementa `OnModuleInit` para conectar al arrancar.
El generador de Prisma escribe en una ruta explícita dentro de `backend/`, ignorada por Git, en
lugar de dentro de `node_modules`: bajo pnpm el árbol de `node_modules` está enlazado
simbólicamente y la generación implícita es frágil.

`HealthController` expone `GET /api/health`, ejecuta `SELECT 1` y devuelve el estado de la base
de datos junto con un código HTTP correcto según §18 y §29.

### Frontend

Vite con `@vitejs/plugin-react` y `@tailwindcss/vite`. Tailwind 4 se activa con
`@import "tailwindcss"` en `index.css`, sin `tailwind.config.js`. shadcn/ui se inicializa con su
CLI, generando `components.json` y `lib/utils.ts`, y se instalan solo los componentes que use la
pantalla de verificación.

`App.tsx` es una **pantalla temporal de verificación**, marcada como tal en el código: renderiza
un componente de shadcn con clases de Tailwind y consulta `GET /api/health` con un `fetch`
simple. Prueba de una sola vez que Tailwind compila, que shadcn resuelve, que el alias de rutas
funciona y que CORS está bien configurado. Se reemplaza en cuanto empiece el layout real, y por
eso no se instalan todavía TanStack Query, TanStack Table, React Hook Form ni Zod.

## 7. Flujo de Git

El repositorio está vacío. La secuencia respeta el flujo acordado por el equipo:

1. Bootstrap mínimo en `main`: `.gitignore` y `README.md` inicial. Commit y push.
2. `develop` nace de `main`. Push.
3. `feature/project-setup` nace de `develop`. Toda la configuración se desarrolla ahí, en commits
   pequeños con Conventional Commits.
4. Push de la rama y apertura de pull request hacia `develop`.
5. **El PR queda abierto para revisión.** Nadie fusiona su propio PR sin la revisión de otro
   integrante, de modo que la fusión la decide el equipo, no yo.

No hay merges directos a `main` en ningún punto de esta etapa.

## 8. Criterios de verificación

La etapa no se considera terminada hasta ejecutar y mostrar la salida de:

| #   | Comprobación                                 | Resultado esperado                                      |
| --- | -------------------------------------------- | ------------------------------------------------------- |
| 1   | `pnpm -v`                                    | 10.30.3, coincidente con `packageManager`               |
| 2   | `pnpm install` en la raíz                    | ambos workspaces instalados, un solo `pnpm-lock.yaml`   |
| 3   | `docker compose ps`                          | `postgres` en estado `healthy`                          |
| 4   | `pnpm --filter backend exec prisma generate` | cliente generado sin errores                            |
| 5   | `pnpm --filter backend start:dev`            | arranca; `/api/health` responde con la BD conectada     |
| 6   | `GET /api/docs`                              | Swagger sirve la especificación                         |
| 7   | `pnpm --filter frontend dev`                 | sirve; la pantalla renderiza Tailwind + shadcn + health |
| 8   | `pnpm lint`                                  | limpio en ambos proyectos                               |
| 9   | `pnpm format:check`                          | limpio                                                  |
| 10  | `pnpm build`                                 | ambos compilan                                          |
| 11  | `git status` y `git ls-files`                | sin `.env`, sin `node_modules`, sin `package-lock.json` |

Se distinguirá en el reporte final lo verificado por ejecución de lo meramente configurado.

## 9. Punto pendiente de confirmación

El alcance pedido menciona «estructura modular inicial del backend» y «estructura por features
del frontend», mientras que la Decisión D descarta crear módulos vacíos. Ambas cosas conviven si
la estructura futura se documenta en `docs/architecture.md` sin materializar carpetas vacías —que
además Git no versiona—. Este diseño asume esa lectura y queda pendiente de confirmación.

**Resuelto:** confirmado documentar en `docs/architecture.md` sin crear carpetas vacías, sin
`.gitkeep`, sin módulos NestJS sin comportamiento y sin un `README.md` por módulo futuro. La
estructura física de cada dominio nace con su rama de funcionalidad.

## 10. Desviaciones detectadas durante la implementación

Lo que sigue se descubrió al ejecutar el diseño, no al redactarlo. Se documenta porque cada punto
costó una depuración y cualquiera del equipo puede tropezar con lo mismo.

### 10.1 Los scaffolds oficiales ya no usan ESLint

`@nestjs/cli@12` y `create-vite@8` generan ahora proyectos con **oxlint**, no con ESLint, y
NestJS 12 genera además con **Vitest** en lugar de Jest y como **ESM** (`"type": "module"`).

Se mantuvo ESLint en ambos proyectos porque es lo aprobado y porque un solo linter en todo el
monorepo es más defendible para un equipo de tres personas que dos vocabularios de reglas. Se
conservaron en cambio Vitest y ESM, que son mejoras sin coste. **Queda como decisión revisable:**
si el equipo prefiere alinearse con el default de ambas herramientas, migrar a oxlint es barato.

### 10.2 Prisma 7 eliminó `url` del bloque `datasource`

El esquema ya no admite la URL de conexión. Hubo que moverla a `prisma.config.ts` y dar al cliente
un _driver adapter_ (`@prisma/adapter-pg`) construido en `PrismaService`. Además el generador
`prisma-client` emite TypeScript, por lo que su salida debe vivir dentro de `src/` para que
compile con el resto.

### 10.3 PostgreSQL 18 cambió el punto de montaje del volumen

El volumen debe montarse en `/var/lib/postgresql`, no en `/var/lib/postgresql/data`. Con la ruta
antigua el contenedor arranca en bucle y queda `unhealthy`. Cualquier `docker-compose.yml`
copiado de un ejemplo anterior a PostgreSQL 18 falla así.

### 10.4 El puerto 5432 estaba ocupado por un PostgreSQL nativo

La máquina de desarrollo tenía el servicio `postgresql-x64-16` escuchando en 5432, de modo que el
backend se conectaba a esa instancia en lugar de al contenedor. El síntoma era
`Error 28000: no existe el rol "ecosoap"` con el contenedor perfectamente sano.

Se movió el contenedor al puerto **5433** en lugar de tocar la instalación nativa del usuario.

### 10.5 TypeScript 6 deprecó `baseUrl`

`tsc` falla con `TS5101` si se declara `baseUrl`. Los `paths` se resuelven ahora relativos al
propio `tsconfig`. Nota relacionada: la CLI de shadcn lee los alias del `tsconfig.json` raíz del
proyecto, que en el scaffold de Vite solo contiene `references`; hay que declararlos también ahí.

### 10.6 `eslint-plugin-react-hooks` 7 y el patrón fetch-en-efecto

La entrada `configs['recommended-latest']` sigue el formato antiguo de eslintrc; la de flat config
vive en `configs.flat['recommended-latest']`.

Su regla `set-state-in-effect` marca el `fetch` dentro de `useEffect` de la pantalla de
verificación. La regla tiene razón: ese patrón es justo el que TanStack Query resuelve, y §24 del
prompt maestro lo exige para todo dato del backend. Se suprimió puntualmente con un comentario que
explica el motivo, porque TanStack Query no forma parte del alcance de esta etapa. **Deuda
registrada:** al instalarlo, esa consulta debe migrar a `useQuery`.

### 10.7 `onlyBuiltDependencies` se resolvió por observación

pnpm 10 bloqueó tres scripts de instalación: `prisma`, `@prisma/engines` y `@scarf/scarf`. Se
aprobaron solo los dos primeros. `@scarf/scarf` es telemetría de instalación y **no se aprueba a
propósito**: bloquearlo es el comportamiento deseado.
