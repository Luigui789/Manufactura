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

`JWT_SECRET` es obligatorio, con al menos 32 caracteres. El marcador `change-me` de `.env.example`
es deliberadamente inválido. Genera un valor aleatorio y guárdalo solo en `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

No uses prefijo `VITE_`. Rotarlo y reiniciar el backend revoca todas las sesiones: procedimiento
de emergencia, no recuperación de contraseñas. En producción la cookie exige HTTPS (`Secure`);
frontend y API deben permanecer en el mismo sitio para `SameSite=Strict`. En local usa
`localhost` en ambos, sin mezclarlo con `127.0.0.1`.

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

`schema.prisma` y las migraciones contienen Foundation y `auth_rbac`. Aplica las migraciones existentes:

```bash
pnpm --filter backend exec prisma migrate deploy
```

Después de aplicar las migraciones, el
seed mínimo se ejecuta con `pnpm --filter backend db:seed`: cinco roles y un almacén, sin usuario
administrador.

### Crear el primer administrador

`admin:create` lee el entorno del proceso antes de iniciar Nest; no basta añadir `ADMIN_*` a
`.env`. Define las tres variables en la shell. La contraseña se pide sin mostrarla en la consola
ni escribirla como literal en el historial:

```powershell
$env:ADMIN_EMAIL = Read-Host 'Correo del primer administrador'
$env:ADMIN_FULL_NAME = Read-Host 'Nombre completo'
$adminPasswordInput = Read-Host 'Contraseña (15–128 caracteres)' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPasswordInput).Password
try { pnpm --filter backend admin:create }
finally {
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
pnpm --filter backend admin:create
unset ADMIN_PASSWORD ADMIN_EMAIL ADMIN_FULL_NAME
```

El comando normaliza correo y contraseña, calcula Argon2id y audita como SYSTEM. Falla si ya hay
un ADMIN activo o el correo existe; nunca modifica usuarios. El bootstrap queda sin cambio
pendiente. Los demás administradores se crean desde el ERP. No guardes `ADMIN_PASSWORD` en `.env`.

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

Si todo está bien, `GET /api/health` responde `200` con `"database": "up"`, y el frontend muestra
login. Ingresa con el primer ADMIN; `/users` permite altas y acciones confirmadas. Las cuentas
temporales solo pueden cambiar contraseña o salir antes de acceder al menú. Logout cierra todas
las sesiones del usuario. En Swagger, ejecuta `POST /api/auth/login`: el navegador guarda la
cookie `HttpOnly` y la envía automáticamente a las otras rutas; no pegues el JWT manualmente.

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
pnpm --filter backend test       # unitarias de guards, hashing, snapshots y CLI
pnpm --filter backend test:e2e   # extremo a extremo
pnpm --filter frontend test      # Vitest + RTL, incluye F1–F6
```

La prueba e2e **requiere PostgreSQL en ejecución** (`pnpm db:up`), porque verifica una conexión
real. Las suites que escriben exigen una base dedicada terminada en `_test`; una URL de trabajo
se rechaza antes de ejecutar. Crea esa base, aplica migraciones y seed con esa misma URL y luego
ejecuta e2e. Las variables se definen solo en el proceso de prueba; no cambies `.env` para ello.

Ejemplo en PowerShell, partiendo del `.env` local ya configurado:

```powershell
$testConnection = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1).Substring(13).Trim('"')
$env:DATABASE_URL = $testConnection -replace '/ecosoap_erp(?=\?|$)', '/ecosoap_auth_clean_test'
if (!(New-Object Uri($env:DATABASE_URL)).AbsolutePath.EndsWith('_test')) { throw 'Se requiere una base _test' }
$env:NODE_ENV = 'test'
try {
  # Crear una sola vez; si ya existe, no recrear ni resetear.
  docker compose exec -T postgres createdb -U ecosoap ecosoap_auth_clean_test
  pnpm --filter backend exec prisma migrate deploy
  pnpm --filter backend db:seed
  pnpm --filter backend test:e2e
} finally { Remove-Item Env:DATABASE_URL, Env:NODE_ENV -ErrorAction SilentlyContinue }
```

Si cambiaste el usuario/base del `.env`, ajusta el ejemplo. Las pruebas acumulan auditoría
append-only: no borran sus filas. El límite de intentos usa memoria por instancia y vuelve a
cero al reiniciar; detrás de un proxy configura `trust proxy` antes de confiar en la IP.

### GitHub Actions

El workflow `.github/workflows/ci.yml` publica el check `Quality and tests` para PR hacia
`develop`/`main` y pushes a esas ramas. Usa Ubuntu 24.04, Node 22.16.0, la versión de pnpm del
`packageManager` y Actions fijadas por SHA. Instala con `--frozen-lockfile`, genera Prisma,
aplica migraciones y seed, y ejecuta lint, formato, build, unitarias backend, frontend y e2e.

PostgreSQL 18 vive en un servicio efímero con base `ecosoap_ci_test`. La autenticación `trust`
solo corresponde a ese servicio de pruebas, sin datos reales ni contraseñas almacenadas. El JWT
secreto se genera aleatoriamente en cada ejecución, se enmascara y solo vive en el entorno del
job. No se copia `.env`, no se configura ningún secreto de producción y no se publican builds,
logs ni bases como artefactos. El job tiene permisos `contents: read` y un límite de 20 minutos.

Ante un fallo, abre la ejecución del PR y consulta el primer paso fallido. La aprobación humana
y el merge siguen la política del equipo; este workflow no modifica reglas de protección.

## 9. Problemas frecuentes

| Síntoma                                      | Causa y solución                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Error 28000: no existe el rol "ecosoap"`    | Estás conectando a un PostgreSQL nativo, no al contenedor. Ver sección 4.                   |
| `EADDRINUSE :::3000`                         | Ya hay un backend corriendo. Ciérralo antes de arrancar otro.                               |
| Contenedor en bucle de reinicio, `unhealthy` | Volumen con estructura de una versión anterior. `docker compose down -v` y arriba de nuevo. |
| `Ignored build scripts: prisma...`           | Falta aprobar el script en `onlyBuiltDependencies` de `pnpm-workspace.yaml`.                |
| Errores `EPERM`/`EBUSY` al instalar          | El repositorio está dentro de una carpeta sincronizada. Muévelo fuera.                      |
| «No se pudo conectar con el servidor»        | El backend no está corriendo, o `VITE_API_URL` apunta a otro puerto.                        |

## 10. Flujo de trabajo

```bash
git checkout develop
git pull origin develop
git checkout -b feature/mi-funcionalidad
# ... trabajar, commits pequeños con Conventional Commits ...
git push -u origin feature/mi-funcionalidad
# abrir pull request hacia develop
```

Todo cambio se integra por PR hacia `develop`; nadie trabaja directamente sobre `develop` ni
`main`. Luigui789 puede fusionar sus propios PR tras verificar diff y checks. Los otros dos
integrantes requieren al menos una aprobación de otro miembro antes del merge. `main` conserva
bloques estables. La política rige desde 2026-10-01 y no modifica las desviaciones históricas.
