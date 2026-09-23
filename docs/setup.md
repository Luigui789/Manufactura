# Puesta en marcha — EcoSoap ERP

## 1. Requisitos

| Herramienta    | Versión             | Comprobar con            |
| -------------- | ------------------- | ------------------------ |
| Node.js        | >= 22.12            | `node -v`                |
| pnpm           | 10.30.3             | `pnpm -v`                |
| Docker Desktop | con Compose v2+     | `docker compose version` |
| Git            | cualquiera reciente | `git --version`          |

### pnpm con la versión correcta

La versión está fijada en `packageManager` del `package.json` raíz para que los tres integrantes
usen la misma. Con Corepack no hace falta instalarla a mano:

```bash
corepack enable
```

A partir de ahí, ejecutar `pnpm` dentro del repositorio usa automáticamente la versión declarada.

> **No uses `npm install`, `yarn` ni `bun`.** El único lockfile del proyecto es `pnpm-lock.yaml`.
> Un `package-lock.json` en el repositorio significa que alguien se equivocó de gestor.

### Dónde clonar el repositorio

**No lo pongas dentro de OneDrive, Dropbox ni ninguna carpeta con sincronización automática.**
`node_modules` de pnpm usa enlaces simbólicos hacia un almacén de contenido; la sincronización
automática los corrompe y produce errores `EPERM`/`EBUSY` aleatorios durante la instalación.

La sincronización entre los tres integrantes es exclusivamente por Git, GitHub y pull requests.

## 2. Instalación

```bash
git clone https://github.com/Luigui789/Manufactura.git
cd Manufactura
pnpm install
```

`pnpm install` instala los dos workspaces de una sola vez.

## 3. Variables de entorno

```bash
cp .env.example .env
```

Un único `.env` en la raíz alimenta a las tres piezas: `docker-compose.yml` lo lee para levantar
PostgreSQL, el backend lo carga con `@nestjs/config` y Vite lo lee mediante `envDir`.

Vite solo inyecta en el navegador las variables con prefijo `VITE_`, de modo que `DATABASE_URL` y
la contraseña de PostgreSQL nunca llegan al cliente.

`.env` está en `.gitignore` y **no debe versionarse**: el repositorio es público.

## 4. Base de datos

```bash
pnpm db:up          # levanta PostgreSQL en Docker
docker compose ps   # debe mostrar "healthy"
```

Otros comandos: `pnpm db:down` para detenerlo y `pnpm db:logs` para seguir sus registros.

### Por qué el puerto 5433 y no el 5432

Es habitual tener una instalación nativa de PostgreSQL en la máquina ocupando el 5432. Si el
contenedor usara ese mismo puerto, las conexiones irían a la instancia nativa en lugar de al
contenedor, y el síntoma sería un desconcertante:

```text
Error 28000: no existe el rol "ecosoap"
```

Usar 5433 evita el choque sin obligar a nadie a desinstalar su PostgreSQL local. Si en tu máquina
el 5433 también está ocupado, cambia `POSTGRES_PORT` en tu `.env` y ajusta el puerto dentro de
`DATABASE_URL` en consecuencia: ambos deben coincidir.

Para comprobar qué ocupa un puerto en Windows:

```powershell
Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object OwningProcess
```

## 5. Cliente de Prisma

```bash
pnpm --filter backend prisma:generate
```

El cliente se genera en `backend/src/generated/prisma`, que está en `.gitignore`: es código
derivado del esquema y cada integrante lo regenera en su máquina.

En esta etapa `schema.prisma` no tiene modelos de negocio ni migraciones; eso llega con el diseño
del modelo de datos.

## 6. Ejecución

```bash
pnpm dev     # backend y frontend en paralelo
```

O por separado:

```bash
pnpm --filter backend start:dev
pnpm --filter frontend dev
```

| Servicio     | URL                              |
| ------------ | -------------------------------- |
| Frontend     | http://localhost:5173            |
| API          | http://localhost:3000/api        |
| Swagger      | http://localhost:3000/api/docs   |
| Health check | http://localhost:3000/api/health |

Si todo está bien, `GET /api/health` responde `200` con `"database": "up"`, y la pantalla del
frontend muestra PostgreSQL como «Conectada».

## 7. Calidad

```bash
pnpm lint           # ESLint en backend y frontend
pnpm format         # Prettier sobre todo el repositorio
pnpm format:check   # comprueba sin modificar
pnpm build          # compila ambos proyectos
```

Prettier está configurado una sola vez en la raíz y aplica a los dos proyectos. ESLint está
configurado por proyecto porque los entornos son distintos: Node con decoradores en el backend,
navegador con React en el frontend.

## 8. Pruebas

```bash
pnpm --filter backend test       # unitarias (todavía no hay ninguna)
pnpm --filter backend test:e2e   # extremo a extremo
```

La prueba e2e **requiere PostgreSQL en ejecución** (`pnpm db:up`), porque verifica una conexión
real: lo que está en duda es precisamente la infraestructura.

## 9. Problemas frecuentes

| Síntoma                                      | Causa y solución                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Error 28000: no existe el rol "ecosoap"`    | Estás conectando a un PostgreSQL nativo, no al contenedor. Ver sección 4.                   |
| `EADDRINUSE :::3000`                         | Ya hay un backend corriendo. Ciérralo antes de arrancar otro.                               |
| Contenedor en bucle de reinicio, `unhealthy` | Volumen con estructura de una versión anterior. `docker compose down -v` y arriba de nuevo. |
| `Ignored build scripts: prisma...`           | Falta aprobar el script en `onlyBuiltDependencies` de `pnpm-workspace.yaml`.                |
| Errores `EPERM`/`EBUSY` al instalar          | El repositorio está dentro de una carpeta sincronizada. Muévelo fuera.                      |
| El frontend dice «Sin respuesta»             | El backend no está corriendo, o `VITE_API_URL` apunta a otro puerto.                        |

## 10. Flujo de trabajo

```bash
git checkout develop
git pull origin develop
git checkout -b feature/mi-funcionalidad
# ... trabajar, commits pequeños con Conventional Commits ...
git push -u origin feature/mi-funcionalidad
# abrir pull request hacia develop
```

Nadie fusiona su propio pull request sin la revisión de otro integrante.
