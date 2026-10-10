# Desarrollo con Docker — EcoSoap ERP

## Requisitos

Solo necesitas Git y Docker Desktop iniciado con contenedores Linux. Comprueba
`docker compose version`: se requiere Compose **2.32.2 o posterior**. Node y pnpm
corren dentro de los contenedores; no hace falta instalarlos en tu computadora.

## Primera instalación

```bash
git clone https://github.com/Luigui789/Manufactura.git
cd Manufactura
git switch develop
```

Copia `.env.example` como `.env` (`Copy-Item .env.example .env` en PowerShell o
`cp .env.example .env` en Bash). Si ya tienes `.env`, conserva tus valores.
Genera un secreto con Docker y pega el resultado en `JWT_SECRET` dentro de `.env`:

```bash
docker run --rm node:22.16.0-bookworm-slim node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

El marcador `change-me` falla la validación a propósito. `.env` no se versiona ni se
copia a las imágenes. El frontend solo recibe `FRONTEND_URL` y `VITE_API_URL`.

Desde la raíz del repositorio, arranca los tres servicios:

```bash
docker compose up --build --watch
```

La primera construcción descarga Node, PostgreSQL y las dependencias de pnpm;
las siguientes reutilizan la caché. Espera a que el backend esté `healthy` y Vite
anuncie su URL. En otra terminal, aplica el seed **una sola vez por base nueva**:

```bash
docker compose run --rm --no-deps backend pnpm db:seed
```

El seed existente crea los cinco roles y el almacén principal. No crea usuarios.
Se ejecuta por separado para evitar que cada reinicio vuelva a aplicar los nombres
del seed sobre datos ya configurados por el equipo.

### Primer administrador

En PowerShell, solicita los datos sin escribir la contraseña en el historial:

```powershell
$env:ADMIN_EMAIL = Read-Host 'Correo del primer administrador'
$env:ADMIN_FULL_NAME = Read-Host 'Nombre completo'
$adminPasswordInput = Read-Host 'Contraseña (15–128 caracteres)' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPasswordInput).Password
try {
  docker compose run --rm --no-deps -e ADMIN_EMAIL -e ADMIN_FULL_NAME -e ADMIN_PASSWORD backend pnpm admin:create
} finally {
  Remove-Item Env:ADMIN_PASSWORD, Env:ADMIN_EMAIL, Env:ADMIN_FULL_NAME -ErrorAction SilentlyContinue
  $adminPasswordInput.Dispose()
}
```

En Bash:

```bash
read -r -p 'Correo: ' ADMIN_EMAIL
read -r -p 'Nombre: ' ADMIN_FULL_NAME
read -r -s -p 'Contraseña (15–128 caracteres): ' ADMIN_PASSWORD
export ADMIN_EMAIL ADMIN_FULL_NAME ADMIN_PASSWORD
docker compose run --rm --no-deps -e ADMIN_EMAIL -e ADMIN_FULL_NAME -e ADMIN_PASSWORD backend pnpm admin:create
unset ADMIN_PASSWORD ADMIN_EMAIL ADMIN_FULL_NAME
```

El comando existente calcula Argon2id y audita el alta. Si ya hay un administrador
activo, se niega a crear otro; los demás usuarios se administran desde el ERP.
No guardes `ADMIN_PASSWORD` en `.env`.

## Uso diario

```bash
docker compose up --build --watch
```

| Servicio | URL                              |
| -------- | -------------------------------- |
| Frontend | http://localhost:5173            |
| API      | http://localhost:3000/api        |
| Swagger  | http://localhost:3000/api/docs   |
| Health   | http://localhost:3000/api/health |

El navegador usa `localhost` para ambos servicios, necesario para las cookies de
sesión y CORS. El backend se conecta internamente a `postgres:5432`; el puerto
5433 solo sirve para conexiones desde tu computadora. Su `DATABASE_URL` se construye
con `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`, codificando caracteres
reservados. La `DATABASE_URL` del `.env` sigue disponible para el flujo local con pnpm.

Compose Watch sincroniza el código y Nest/Vite lo recargan. `node_modules`, el cliente
Prisma generado y los builds permanecen dentro de Linux. Los cambios de dependencias
reconstruyen las imágenes con `--frozen-lockfile`; un lockfile desactualizado falla.
Los cambios en `backend/prisma` reconstruyen el backend, regeneran el cliente y
aplican las migraciones compartidas mediante `migrate deploy`. El arranque no usa `db push`,
`migrate dev`, reset ni edición de migraciones ya compartidas.

Después de cambiar `.env`, detén y vuelve a ejecutar el comando de arranque para
recrear los servicios con las nuevas variables. Si cambias puertos, mantén alineados:

- `PORT` y el puerto de `VITE_API_URL` para la API.
- `FRONTEND_PORT` y el puerto de `FRONTEND_URL` para el frontend.
- `POSTGRES_PORT` y la `DATABASE_URL` local, si también usas pnpm fuera de Docker.

Los puertos publicados solo escuchan en `127.0.0.1`. Este Compose corresponde a
desarrollo local con Nest Watch y Vite; un despliegue de producción requiere otra
configuración de ejecución, HTTPS y secretos.

## Estado, registros y parada

```bash
docker compose ps
docker compose logs -f backend frontend
docker compose down
```

`Ctrl+C` detiene el arranque con Watch. `docker compose down` elimina los contenedores
y la red, conservando `ecosoap-postgres-data`. Al arrancar nuevamente se aplican solo
migraciones pendientes; no se repite el seed ni se borran datos.
**No uses `down -v` para detener el proyecto**: eliminaría el volumen de la base.
Cambiar las credenciales del `.env` tampoco cambia las de una base ya inicializada.

Para ver la aplicación sin sincronizar ediciones:

```bash
docker compose up --build -d --wait
```

Si prefieres ejecutar Node/pnpm en tu computadora, sigue [setup.md](setup.md):
`pnpm db:up` levanta solamente PostgreSQL. No arranques ambos modos a la vez en los
mismos puertos.

## Comprobaciones dentro de Docker

```bash
docker compose run --rm --no-deps backend pnpm lint
docker compose run --rm --no-deps backend pnpm test
docker compose run --rm --no-deps frontend pnpm lint
docker compose run --rm --no-deps frontend pnpm test
```

Estos comandos usan el código de la última imagen construida: ejecuta primero
`docker compose build` si cambiaste archivos. Las pruebas e2e mantienen la protección
de base terminada en `_test`; para ejecutarlas configura explícitamente
`-e NODE_ENV=test -e DATABASE_URL=...` en `docker compose run`, con una base de
pruebas ya migrada y sembrada. No apuntes esas pruebas a la base de trabajo.

Compose Watch y la instalación de pnpm siguen la documentación de
[Docker](https://docs.docker.com/compose/how-tos/file-watch/) y
[pnpm](https://pnpm.io/docker).
