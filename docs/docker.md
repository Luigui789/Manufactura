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

Desde la raíz del repositorio, arranca los cuatro servicios (PostgreSQL, backend,
frontend y Mosquitto):

```bash
docker compose up --build --watch
```

La primera construcción descarga Node, PostgreSQL, Mosquitto y las dependencias de pnpm;
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
y la red, conservando `ecosoap-postgres-data` y `ecosoap-mosquitto-data`. Al arrancar
nuevamente se aplican solo migraciones pendientes; no se repite el seed ni se borran datos.
**No uses `down -v` para detener el proyecto**: eliminaría los volúmenes de PostgreSQL y MQTT.
Cambiar las credenciales del `.env` tampoco cambia las de una base ya inicializada.

Para ver la aplicación sin sincronizar ediciones:

```bash
docker compose up --build -d --wait
```

Si prefieres ejecutar Node/pnpm en tu computadora, sigue [setup.md](setup.md):
`pnpm db:up` levanta solamente PostgreSQL. No arranques ambos modos a la vez en los
mismos puertos.

## IIoT / MQTT con Mosquitto

Eclipse Mosquitto será el broker entre sensores/PLC simulados y el futuro módulo IIoT
de EcoSoap para fabricación de jabón en barra y líquido. **La Fase 1 solo instala la
infraestructura MQTT; el backend todavía no se conecta al broker.**

Se usa `eclipse-mosquitto:2.0.22`, con configuración versionada en
`docker/mosquitto/mosquitto.conf` montada en modo de solo lectura. El puerto del host
es `127.0.0.1:1883`, configurable mediante `MQTT_PORT` en `.env`; dentro de Docker
el broker escucha en `mosquitto:1883`. No cambies los puertos del ERP.

**Esta configuración es exclusivamente para desarrollo local:** permite conexiones
anónimas (`allow_anonymous true`) sin TLS. No es apropiada para producción. Usuarios,
contraseñas, ACL y certificados se incorporarán en una futura etapa de hardening.
El acceso anónimo también está disponible para otros contenedores de la red Compose.

Para trabajar solo con el broker, sin levantar el ERP:

```bash
docker compose up -d --wait mosquitto
docker compose ps mosquitto
docker compose logs -f mosquitto
docker compose stop mosquitto
```

Con pnpm en el host, los equivalentes son `pnpm mqtt:up`, `pnpm mqtt:logs` y
`pnpm mqtt:down`. `mqtt:up` inicia en segundo plano; espera a que `ps` muestre
`healthy` antes de probar. `Ctrl+C` sale de la vista de logs sin detener el broker.

El healthcheck usa `mosquitto_sub`, incluido en la imagen, para recibir un mensaje
de `$SYS/broker/version` con `-C 1 -W 3`. Comprueba conexión, suscripción y recepción
MQTT con un tiempo acotado, sin instalar dependencias ni publicar mensajes de prueba.
Las opciones se describen en el [manual oficial de mosquitto_sub](https://mosquitto.org/man/mosquitto_sub-1.html).

Los datos MQTT persistentes (por ejemplo, mensajes retenidos y sesiones durables) se
guardan en `/mosquitto/data/`, mediante el volumen `ecosoap-mosquitto-data`, que se
conserva al detener o recrear el contenedor. Los mensajes normales de la prueba
siguiente no son retenidos. Los logs salen por stdout y se consultan con Compose.
Después de editar `mosquitto.conf`, ejecuta `docker compose restart mosquitto` para
que el broker relea la configuración; Compose Watch no recarga este archivo.

### Prueba manual MQTT

No necesitas instalar `mosquitto_pub` ni `mosquitto_sub` en tu computadora: ambos
clientes están en el contenedor. Ejecuta los comandos desde la raíz del repositorio.

1. Inicia el broker y espera su healthcheck:

   ```bash
   docker compose up -d --wait mosquitto
   ```

2. En la terminal A, inicia el subscriber:

   ```bash
   docker compose exec mosquitto mosquitto_sub -h 127.0.0.1 -p 1883 -t ecosoap/test -C 1 -d
   ```

   Espera el mensaje de depuración `Subscribed` (confirma el SUBACK) antes de publicar.
   El subscriber espera un mensaje y termina después de recibirlo; puedes cancelar
   la espera con `Ctrl+C`.

3. En la terminal B, publica:

   ```bash
   docker compose exec mosquitto mosquitto_pub -h 127.0.0.1 -p 1883 -t ecosoap/test -m "EcoSoap MQTT OK" -q 1
   ```

4. En la terminal A debe aparecer `EcoSoap MQTT OK`, además de los mensajes de
   depuración. Esto verifica **publisher → Mosquitto → subscriber** en `ecosoap/test`.
   Para repetir, vuelve a iniciar el subscriber y luego publica. Si publicaste antes
   del SUBACK, repite la publicación: la prueba no utiliza mensajes retenidos.

Estos clientes se ejecutan dentro del contenedor y usan su puerto interno 1883,
incluso si cambiaste `MQTT_PORT` en el host. Para consultar el mapeo publicado usa
`docker compose port mosquitto 1883`. Para ver los registros o detener el broker:

```bash
docker compose logs --tail 50 mosquitto
docker compose stop mosquitto
```

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
