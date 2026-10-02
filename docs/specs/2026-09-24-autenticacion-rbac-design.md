# Diseño — Etapa 3: Autenticación, RBAC y auditoría de acceso

- **Proyecto:** EcoSoap ERP (`project-id: ecosoap-erp`)
- **Repositorio:** `Luigui789/Manufactura` · rama `feature/auth`, creada desde `develop` en `dbda607`
- **Fecha:** 2026-09-24
- **Estado:** `Aprobado` el 2026-10-01 (revisión 3). Las revisiones 1 y 2 se aprobaron con ajustes
  que esta versión incorpora.
- **Prioridad de la etapa:** seguridad → auditabilidad → integridad → simplicidad → UX.
- **Requisitos:** RNF-002 y RNF-007 (`OFICIAL`); D-AUT-001 y D-AUD-003 (`DERIVADO`); P-AUT-001 y
  P-AUD-001 a P-AUD-003 (`PROPUESTO`). Véase [`requirements.md`](../requirements.md).
- **Fuentes:** Entrega 1 oficial (a través de `requirements.md`), `docs/`, ADR, código,
  migraciones, pruebas e historial de Git. La bóveda de Obsidian no estuvo disponible (el servidor
  no respondió) y **no fue fuente** de este diseño.

## Historial de revisiones

| Revisión | Fecha      | Cambio                                                                                                                                                                                                                                                                                                                                                                        |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | 2026-09-24 | Propuesta inicial, decisiones D1 a D14                                                                                                                                                                                                                                                                                                                                        |
| 2        | 2026-09-24 | Revisión del equipo: cookie con `Path=/`; versión de sesión también al cambiar el rol; protección de origen compatible con NestJS 12.0.4; `mustChangePassword`; `@Authenticated()`; autoprotección acotada; política alineada parcialmente con NIST; sin fallback de Argon2id; pruebas de frontend; lista exacta de dependencias; una sola configuración del `ValidationPipe` |
| 3        | 2026-10-01 | Aprobación: candado del rol `ADMIN` solo en operaciones que pueden alterar los ADMIN activos; `admin:create` solo como bootstrap; protección de origen descrita como alineada con el enfoque de NestJS 12.1; cierre de los cinco puntos de §21                                                                                                                                |

Correspondencia con lo solicitado para revisar antes de escribir código:

| Pedido                               | Sección  |
| ------------------------------------ | -------- |
| Arquitectura de autenticación        | §2       |
| Estrategia JWT                       | §3       |
| Almacenamiento y transmisión         | §4       |
| Algoritmo de hashing y política      | §5       |
| Alta del primer ADMIN                | §6       |
| Modelo de autorización               | §7       |
| Endpoints                            | §8       |
| Estados de usuario y último ADMIN    | §9       |
| Logout                               | §10      |
| Eventos de auditoría                 | §11      |
| Migración propuesta                  | §12      |
| Arquitectura frontend y dependencias | §13      |
| Amenazas principales                 | §14      |
| Plan de pruebas                      | §15      |
| Documentación y ADR                  | §16, §17 |
| Estado de las decisiones             | §21      |

---

## 0. Decisiones

| #   | Decisión                | Contenido aprobado                                                                                                                             | Estado (2026-10-01)              |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| D1  | Transporte de la sesión | Cookie `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` en producción; CORS solo del frontend; protección de origen                           | Aprobada                         |
| D2  | Revocación              | `users.token_version`; sube en logout, desactivación, cambio y restablecimiento de contraseña y cambio de rol; JWT con `sub` y `ver`           | Aprobada                         |
| D3  | Algoritmo               | Argon2id, 19 MiB, 2 iteraciones, paralelismo 1; si no funciona, se detiene y se reporta                                                        | Aprobada                         |
| D4  | Política                | 15 a 128 caracteres, sin reglas de composición; alineada parcialmente con NIST, sin afirmar cumplimiento                                       | Aprobada                         |
| D5  | Contraseñas temporales  | Cambio propio y restablecimiento por ADMIN, con `mustChangePassword`                                                                           | Aprobada                         |
| D6  | Autorización            | `@Public()`, `@Authenticated()`, `@Roles(...)`; sin declaración, se deniega                                                                    | Aprobada                         |
| D7  | Último ADMIN            | Nunca 0 ADMIN activos; candado del rol `ADMIN` solo si la operación afecta a un ADMIN; autoprotección en desactivar, cambiar rol y restablecer | Aprobada                         |
| D8  | Auditoría               | `CHANGE_ROLE`, `CHANGE_PASSWORD`, `RESET_PASSWORD`; código de rol en snapshots; nunca credenciales                                             | Aprobada                         |
| D9  | Límite de intentos      | 10 por minuto e IP en login, en memoria; limitaciones documentadas                                                                             | Aprobada                         |
| D10 | Primer ADMIN            | `admin:create` solo como bootstrap: falla si existe un ADMIN activo o el correo; `mustChangePassword = false`                                  | Aprobada, solo bootstrap         |
| D11 | Migración               | `auth_rbac`: `token_version`, `must_change_password`, `CHECK` de correo, tres acciones                                                         | Aprobada                         |
| D12 | Dependencias            | Lista exacta de §13 y §5                                                                                                                       | Aprobada                         |
| D13 | Pruebas del frontend    | Vitest + React Testing Library con cobertura mínima, además de pruebas manuales                                                                | Aprobada con pruebas de frontend |
| D14 | Validación              | `ValidationPipe` solo como `APP_PIPE`; se elimina `useGlobalPipes` de `main.ts`                                                                | Aprobada                         |

Todas quedaron **aprobadas** el 2026-10-01; §21 recoge el cierre de los puntos adicionales.

---

## 1. Objetivo y alcance

Al terminar la etapa, esta cadena funciona y queda auditada:

```text
usuario → login → credenciales válidas → sesión → el backend conoce identidad y rol
        → RBAC autoriza o rechaza → acción auditada
```

### Incluido

Login con correo y contraseña; hash Argon2id; JWT en cookie `HttpOnly`; protección de origen para
peticiones que modifican; guards globales de autenticación, cambio de contraseña pendiente y
autorización; decoradores `@Public()`, `@Authenticated()`, `@Roles()`,
`@AllowPendingPasswordChange()` y `@CurrentUser()`; alta segura del primer administrador;
administración de usuarios por `ADMIN` (listar, consultar, crear, activar, desactivar, cambiar rol,
restablecer contraseña); contraseñas temporales con cambio obligatorio; cambio de la contraseña
propia; protección del último administrador; auditoría de §11; límite de intentos; Swagger con
cookie; pruebas unitarias y e2e del backend; pruebas mínimas del frontend con Vitest y React
Testing Library; frontend de login, rutas protegidas, cambio obligatorio de contraseña, layout con
menú por rol y administración de usuarios con TanStack Query; documentación.

### Excluido explícitamente

Compras, Producción, Ventas, CRUD de inventario, BOM, órdenes, recepciones, despachos, dashboard,
reportes e ISA-95. Tampoco entran: refresh tokens, tabla de sesiones, MFA, recuperación por correo,
bloqueo de cuentas, caducidad de contraseñas, lista de contraseñas comprometidas, `GET /api/audit`,
`GET /api/roles`, edición de nombre o correo, cabeceras de endurecimiento HTTP, permisos granulares
y la actualización de NestJS a 12.1. §20 explica cada exclusión.

### Punto de partida verificado en `develop`

| Pieza         | Estado                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `User`        | `email` único (`TEXT`, sensible a mayúsculas), `passwordHash`, `fullName`, `roleId`, `isActive`      |
| `Role`        | Cinco códigos sembrados en el enum `RoleCode`                                                        |
| `AuditLog`    | `CHECK` de actor, par de entidad y semántica de `LOGIN`/`LOGIN_FAILED`; disparadores append-only     |
| `AuditAction` | `CREATE`, `UPDATE`, `DELETE`, `ENABLE`, `DISABLE`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `ADJUST_STOCK` |
| Usuarios      | 0; ninguna credencial en el repositorio                                                              |
| `main.ts`     | Prefijo `/api`; CORS con origen `FRONTEND_URL` y `credentials: true`; `ValidationPipe` estricto      |
| Versiones     | Node 22.16.0; pnpm 10.30.3; `@nestjs/core` 12.0.4; Express 5.2.1; Prisma 7.10; React 19.2; Vite 8    |

---

## 2. Arquitectura de autenticación

### Recorrido de una petición

```text
Petición HTTP
 ├─ cookie-parser                       lee la cookie ecosoap_session (NestJS 12.0.4 no lo hace solo)
 ├─ RequestContextMiddleware            genera requestId y captura la IP (AsyncLocalStorage)
 │
 ├─ CrossOriginProtectionGuard  global  métodos que modifican: algoritmo de NestJS 12.1 (§4)
 ├─ JwtAuthGuard                global  @Public() pasa; si no: JWT, usuario activo y versión
 ├─ PasswordChangeRequiredGuard global  cambio pendiente → solo rutas @AllowPendingPasswordChange()
 ├─ RolesGuard                  global  evalúa la política: Public, Authenticated o Roles; sin ella → 403
 ├─ ThrottlerGuard              ruta    login y cambio de contraseña
 │
 ├─ ValidationPipe              APP_PIPE whitelist + forbidNonWhitelisted; única configuración
 ├─ Controller                          HTTP: cookie, código de estado, { data, message }
 ├─ Service                             reglas, transacción, auditoría
 └─ Prisma → PostgreSQL                 CHECK, índices únicos, disparadores
```

NestJS ejecuta los guards globales en el orden en que se registran y después los de ruta. Los
servicios no conocen HTTP: reciben el usuario autenticado como dato y devuelven el token; el
controller escribe la cookie.

### Módulos

```text
backend/src/
├── main.ts                    prefijo, CORS, cookie-parser, Swagger con cookie; sin useGlobalPipes
├── app.module.ts              + AuditModule, AuthModule, UsersModule; ValidationPipe como APP_PIPE
├── config/env.validation.ts   + JWT_SECRET obligatorio de al menos 32 caracteres
├── common/
│   ├── request-context/       AsyncLocalStorage con requestId e ipAddress; middleware
│   ├── pagination/            PaginationQueryDto y tipo de respuesta paginada
│   └── normalize-email.ts     trim + minúsculas; lo usan DTO, servicios y CLI
├── audit/
│   ├── audit.service.ts       record(tx, evento): semántica actor/entidad, contexto, snapshots
│   └── audit-snapshots.ts     lista permitida por entidad y diferencia de campos
├── auth/
│   ├── auth.module.ts         JwtModule, ThrottlerModule y los cuatro APP_GUARD
│   ├── auth.controller.ts     login, me, logout, change-password
│   ├── auth.service.ts
│   ├── password-hasher.service.ts
│   ├── session-cookie.ts      nombre y atributos de la cookie
│   ├── access-policy.ts       clave de metadatos, tipos y regla de una política por destino
│   ├── guards/                cross-origin-protection, jwt-auth, password-change-required, roles
│   ├── decorators/            public, authenticated, roles, allow-pending-password-change, current-user
│   ├── dto/                   login, change-password
│   └── types/                 authenticated-user, jwt-payload
├── users/
│   ├── users.controller.ts    listar, consultar, crear, activar, desactivar, rol, restablecer
│   ├── users.service.ts       reglas, protocolo del último ADMIN, createInitialAdmin
│   ├── dto/                   create-user, change-role, reset-password, user-response
│   └── user-response.mapper.ts  única conversión de User a respuesta pública
├── cli/
│   └── create-admin.ts        alta del primer ADMIN en un contexto Nest sin HTTP
└── health/                    + @Public()
```

Las dependencias van en un solo sentido, sin ciclos: `UsersModule → AuthModule → AuditModule →
PrismaModule`. `AuthService` consulta usuarios con Prisma directamente y no depende de
`UsersService`. `AuthModule` exporta `PasswordHasherService`, que usan ambos.

### Una sola configuración del `ValidationPipe`

Las pruebas e2e construyen la aplicación con `Test.createTestingModule` y **no ejecutan
`main.ts`**: hoy el `ValidationPipe` global no existe en las pruebas. El pipe se registra, con las
mismas opciones, como proveedor `APP_PIPE` de `AppModule`, y **se elimina** `app.useGlobalPipes`
de `main.ts`. Queda una única configuración efectiva, la misma en producción y en pruebas.
`cookie-parser` y `RequestContextMiddleware` se registran en `AppModule.configure()` por el mismo
motivo.

---

## 3. Estrategia JWT

| Aspecto             | Decisión                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Biblioteca          | `@nestjs/jwt` 12.0.2 (usa `jsonwebtoken` 9); sin Passport                                         |
| Algoritmo           | HS256, fijado también al verificar (`algorithms: ['HS256']`)                                      |
| Payload propio      | `sub` (id del usuario) y `ver` (versión de sesión); la librería añade `iat` y `exp`               |
| Duración            | 8 horas, una jornada; sin renovación                                                              |
| Transmisión         | Cookie `HttpOnly` (§4); el token nunca viaja en el cuerpo de una respuesta                        |
| Invalidación lógica | Expiración; `ver` distinto de `users.token_version`; usuario inactivo o inexistente               |
| `token_version` + 1 | Logout, desactivación, cambio de la contraseña propia, restablecimiento por ADMIN y cambio de rol |
| Invalidación global | Rotar `JWT_SECRET` invalida todas las sesiones; procedimiento de emergencia documentado           |

```json
{ "sub": "0192…-uuid-v7", "ver": 3, "iat": 1790000000, "exp": 1790028800 }
```

`iat` y `exp` son claims registrados que añade `jsonwebtoken`; `exp` es imprescindible para la
expiración de 8 horas. No forman parte de los datos que decide el sistema.

### Qué no lleva el token

- **Rol.** El backend nunca confía en un rol guardado en el token: en cada petición lee el rol
  actual de la base. Además, cambiar el rol invalida las sesiones anteriores.
- **Correo, nombre y `mustChangePassword`.** Son datos que pueden cambiar o que no necesita la
  verificación; `GET /api/auth/me` los proporciona.

### Sin Passport

Hay una única estrategia de autenticación. Un guard corto que verifica el token y carga al usuario
se lee y se defiende mejor que la indirección de estrategias de Passport, y evita tres dependencias
(`@nestjs/passport`, `passport`, `passport-jwt`).

### Verificación en cada petición

```text
1. Leer la cookie ecosoap_session              ausente → 401 «Sesión requerida»
2. Verificar firma HS256 y exp                 inválida o expirada → 401 «Sesión inválida o expirada»
3. Validar la forma del payload (sub, ver)     inválida → 401
4. Cargar usuario y código de rol por id       inexistente → 401
5. Comprobar isActive                          false → 401
6. Comprobar ver === token_version             distinto → 401
7. request.user = { id, email, fullName, role, mustChangePassword }
```

Cuesta una consulta por clave primaria en cada petición autenticada. Se acepta de forma deliberada:
es lo que garantiza que `isActive`, la versión de sesión y el rol actual de la base mandan siempre.

### `JWT_SECRET`

- Solo en `.env`. `.env.example` lleva `JWT_SECRET=change-me`, que es **deliberadamente inválido**:
  la validación de arranque exige al menos 32 caracteres.
- Generación documentada:
  `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
- Nunca se registra en logs ni aparece en respuestas o auditoría (pruebas S1 y S2 de §15).

### Sin refresh tokens

Una sesión de 8 horas y un nuevo login al día siguiente cubren el uso de un ERP de planta, y la
versión de sesión da la revocación necesaria. Los refresh tokens exigirían almacenarlos, rotarlos y
detectar su reutilización: complejidad sin beneficio proporcional para este alcance.

---

## 4. Almacenamiento y transmisión de la sesión

### Comparación

| Criterio          | `Authorization: Bearer` con token en JavaScript                                           | Cookie `HttpOnly`                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| XSS               | Un script inyectado lee el token de `localStorage`, lo exfiltra y lo usa hasta que expira | El script no puede leer el token; solo puede actuar mientras la página esté abierta |
| CSRF              | Inmune: el navegador no añade la cabecera por su cuenta                                   | Expuesta por diseño: exige `SameSite` y verificación de origen                      |
| CORS              | La cabecera provoca preflight; sin credenciales                                           | `credentials: true` con origen explícito, ya configurado                            |
| Recarga de página | En memoria se pierde; en `localStorage` persiste y queda expuesto                         | Persiste sin exponerse                                                              |
| SPA con Vite      | Directo                                                                                   | Directo; `localhost:5173` y `localhost:3000` son el mismo sitio                     |
| Backend separado  | Funciona entre sitios distintos                                                           | Exige el mismo sitio (misma raíz de dominio) o un proxy inverso                     |
| Swagger           | Botón _Authorize_ nativo                                                                  | Ejecutar el login desde Swagger deja la cookie en el navegador                      |

La decisión aprobada es la cookie `HttpOnly`: el token nunca es accesible desde JavaScript.

### Atributos de la cookie

| Atributo   | Valor                            | Motivo                                            |
| ---------- | -------------------------------- | ------------------------------------------------- |
| Nombre     | `ecosoap_session`                |                                                   |
| `HttpOnly` | `true`                           | JavaScript no puede leerla                        |
| `SameSite` | `Strict`                         | No viaja en peticiones iniciadas desde otro sitio |
| `Path`     | `/`                              | Decisión del equipo en la revisión 1              |
| `Secure`   | `true` con `NODE_ENV=production` | En desarrollo se usa HTTP sobre `localhost`       |
| `Max-Age`  | 28 800 s                         | Igual a la duración del JWT                       |
| `Domain`   | No se fija                       | Cookie limitada al host exacto                    |

Consecuencia conocida de `Path=/`: la cookie viaja a cualquier ruta del host. Como las cookies no se
aíslan por puerto, en desarrollo también la recibe el servidor de Vite en `localhost:5173`. No es
legible desde JavaScript y esos servidores la ignoran.

### CORS

Solo el origen configurado en `FRONTEND_URL`, con `credentials: true`; nunca `*` con credenciales.
Se exponen `X-Request-Id` y las cabeceras de límite que se confirmen al implementar.

### Protección de origen compatible con la versión instalada

| Comprobación                             | Resultado                                                    |
| ---------------------------------------- | ------------------------------------------------------------ |
| `@nestjs/core` instalado (lockfile)      | **12.0.4**; `@nestjs/platform-express` 12.0.4; Express 5.2.1 |
| Última versión publicada                 | 12.1.0                                                       |
| CSRF nativo `app.enableCsrfProtection()` | Existe **desde 12.1**: no disponible en 12.0.4               |
| Cookies nativas                          | Existen **desde 12.1**: no disponibles en 12.0.4             |

Conforme a la revisión, **no se actualiza NestJS en esta etapa.** Se implementa
`CrossOriginProtectionGuard`, compatible con 12.0.4: una protección de origen basada en `Origin` y
Fetch Metadata (`Sec-Fetch-Site`), alineada con el enfoque que documenta NestJS 12.1 para
`enableCsrfProtection()`. No es una copia de la implementación interna del framework; su
comportamiento lo garantizan nuestras pruebas. Con `trustedOrigins = [FRONTEND_URL]`:

```text
GET, HEAD, OPTIONS                                   → permitir
Sec-Fetch-Site = same-origin | none                  → permitir
Sec-Fetch-Site = otro valor (same-site, cross-site)  → permitir solo si Origin ∈ trustedOrigins; si no, 403
Sin Sec-Fetch-Site:
  sin Origin                                         → permitir (no es un navegador)
  host de Origin = Host de la petición               → permitir (sin mayúsculas, sin puerto por defecto)
  Origin ∈ trustedOrigins                            → permitir
  en otro caso                                       → 403
```

| Caso                                | Resultado                                         |
| ----------------------------------- | ------------------------------------------------- |
| Frontend `localhost:5173` → API     | `same-site` con origen de confianza: se permite   |
| Swagger servido por la propia API   | `same-origin`: se permite                         |
| Otra aplicación en `localhost:8080` | `same-site` sin origen de confianza: `403`        |
| Sitio ajeno                         | `cross-site`: `403` (y además no viaja la cookie) |
| supertest, curl                     | Sin cabeceras de navegador: se permite            |

Las cookies se leen con `cookie-parser` 1.4.7, el mecanismo documentado para Express antes de 12.1.
Una actualización futura a NestJS 12.1 o superior será una decisión explícita y separada: entonces
el guard podrá sustituirse por `app.enableCsrfProtection({ trustedOrigins: [FRONTEND_URL] })` y
`cookie-parser` por las cookies nativas, y las pruebas del guard servirán para comprobar que el
comportamiento observable no cambia. Lo registra el ADR 008.

`SameSite=Strict` sigue siendo la primera barrera, y los cuerpos se aceptan solo como JSON.

### Restricción de despliegue

La cookie exige que frontend y API compartan sitio: por ejemplo `erp.ecosoap.ni` y
`api.ecosoap.ni` o, mejor, el mismo origen detrás de un proxy inverso. Desplegarlos en dominios de
proveedores distintos rompería el login.

### Alternativa considerada: sesiones en base de datos

Una tabla `sessions` con identificadores opacos permitiría cerrar sesiones por dispositivo. No se
adopta: la arquitectura aprobada especifica JWT (P-AUT-001) y la versión de sesión cubre la
revocación que esta etapa necesita.

---

## 5. Contraseñas

### Algoritmo

| Opción                         | Seguridad                                                     | Windows y pnpm                                                         | Veredicto                             |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| **Argon2id** (`argon2` 0.45.1) | Primera opción de OWASP; su coste de memoria encarece las GPU | Binarios precompilados `win32-x64` y `linux-x64` en el paquete; N-API  | **Elegida**                           |
| bcrypt (`bcrypt` 6)            | Aceptable, sin coste de memoria; **trunca a 72 bytes**        | Nativo                                                                 | Descartada: truncamiento silencioso   |
| bcryptjs                       | Igual que bcrypt y más lenta                                  | JavaScript puro                                                        | Descartada: mismo límite de 72 bytes  |
| scrypt de `node:crypto`        | Aceptada por OWASP                                            | Sin dependencias                                                       | No elegida: formato propio que probar |
| Argon2 de `node:crypto`        | —                                                             | No existe en Node 22; la documentación actual la registra desde la v26 | No disponible                         |

**Primer paso de la implementación:** instalar `argon2` 0.45.1 con pnpm 10 en Windows y Node 22,
y comprobar `hash` y `verify`. pnpm 10 bloquea su script de instalación, pero el binario
precompilado se carga en tiempo de ejecución; si hace falta aprobar el script en
`onlyBuiltDependencies`, se decide con la evidencia, igual que con Prisma. **Si aparece una
incompatibilidad real, el trabajo se detiene y se reporta. No hay cambio automático a otra
estrategia.**

### Parámetros

`argon2id`, `memoryCost` 19 456 KiB (19 MiB), `timeCost` 2, `parallelism` 1: una de las
configuraciones que publica OWASP. No se usan los valores por defecto de la librería (64 MiB, 3
iteraciones, paralelismo 4) porque multiplican la memoria de cada verificación en la ruta que un
atacante puede saturar. El resultado es una cadena PHC que describe sus propios parámetros:
`$argon2id$v=19$m=19456,p=1,t=2$<sal>$<hash>` (la librería escribe los parámetros en ese
orden, comprobado el 2026-10-01).

### `PasswordHasherService`

```ts
hash(password: string): Promise<string>
verify(password: string, hash: string): Promise<boolean>
verifyAgainstDummy(password: string): Promise<false>
```

- Normaliza a NFC antes de calcular y de verificar, para que una «ñ» o una «é» escritas desde
  teclados distintos produzcan el mismo hash.
- Nunca recorta espacios.
- Un hash mal formado devuelve `false` sin propagar detalles.
- `verifyAgainstDummy` compara contra un hash ficticio calculado al arrancar; se usa cuando el
  correo no existe para no revelar por tiempo qué cuentas existen.
- Es el único lugar del backend que llama a `argon2`.

### Política

La política está **alineada parcialmente** con las recomendaciones vigentes de NIST SP 800-63B-4:
adopta su longitud mínima para contraseña como único factor, la ausencia de reglas de composición y
de caducidad periódica, la aceptación de espacios y la normalización Unicode. **No se afirma
cumplimiento de NIST:** entre otros requisitos, no se implementa en esta etapa la comparación con
listas de contraseñas comunes o comprometidas.

| Regla               | Valor                                          |
| ------------------- | ---------------------------------------------- |
| Longitud mínima     | 15 caracteres                                  |
| Longitud máxima     | 128 caracteres (NIST pide admitir al menos 64) |
| Composición         | Sin mayúscula, número ni símbolo obligatorios  |
| Espacios y acentos  | Permitidos; normalización NFC; sin recorte     |
| Caducidad periódica | No                                             |
| Lista de bloqueo    | No en esta etapa; riesgo aceptado (§14)        |

Una frase como `jabón de aceite reciclado` supera el mínimo y es más fácil de recordar que una
contraseña corta con símbolos. El login no aplica la política: solo exige un texto de 1 a 128
caracteres, porque todas las contraseñas almacenadas ya la cumplen. El frontend la repite con Zod
para ayudar al usuario; el backend decide.

### Contraseñas temporales y cambio obligatorio

| Situación                              | Contraseña resultante             | `mustChangePassword` | `token_version` |
| -------------------------------------- | --------------------------------- | -------------------- | --------------- |
| ADMIN crea un usuario                  | Temporal, elegida por el ADMIN    | `true`               | 0               |
| ADMIN restablece la contraseña         | Temporal, elegida por el ADMIN    | `true`               | + 1             |
| El usuario cambia su propia contraseña | Elegida por el usuario            | `false`              | + 1             |
| Comando `admin:create`                 | Elegida por quien ejecuta el alta | `false`              | 0               |

Así una contraseña temporal no puede convertirse en una contraseña permanente que el administrador
conoce. El cambio propio exige la contraseña actual y rechaza con `422` una nueva igual a la
actual; sin esa regla, el usuario podría «cambiar» a la misma contraseña temporal. El bloqueo del
resto del ERP mientras el cambio está pendiente lo aplica el backend (§7), no solo el frontend.

### Dónde no aparece nunca una contraseña

| Lugar         | Garantía                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------- |
| Base de datos | Solo `password_hash`                                                                          |
| Respuestas    | Un único mapeador explícito (`toUserResponse`) sobre un `select` que ni siquiera lee el hash  |
| `AuditLog`    | La lista permitida no contiene contraseña, contraseña temporal ni hash                        |
| Errores       | Mensajes de validación sin el valor recibido; el `500` genérico de NestJS no incluye detalles |
| Logs          | No se registran cuerpos de petición                                                           |
| Swagger       | Campos `format: password` sin ejemplo                                                         |
| Pruebas       | Contraseñas generadas al azar en cada ejecución; ninguna credencial fija en el repositorio    |
| Commits       | `.env` ignorado; revisión de secretos antes del PR                                            |

Recuperación por correo: fuera de alcance, sin SMTP ni requisito.

---

## 6. Alta del primer administrador

```bash
pnpm --filter backend admin:create
```

Script `"admin:create": "pnpm build && node dist/cli/create-admin.js"`, con el mismo patrón que
`db:seed`. Levanta un contexto de aplicación Nest sin HTTP y reutiliza `UsersService`: el primer
administrador pasa por la misma validación, el mismo hash y la misma auditoría que cualquier alta.

### Entrada

`ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_FULL_NAME`, leídas del entorno del proceso. Nunca se
versionan valores reales ni se añaden a `.env.example` con valor. Se descartan los argumentos de
línea de comandos, que quedan en el historial, y el prompt oculto interactivo, que falla en Git
Bash. `setup.md` indicará cómo definirlas sin dejar rastro:

```powershell
# PowerShell 5.1
$s = Read-Host 'Contraseña' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $s).Password
pnpm --filter backend admin:create
Remove-Item Env:ADMIN_PASSWORD
```

```bash
# Git Bash
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD
pnpm --filter backend admin:create
unset ADMIN_PASSWORD
```

### Protocolo

```text
1. Normalizar el correo; validar nombre y contraseña con las reglas de la API   inválidos → salida 1
2. Calcular el hash Argon2id, antes de abrir la transacción
3. BEGIN
4.   SELECT … FROM roles WHERE code = 'ADMIN' FOR UPDATE                         candado de §9
5.   ¿Existe un ADMIN activo?          sí → ROLLBACK · «ya existe un administrador activo»  → salida 1
6.   ¿Existe el correo, activo o no?   sí → ROLLBACK · «el usuario ya existe; no se modifica» → salida 1
7.   INSERT usuario: rol ADMIN, activo, mustChangePassword = false
8.   INSERT AuditLog: SYSTEM, CREATE, USER/<id>, newValues de la lista permitida
9. COMMIT → «Administrador creado: <correo>. Elimina ADMIN_PASSWORD de tu entorno y de tu .env local»
```

- Si el usuario ya existe, **falla**: nunca actualiza `password`, `role` ni `isActive` de un usuario
  existente.
- No imprime la contraseña ni el hash.
- El candado impide que dos ejecuciones simultáneas creen dos «primeros» administradores.
- **Solo bootstrap.** Si existe algún ADMIN activo, falla con un mensaje claro. No es una puerta
  lateral para crear administradores sin autenticación: una vez existe el primero, los nuevos
  administradores los crea un ADMIN autenticado desde la administración normal del ERP, con RBAC y
  `AuditLog`.

### Recuperación de emergencia

Si el único administrador pierde el acceso, un operador con acceso a PostgreSQL desactiva esa
cuenta directamente en la base y ejecuta `admin:create` con otro correo. Es el único paso fuera de
la aplicación y, por tanto, no queda auditado por ella; se documenta como procedimiento excepcional.

---

## 7. Modelo de autorización

### Tres políticas y dos auxiliares

| Decorador                       | Significado                                                               |
| ------------------------------- | ------------------------------------------------------------------------- |
| `@Public()`                     | No requiere autenticación: login y health                                 |
| `@Authenticated()`              | Cualquier usuario autenticado y activo: `me`, `logout`, `change-password` |
| `@Roles(RoleCode.ADMIN, ...)`   | Autenticación y uno de los roles declarados                               |
| `@AllowPendingPasswordChange()` | Marca las rutas usables mientras `mustChangePassword` es `true`           |
| `@CurrentUser()`                | Inyecta el `AuthenticatedUser` en el handler                              |

### Reglas

- **Denegación por defecto.** Una ruta sin `@Public()`, `@Authenticated()` ni `@Roles()` responde
  `403` y deja un error en el log del servidor. Olvidar el decorador cierra la ruta.
- **Una política por destino.** Las tres usan una sola clave de metadatos. Declarar dos en el mismo
  método o en la misma clase lanza un error al cargar la aplicación. La del método sustituye a la de
  la clase.
- Los guards son globales (`APP_GUARD`): los módulos futuros solo declaran decoradores.
- El rol se compara con el rol actual que `JwtAuthGuard` acaba de leer de la base; nunca con datos
  del cliente ni con un claim del token.
- Un rol por usuario, como ya define el modelo; sin tabla de permisos. Si un módulo necesita
  permisos más finos, se introducirán con un ADR.
- Una prueba de arquitectura recorre todas las rutas y falla si alguna no declara exactamente una
  política (§15, R5).

### Cambio de contraseña pendiente

Mientras `mustChangePassword` sea `true`, `PasswordChangeRequiredGuard` rechaza con `403` y
`error: "PASSWORD_CHANGE_REQUIRED"` toda ruta que no lleve `@AllowPendingPasswordChange()`. Solo la
llevan `GET /auth/me`, `POST /auth/change-password` y `POST /auth/logout`. La regla vive en el
backend por la regla 1 de `CLAUDE.md`: si solo la aplicara el frontend, quien conoce la contraseña
temporal —el propio administrador— podría usarla contra la API y actuar como ese usuario.

### Matriz de esta etapa

| Endpoint                         | Política        | ADMIN | COMPRAS | INVENTARIO | PRODUCCION | VENTAS | Sin sesión | Cambio pendiente |
| -------------------------------- | --------------- | ----- | ------- | ---------- | ---------- | ------ | ---------- | ---------------- |
| `GET /api/health`                | `Public`        | Sí    | Sí      | Sí         | Sí         | Sí     | Sí         | Sí               |
| `POST /api/auth/login`           | `Public`        | Sí    | Sí      | Sí         | Sí         | Sí     | Sí         | Sí               |
| `GET /api/auth/me`               | `Authenticated` | Sí    | Sí      | Sí         | Sí         | Sí     | 401        | Sí               |
| `POST /api/auth/logout`          | `Authenticated` | Sí    | Sí      | Sí         | Sí         | Sí     | 401        | Sí               |
| `POST /api/auth/change-password` | `Authenticated` | Sí    | Sí      | Sí         | Sí         | Sí     | 401        | Sí               |
| `/api/users/**` (7 rutas)        | `Roles(ADMIN)`  | Sí    | 403     | 403        | 403        | 403    | 401        | 403              |

Los permisos empresariales concretos llegan con cada módulo.

### 401 frente a 403

| Situación                                                                             | Código                               |
| ------------------------------------------------------------------------------------- | ------------------------------------ |
| Sin cookie, JWT inválido o expirado, versión revocada, usuario inactivo o inexistente | `401`                                |
| Sesión válida con un rol no autorizado                                                | `403`                                |
| Sesión válida con cambio de contraseña pendiente, fuera de las tres rutas permitidas  | `403` con `PASSWORD_CHANGE_REQUIRED` |
| Acción prohibida por regla, como desactivarse a sí mismo                              | `403`                                |
| Ruta sin política declarada                                                           | `403` y error en el log              |
| Origen no confiable en un método que modifica                                         | `403`                                |

El frontend usa `GET /auth/me` para conocer `id`, `fullName`, `email`, `role` y
`mustChangePassword`, pero no decide permisos: solo oculta opciones y redirige.

---

## 8. Endpoints

### Autenticación

| Método y ruta                    | Política                  | Cuerpo                             | Éxito                                                | Errores                                                                       |
| -------------------------------- | ------------------------- | ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /api/auth/login`           | `Public`; 10/min por IP   | `{ email, password }`              | `200 { data: UserResponse, message }` y `Set-Cookie` | `400`; `401` «Credenciales inválidas»; `403` origen; `429`                    |
| `GET /api/auth/me`               | `Authenticated`           | —                                  | `200 { data: UserResponse, message }`                | `401`                                                                         |
| `POST /api/auth/logout`          | `Authenticated`           | —                                  | `200 { data: null, message }` y cookie expirada      | `401`; `403` origen                                                           |
| `POST /api/auth/change-password` | `Authenticated`; limitado | `{ currentPassword, newPassword }` | `200 { data: UserResponse, message }` y cookie nueva | `400`; `401`; `403` origen; `422` actual incorrecta o igual a la nueva; `429` |

Las tres rutas `Authenticated` llevan además `@AllowPendingPasswordChange()`. La contraseña actual
incorrecta devuelve `422` y no `401`: el frontend interpreta `401` como sesión terminada.

### Usuarios (`Roles(ADMIN)`)

| Método y ruta                        | Cuerpo                                         | Éxito                                                        | Errores                                                    |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `GET /api/users?page=1&limit=20`     | —                                              | `200 { data: UserResponse[], meta: { page, limit, total } }` | `400` paginación inválida                                  |
| `GET /api/users/:id`                 | —                                              | `200 { data, message }`                                      | `400` id no UUID; `404`                                    |
| `POST /api/users`                    | `{ fullName, email, role, temporaryPassword }` | `201 { data, message }` con `mustChangePassword: true`       | `400`; `409` correo existente                              |
| `POST /api/users/:id/enable`         | —                                              | `200 { data, message }`                                      | `404`; `409` ya activo                                     |
| `POST /api/users/:id/disable`        | —                                              | `200 { data, message }`                                      | `403` propio; `404`; `409` ya inactivo o último ADMIN      |
| `PATCH /api/users/:id/role`          | `{ role }`                                     | `200 { data, message }`                                      | `400`; `403` propio; `404`; `409` mismo rol o último ADMIN |
| `POST /api/users/:id/reset-password` | `{ temporaryPassword }`                        | `200 { data, message }` con `mustChangePassword: true`       | `400`; `403` propio; `404`                                 |

Todas responden además `401` sin sesión, `403` con otro rol y `403 PASSWORD_CHANGE_REQUIRED` con un
cambio pendiente. La lista se ordena por `fullName` y después por `id`; `limit` va de 1 a 100 y
vale 20 por defecto. El campo se llama `temporaryPassword` para que el contrato diga lo que es.

- `PATCH /users/:id/role` en lugar de un `PATCH /users/:id` genérico: cambiar un rol es una
  operación sensible, con acción de auditoría propia.
- **No existe `DELETE /users/:id`.** El usuario se desactiva; su identidad debe sobrevivir porque
  `AuditLog` e `InventoryMovement` lo referencian con `Restrict`.

### `UserResponse`

```json
{
  "id": "0192…",
  "email": "maria.lopez@ecosoap.example",
  "fullName": "María López",
  "role": "INVENTARIO",
  "isActive": true,
  "mustChangePassword": false,
  "createdAt": "2026-09-24T15:00:00.000Z",
  "updatedAt": "2026-09-24T15:00:00.000Z"
}
```

Nunca incluye `passwordHash`, `tokenVersion` ni `roleId`. Se conserva `fullName`, el nombre del
modelo aprobado, en lugar del `name` del prompt de la etapa.

### DTO

| DTO                  | Campos                                           | Reglas                                                                    |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `LoginDto`           | `email`, `password`                              | correo: trim y minúsculas, formato válido, hasta 254; contraseña: 1 a 128 |
| `CreateUserDto`      | `fullName`, `email`, `role`, `temporaryPassword` | nombre: trim, 2 a 100; correo igual; `role` del enum; política §5         |
| `ChangeRoleDto`      | `role`                                           | valor de `RoleCode`                                                       |
| `ResetPasswordDto`   | `temporaryPassword`                              | política §5                                                               |
| `ChangePasswordDto`  | `currentPassword`, `newPassword`                 | 1 a 128; política §5                                                      |
| `PaginationQueryDto` | `page`, `limit`                                  | `page` ≥ 1; `limit` de 1 a 100                                            |

Cualquier campo no declarado —`isActive`, `passwordHash`, `tokenVersion`, `mustChangePassword`,
`roleId`— produce `400`. Nunca se recibe un modelo de Prisma.

### Formato de error

Se mantiene el de NestJS, `{ statusCode, message, error }`, con `message` en español redactado por
el equipo o una lista de mensajes de validación. `error` lleva un código propio solo cuando el
frontend debe reaccionar, como `PASSWORD_CHANGE_REQUIRED`. Una excepción que no sea
`HttpException` produce el `500` genérico de NestJS, sin código de Prisma, SQL ni traza. La
violación de unicidad del correo (`P2002`) se traduce a `409` en el servicio.

### Límite de intentos

`@nestjs/throttler` 6.7.1 con almacenamiento en memoria: **10 peticiones por minuto y por IP** en
`POST /api/auth/login`, y el mismo límite en `POST /api/auth/change-password`. No es global.
Responde `429`; las cabeceras exactas se confirmarán al implementar.

- Un `429` no se audita: registrarlo reabriría la inundación de filas que el límite evita.
- No se bloquean cuentas: sería un vector para bloquear a propósito a usuarios legítimos.
- **Reiniciar el backend reinicia el contador.** Basta para la instancia única del alcance
  académico; una arquitectura distribuida necesitaría almacenamiento compartido.
- Detrás de un proxy inverso hay que configurar `trust proxy` antes de confiar en la IP reportada.
- Este límite no convierte la política en un cumplimiento de NIST.

### `X-Request-Id`

Toda respuesta lleva `X-Request-Id`, expuesto por CORS, para que el frontend pueda mostrarlo en un
error `5xx` y el equipo encuentre las filas exactas de auditoría.

---

## 9. Estados de usuario y reglas de administración

### Estados

| Estado                      | `isActive` | `mustChangePassword` | Qué puede hacer                                                               |
| --------------------------- | ---------- | -------------------- | ----------------------------------------------------------------------------- |
| Activo                      | `true`     | `false`              | Lo que su rol permita                                                         |
| Activo con cambio pendiente | `true`     | `true`               | Iniciar sesión, consultar `/auth/me`, cambiar su contraseña y cerrar sesión   |
| Inactivo                    | `false`    | cualquiera           | Nada: login `401` genérico; sus sesiones se rechazan en la siguiente petición |

Alta → Activo con cambio pendiente. Activo ⇄ Inactivo solo por `ADMIN`. No hay borrado. Reactivar
no revive tokens antiguos, porque la versión subió al desactivar.

### Reglas

- **R1 — Invariante.** Nunca quedan 0 `ADMIN` activos. Pueden romperla dos operaciones: desactivar
  a un `ADMIN` activo y cambiar el rol de un `ADMIN` activo. Respuesta:
  `409 «Debe existir al menos un administrador activo»`.
- **R2 — Autoprotección.** Se aplica solo a las operaciones administrativas peligrosas sobre la
  propia cuenta: un `ADMIN` no puede **desactivarse**, **cambiarse el rol** ni **restablecer su
  propia contraseña** por la vía administrativa (`403`). Cualquier usuario puede cambiar su propia
  contraseña con `change-password`, aportando la actual, y cerrar sesión.
- **R3 — Transiciones sin efecto.** Activar a un activo, desactivar a un inactivo o asignar el mismo
  rol responde `409` y no escribe auditoría.

Si solo existe un `ADMIN` activo, el único que podría intentar desactivarlo es él mismo, y lo
rechaza R2. R1 sigue siendo imprescindible por la concurrencia: con dos administradores, «A
desactiva a B» y «B desactiva a A» a la vez dejarían el sistema sin ninguno.

### Protocolo común

**Corrección de implementación:** el protocolo aprobado de abajo usaba `FOR UPDATE`. La prueba
U9 detectó un ciclo al comprobar la FK del actor de auditoría; se implementó `FOR NO KEY UPDATE`
en objetivo y rol. La desviación y su justificación están en §22. Se conserva el bloque original
como evidencia del diseño aprobado.

La regla protegida es `activeAdminCount >= 1`. El candado sobre la fila del rol `ADMIN` se toma
**solo** cuando la operación puede modificar el conjunto de ADMIN activos, y todas esas operaciones
siguen exactamente el mismo protocolo:

| Requiere el protocolo ADMIN            | No lo requiere (si no afecta a un ADMIN)   |
| -------------------------------------- | ------------------------------------------ |
| Crear un usuario con rol `ADMIN`       | Crear un usuario `VENTAS`, `COMPRAS`, etc. |
| Activar un usuario `ADMIN`             | Activar un usuario `PRODUCCION`            |
| Desactivar un usuario `ADMIN`          | Desactivar un usuario no ADMIN             |
| Cambiar rol `ADMIN` → otro rol         | Cambiar rol `VENTAS` → `INVENTARIO`        |
| Cambiar rol otro rol → `ADMIN`         | Restablecer o cambiar contraseñas, logout  |
| Alta del primer ADMIN (`admin:create`) |                                            |

```text
BEGIN   -- READ COMMITTED, el nivel por defecto de PostgreSQL y de Prisma
  1. SELECT … FROM users WHERE id = :objetivo FOR UPDATE          estado vigente y estable (no aplica al alta)
  2. Validar: existe (404) · autoprotección (403) · transición con efecto (409)
  3. ¿La operación afecta a un ADMIN? (rol actual o rol de destino ADMIN; alta con rol ADMIN)
       sí → SELECT id FROM roles WHERE code = 'ADMIN' FOR UPDATE   candado único
            si retira a un ADMIN activo: contar los ADMIN activos; si son 1 o menos → 409 y ROLLBACK
       no → sin candado del rol
  4. INSERT o UPDATE users   (desactivar y cambiar rol también incrementan token_version)
  5. INSERT audit_logs
COMMIT
```

Decidir con la fila del objetivo ya bloqueada evita la carrera en la que el objetivo se convierte
en ADMIN entre la lectura y la decisión: mientras la transacción tiene la fila, su rol y su estado
no pueden cambiar. El alta y `admin:create` no tienen fila previa y toman directamente el candado del
rol cuando el rol es `ADMIN`.

**Por qué funciona.** El candado ejecuta de una en una todas las operaciones que pueden alterar los
administradores activos. En READ COMMITTED cada sentencia toma una instantánea nueva, así que el
conteo del paso 4, hecho después de obtener el candado, ve lo que confirmó la operación anterior.

**El nivel de aislamiento importa.** En REPEATABLE READ la instantánea se fijaría antes de esperar
el candado; el conteo quedaría desactualizado y dos operaciones podrían confirmar (_write skew_).
Estas transacciones no deben elevar su aislamiento sin revisar el protocolo; el código lo dirá en un
comentario.

**Hipótesis original sobre interbloqueos (corregida en §22).** Toda operación bloquea como mucho una fila de usuario existente —su
objetivo— y, si corresponde, después la fila del rol. Nadie que tenga el candado del rol espera
después por una fila de usuario existente, así que no se forman ciclos. El conteo no bloquea filas.

| Alternativa                                 | Por qué no                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Contar y después actualizar, sin bloqueo    | Las dos operaciones cuentan dos administradores y ambas confirman                  |
| `FOR UPDATE` sobre todas las filas de ADMIN | Correcto, pero depende de la reevaluación de filas bloqueadas; difícil de explicar |
| `pg_advisory_xact_lock(n)`                  | Funciona, pero con un número mágico; la fila del rol es autoexplicativa            |
| Aislamiento SERIALIZABLE                    | Correcto, pero obliga a reintentar las transacciones abortadas                     |

**Ventana aceptada.** Un administrador desactivado en el instante t puede completar una petición
que ya había superado `JwtAuthGuard` antes de t. Son milisegundos, la auditoría registra
correctamente quién actuó y R1 sigue protegida.

---

## 10. Logout

```text
POST /api/auth/logout   (sesión válida)
BEGIN
  UPDATE users SET token_version = token_version + 1 WHERE id = :actor
  INSERT AuditLog LOGOUT   actor USER = entidad USER = usuario
COMMIT
Set-Cookie: ecosoap_session=; Max-Age=0; Path=/
```

El logout es deliberadamente **global para el usuario**: cerrar sesión en un dispositivo invalida
también cualquier otro token vigente del mismo usuario. Es aceptable para este ERP y queda
documentado. Cerrar una sola sesión por dispositivo exigiría la tabla de sesiones descartada en §4.

`token_version` sube en logout, desactivación, cambio de la contraseña propia (la sesión actual
recibe una cookie nueva), restablecimiento por ADMIN y cambio de rol. No sube al activar, porque
las sesiones ya se revocaron al desactivar, ni al crear un usuario.

En el frontend, un logout correcto o un `401` vacían la caché de TanStack Query y llevan a `/login`.

---

## 11. Auditoría

### Eventos

| Evento                            | `actorType` | `actorUserId` | `action`          | Entidad         | `previousValues`                          | `newValues`                                                     |
| --------------------------------- | ----------- | ------------- | ----------------- | --------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Login correcto                    | `USER`      | usuario       | `LOGIN`           | `USER`/usuario  | —                                         | —                                                               |
| Login fallido, cuenta existente   | `ANONYMOUS` | `null`        | `LOGIN_FAILED`    | `USER`/objetivo | —                                         | —                                                               |
| Login fallido, correo desconocido | `ANONYMOUS` | `null`        | `LOGIN_FAILED`    | nula            | —                                         | —                                                               |
| Logout                            | `USER`      | usuario       | `LOGOUT`          | `USER`/usuario  | —                                         | —                                                               |
| Alta por ADMIN                    | `USER`      | admin         | `CREATE`          | `USER`/nuevo    | —                                         | `{ email, fullName, role, isActive, mustChangePassword: true }` |
| Alta del primer ADMIN por comando | `SYSTEM`    | `null`        | `CREATE`          | `USER`/nuevo    | —                                         | Igual, con `mustChangePassword: false`                          |
| Activar                           | `USER`      | admin         | `ENABLE`          | `USER`/objetivo | `{ isActive: false }`                     | `{ isActive: true }`                                            |
| Desactivar                        | `USER`      | admin         | `DISABLE`         | `USER`/objetivo | `{ isActive: true }`                      | `{ isActive: false }`                                           |
| Cambiar rol                       | `USER`      | admin         | `CHANGE_ROLE`     | `USER`/objetivo | `{ role: "VENTAS" }`                      | `{ role: "INVENTARIO" }`                                        |
| Cambiar la contraseña propia      | `USER`      | usuario       | `CHANGE_PASSWORD` | `USER`/usuario  | `{ mustChangePassword: true }` si cambió  | `{ mustChangePassword: false }` si cambió                       |
| Restablecer contraseña            | `USER`      | admin         | `RESET_PASSWORD`  | `USER`/objetivo | `{ mustChangePassword: false }` si cambió | `{ mustChangePassword: true }` si cambió                        |

«Login fallido, cuenta existente» cubre la contraseña incorrecta y la cuenta inactiva. Todas las
combinaciones cumplen los `CHECK` vigentes sin modificarlos: las acciones nuevas caen en la rama
general, que exige actor `USER` o `SYSTEM` y entidad presente.

### Lista permitida de `User`

`email`, `fullName`, `role` (código, nunca el UUID), `isActive` y `mustChangePassword`. Nunca entran
`password`, `passwordHash`, la contraseña temporal ni `tokenVersion`. Los eventos de contraseña solo
registran el cambio de `mustChangePassword`, que no es una credencial, y la propia acción indica
que cambió la contraseña. `audit.md` indica hoy `roleId`; se actualiza a `role` porque los UUID de
los roles los genera el seed en cada base y son ilegibles.

### Atomicidad

Estas operaciones escriben su cambio y su `AuditLog` **en la misma transacción**; si la auditoría
falla, se revierte todo y no queda cambio sin auditar:

```text
crear usuario · activar · desactivar · cambiar rol · cambiar contraseña · restablecer contraseña
· logout con incremento de token_version
```

El login correcto no cambia estado: inserta su `LOGIN` antes de emitir la cookie y, si esa
inserción falla, responde `500` sin sesión. `LOGIN_FAILED` se escribe fuera de transacción, como
establece el ADR 005, porque debe persistir precisamente cuando la operación fracasa.

### `LOGIN_FAILED`

- **No guarda el correo escrito**: podría contener una contraseña pegada por error o un dato
  personal mal tecleado. Si la cuenta existe, basta su id como entidad.
- No distingue en la fila si falló la contraseña o la cuenta estaba inactiva; queda como posible
  mejora.
- La respuesta externa es idéntica en todos los casos de fallo.

### Qué no se audita

`429` del límite de intentos; `401` y `403` de los guards; `400` de validación.

### Contexto de la petición

`RequestContextMiddleware` genera `requestId` siempre en el servidor —ignora un `X-Request-Id`
entrante— y captura `req.ip`. Los guarda en `AsyncLocalStorage` de `node:async_hooks`, sin
dependencias, como especificó el ADR 005. Las filas que crea el comando de §6 los dejan nulos.

### `AuditService`

Único punto de escritura de `AuditLog` desde los servicios de esta etapa. Recibe el cliente de la
transacción en curso, comprueba la combinación actor/entidad antes de insertar, añade el contexto y
construye los snapshots solo con la lista permitida. `inventory/apply-adjustment.ts` de Foundation
sigue escribiendo su fila directamente; migrarlo pertenece a la etapa de Inventario.

---

## 12. Migración `auth_rbac`

Es una migración **nueva**; la de Foundation no se toca porque ya está integrada. Pasa a ser la
migración 2 de `database.md` §14, que se renumera.

| Cambio | Qué                                                                             | Por qué                                                                      | Requisito                          |
| ------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| 1      | `users.token_version INTEGER NOT NULL DEFAULT 0` y `CHECK (token_version >= 0)` | Revocar sesiones sin tabla de sesiones (§10)                                 | RNF-002                            |
| 2      | `users.must_change_password BOOLEAN NOT NULL DEFAULT true`                      | Contraseñas temporales de un solo uso (§5)                                   | RNF-002: credenciales individuales |
| 3      | `CHECK (email = lower(btrim(email)))` en `users`                                | Con el índice único existente, unicidad sin distinguir mayúsculas en la base | RNF-002                            |
| 4      | `AuditAction` + `CHANGE_ROLE`, `CHANGE_PASSWORD`, `RESET_PASSWORD`              | Vocabulario del ADR 005                                                      | RNF-007                            |

`must_change_password` vale `true` por omisión: si algún camino futuro crea un usuario sin fijarlo
explícitamente, esa cuenta queda obligada a cambiar la contraseña, que es el lado seguro. La API lo
fija de todos modos y el comando del primer ADMIN lo pone en `false` expresamente, porque esa
contraseña la fija la propia persona que hace el bootstrap y no otro administrador.

```prisma
model User {
  // …campos de Foundation…
  isActive           Boolean  @default(true) @map("is_active")
  mustChangePassword Boolean  @default(true) @map("must_change_password")
  tokenVersion       Int      @default(0) @map("token_version")
}

enum AuditAction {
  // …valores de Foundation…
  CHANGE_ROLE
  CHANGE_PASSWORD
  RESET_PASSWORD
}
```

SQL esperado; el definitivo es el que genere Prisma y se revisa antes de aplicarlo:

```sql
-- Generado por Prisma
ALTER TYPE "AuditAction" ADD VALUE 'CHANGE_ROLE';
ALTER TYPE "AuditAction" ADD VALUE 'CHANGE_PASSWORD';
ALTER TYPE "AuditAction" ADD VALUE 'RESET_PASSWORD';

ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Añadido antes de compartir la migración, igual que en Foundation
ALTER TABLE "users" ADD CONSTRAINT "users_token_version_check"
  CHECK ("token_version" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = lower(btrim("email")));
```

**Por qué un `CHECK` y no `citext` ni un índice sobre `lower(email)`.** `citext` exige una extensión
y cambia el tipo de la columna. Un índice por expresión no puede declararse en `schema.prisma`, y
habría que verificar que Prisma Migrate no lo trate como diferencia. Un `CHECK` ya está probado sin
_drift_ en Foundation.

**Datos existentes.** No se normalizan correos automáticamente: si una base local tuviera uno sin
normalizar, la migración fallará al añadir el `CHECK` en lugar de fusionar cuentas en silencio. Las
filas de usuario existentes reciben `token_version = 0` y `must_change_password = true`.

PostgreSQL admite `ADD VALUE` dentro de una transacción desde la versión 12, siempre que el valor
nuevo no se use en esa misma transacción; esta migración no lo usa. Es la primera ampliación de un
enum y cierra el riesgo «sin probar» de `database.md` §15.

### Procedimiento de verificación antes de integrarla

```text
1. prisma migrate dev --create-only        generar sin aplicar
2. Revisar el SQL generado y añadir los CHECK
3. Base _test vacía: aplicar Foundation + auth_rbac desde cero
4. Actualización Foundation → Auth: base _test con solo Foundation, seed y datos representativos
   (usuarios, ajustes, auditoría); aplicar auth_rbac; comprobar datos intactos, valores por omisión
   y restricciones
5. Segundo migrate dev                      sin cambios pendientes ni drift
6. Suite e2e completa
```

Es un cambio de `schema.prisma`: se avisa al equipo antes de integrarlo.

**Lo que no se añade:** `last_login_at`, que se deriva de `AuditLog`; `failed_attempts` y
`locked_until`, porque se descarta el bloqueo; tablas de sesiones o refresh tokens; ni un
renombrado de `fullName`.

---

## 13. Frontend

### Dependencias exactas

| Paquete                  | Versión | Tipo | Propósito                                                                                                           |
| ------------------------ | ------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-query`  | 5.103.2 | prod | Estado del servidor, incluida la sesión (`['auth', 'me']`); stack aprobado                                          |
| `react-router`           | 8.4.0   | prod | Rutas protegidas y por rol; modo declarativo, sin _loaders_. Autorizado en la revisión 1                            |
| `react-hook-form`        | 7.88.0  | prod | Formularios de login, alta, cambio y restablecimiento; stack aprobado                                               |
| `zod`                    | 4.6.5   | prod | Esquemas de validación de esos formularios; stack aprobado                                                          |
| `@hookform/resolvers`    | 5.9.1   | prod | Conecta React Hook Form con Zod 4                                                                                   |
| `vitest`                 | 4.1.11  | dev  | Runner de pruebas; la misma versión que ya usa el backend                                                           |
| `jsdom`                  | 28.1.0  | dev  | DOM para las pruebas. La 30 exige Node ≥ 22.22.2 y la 29 ≥ 22.13; la 28.1 admite el mínimo del proyecto, Node 22.12 |
| `@testing-library/react` | 16.3.3  | dev  | Renderizar componentes y consultarlos como un usuario                                                               |
| `@testing-library/dom`   | 10.4.2  | dev  | Dependencia par obligatoria de `@testing-library/react` 16; aporta `fireEvent` y las consultas                      |

Componentes de shadcn/ui que se copian al repositorio: `input`, `label`, `table`, `dialog`,
`select` y `alert`, sobre `radix-ui`, ya instalado. Si su CLI intentara añadir un paquete, se
detiene y se reporta.

**No se añaden:** `@testing-library/user-event` y `@testing-library/jest-dom`, porque `fireEvent` y
las aserciones de Vitest cubren las pruebas mínimas; `msw`, porque se sustituye `fetch` o el módulo
de servicios; axios, porque `fetch` basta; Zustand o Redux, porque la caché de TanStack Query es la
única fuente de sesión; TanStack Router; y TanStack Table, que llegará con Datos maestros.

### Estructura

```text
frontend/src/
├── main.tsx
├── app/
│   ├── App.tsx                  QueryClientProvider + BrowserRouter
│   └── query-client.ts          QueryClient con el manejo global de 401 y 403
├── routes/
│   ├── AppRoutes.tsx            tabla de rutas
│   ├── HomePage.tsx             bienvenida con nombre y rol
│   └── NotFoundPage.tsx
├── layouts/
│   ├── AppLayout.tsx            cabecera, menú y Outlet
│   └── navigation.ts            menú declarativo por rol
├── services/
│   └── api-client.ts            fetch con credentials: 'include' y ApiError
├── components/ui/               shadcn: existentes + input, label, table, dialog, select, alert
└── features/
    ├── auth/
    │   ├── components/          LoginForm, RequireAuth, RequireRole, ForbiddenState, ChangePasswordForm
    │   ├── hooks/               useSession, useLogin, useLogout, useChangePassword
    │   ├── pages/               LoginPage, ChangePasswordPage
    │   ├── schemas/             login, cambio de contraseña, política de contraseña
    │   ├── services/            auth-api.ts
    │   └── types/               SessionUser, RoleCode, ROLE_LABELS
    └── users/
        ├── components/          UsersTable, CreateUserDialog, ChangeRoleDialog, ResetPasswordDialog
        ├── hooks/               useUsers y una mutación por acción
        ├── pages/               UsersPage
        ├── schemas/             alta de usuario, restablecimiento
        ├── services/            users-api.ts
        └── types/               User, Paginated
```

Las pruebas viven junto al código que prueban (`*.test.tsx`). El tipo `RoleCode` y las etiquetas de
los roles se repiten en el frontend porque no existe `packages/shared`.

### Un único mecanismo de sesión

- La consulta `['auth', 'me']`, expuesta por `useSession()`, es la única fuente de verdad sobre el
  usuario, su rol, `mustChangePassword` y el estado de carga. No hay contexto ni store adicional.
- `getMe()` traduce un `401` en `null`: no hay sesión, no es un error.
- El login y el cambio de contraseña escriben el usuario devuelto en esa consulta.
- Un `401` en cualquier otra petición vacía la sesión y la caché; `RequireAuth` lleva a `/login`
  con el aviso «Tu sesión expiró o fue cerrada».
- Un `403` con `PASSWORD_CHANGE_REQUIRED` lleva al cambio de contraseña; cualquier otro `403`
  invalida `['auth', 'me']` y muestra el mensaje.

### Rutas y guardas

```text
/login               pública; con sesión → redirige a /
/account/password    RequireAuth → ChangePasswordPage (sin menú si el cambio es obligatorio)
/                    RequireAuth → RequirePasswordCurrent → AppLayout → HomePage
/users               RequireAuth → RequirePasswordCurrent → RequireRole(['ADMIN']) → UsersPage
*                    NotFoundPage
```

| Estado               | Qué se muestra                                                    |
| -------------------- | ----------------------------------------------------------------- |
| `loading`            | Pantalla de carga; ningún contenido protegido                     |
| `unauthenticated`    | `<Navigate to="/login" state={{ from }} replace />`               |
| `authenticated`      | `<Outlet />`                                                      |
| `mustChangePassword` | Redirección a `/account/password`, sin menú; solo cambiar o salir |
| `forbidden`          | Vista 403 dentro del layout, sin redirigir                        |

El árbol protegido no se monta hasta que la consulta de sesión se resuelve: no hay destellos.

### Cliente HTTP

`apiFetch<T>(ruta, opciones)` usa `VITE_API_URL`, `credentials: 'include'` y JSON, y convierte los
fallos en `ApiError { status, code, message, requestId }`:

- `4xx`: el `message` del backend, que el equipo redacta en español.
- `5xx`: «Error interno del servidor (ref. `<requestId>`)».
- Sin red: «No se pudo conectar con el servidor».

Nunca se muestra un cuerpo crudo, un código de Prisma, una traza ni detalles del JWT.

### Pantallas

- **Login:** correo, contraseña, envío, carga y error. `401` → «Correo o contraseña incorrectos»;
  `429` → «Demasiados intentos. Espera un minuto».
- **Cambio de contraseña:** actual, nueva y confirmación. En modo obligatorio explica por qué y solo
  permite cambiarla o cerrar sesión.
- **Layout:** cabecera con nombre, rol y menú con «Cambiar contraseña» y «Cerrar sesión»; navegación
  generada desde `navigation.ts` y filtrada por rol: «Inicio» para todos y «Usuarios» para `ADMIN`.
- **Usuarios (`ADMIN`):** tabla paginada; alta con contraseña temporal y confirmación; activar o
  desactivar con confirmación; cambio de rol; restablecimiento. En la fila propia, desactivar y
  cambiar rol aparecen deshabilitados; el backend aplica R2 de todos modos.

La pantalla temporal de verificación de la Etapa 1 se elimina, lo que cierra la deuda «`fetch`
dentro de `useEffect`» de `progress.md`.

---

## 14. Amenazas principales

| Amenaza                                         | Vector                                     | Mitigación                                                                                  | Riesgo residual                                              |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Fuerza bruta y relleno de credenciales          | `POST /auth/login`                         | 10 intentos por minuto e IP; Argon2id; mínimo de 15 caracteres                              | Ataques desde muchas IP; sin bloqueo de cuenta, por decisión |
| Contraseñas comunes de 15 o más caracteres      | Elección del usuario                       | Longitud mínima                                                                             | Sin lista de bloqueo en esta etapa: riesgo aceptado          |
| Enumeración de usuarios                         | Mensajes y tiempos del login               | Mensaje único; verificación ficticia; misma ruta para cuentas inactivas                     | Variaciones de tiempo menores                                |
| Robo del token por XSS                          | JavaScript lee la credencial               | Cookie `HttpOnly`; React escapa por defecto; sin `dangerouslySetInnerHTML`                  | Un XSS aún puede actuar desde la página abierta              |
| CSRF y CSRF de login                            | Peticiones con la cookie desde otro origen | `SameSite=Strict`; `CrossOriginProtectionGuard`; cuerpos JSON                               | —                                                            |
| Contraseña temporal usada como permanente       | El ADMIN conoce la contraseña inicial      | `mustChangePassword`; bloqueo en el backend; cambio que exige una contraseña distinta       | —                                                            |
| Suplantación con la contraseña temporal por API | Saltarse el frontend                       | `PasswordChangeRequiredGuard`                                                               | —                                                            |
| Sesión robada que persiste                      | Token copiado                              | 8 horas; revocación por versión en logout, desactivación, contraseñas y cambio de rol       | Hasta el logout o la expiración si no se detecta             |
| Escalada de privilegios                         | Rol falsificado o desactualizado           | Rol leído de la base; HS256 fijado; secreto de al menos 32 caracteres; cambio de rol revoca | Filtración del secreto: rotarlo invalida todo                |
| Asignación masiva                               | Campos extra en el cuerpo                  | DTO con whitelist y `forbidNonWhitelisted`; mapeo explícito                                 | —                                                            |
| Bloqueo administrativo                          | Desactivar o degradar al último ADMIN      | R1, R2 y candado del rol                                                                    | Recuperación de emergencia por base de datos                 |
| Usuario desactivado que sigue operando          | Token vigente                              | `isActive` en cada petición; versión incrementada                                           | Ventana de milisegundos (§9)                                 |
| Fuga de secretos                                | Logs, auditoría, respuestas, errores       | Lista permitida; mapeadores; `500` genérico; sin logs de cuerpos; pruebas S1–S3             | Errores de código futuros: pruebas y revisión                |
| Inundación de auditoría                         | `LOGIN_FAILED` masivo                      | Límite por IP                                                                               | Ataque distribuido: la tabla crece, y es evidencia           |
| Denegación de servicio por hashing              | Logins concurrentes con Argon2             | Límite por IP; 19 MiB en lugar de 64; máximo de 128 caracteres                              | Carga distribuida                                            |
| Confusión de algoritmo o `alg: none`            | JWT manipulado                             | `algorithms: ['HS256']`                                                                     | —                                                            |
| Secreto débil o de ejemplo                      | Copiar `.env.example`                      | Validación de al menos 32 caracteres                                                        | —                                                            |
| Secretos en el repositorio público              | Commits                                    | `.env` ignorado; contraseñas de prueba aleatorias; revisión antes del PR                    | —                                                            |
| Contraseña del primer ADMIN expuesta            | Entorno o historial                        | Guía por shell; nunca se imprime; recomendación de eliminarla del `.env`                    | Disciplina del operador                                      |
| IP falsificada                                  | `X-Forwarded-For`                          | `trust proxy` desactivado                                                                   | Detrás de un proxy hay que configurarlo al desplegar         |

---

## 15. Plan de pruebas

### Unitarias del backend (`*.spec.ts`, Vitest)

| Unidad                        | Casos                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PasswordHasherService`       | Prefijo `$argon2id$v=19$m=19456,p=1,t=2$`; verificación correcta e incorrecta; «é» compuesta = descompuesta; hash mal formado → `false`; ficticio → `false`                                   |
| `normalizeEmail`              | Recorta y pasa a minúsculas                                                                                                                                                                   |
| Snapshots de auditoría        | Solo campos permitidos; diferencia mínima; `passwordHash` y `tokenVersion` en la entrada nunca salen                                                                                          |
| `CrossOriginProtectionGuard`  | Métodos seguros; `same-origin` y `none`; `same-site` y `cross-site` con y sin origen de confianza; sin `Sec-Fetch-Site`: `Origin` igual a `Host`, de confianza, ajeno y `null`; sin cabeceras |
| Políticas de acceso           | `Public`, `Authenticated`, `Roles` permitido y denegado; sin política → 403; dos políticas en el mismo destino → error al cargar; el método sustituye a la clase                              |
| `PasswordChangeRequiredGuard` | Sin cambio pendiente pasa; pendiente en ruta marcada pasa; pendiente en ruta no marcada → 403 `PASSWORD_CHANGE_REQUIRED`                                                                      |
| `env.validation`              | `JWT_SECRET` ausente o menor de 32 caracteres → el arranque falla                                                                                                                             |
| Política de contraseña        | 14 → rechazo; 15 → válida; 129 → rechazo; los espacios se conservan                                                                                                                           |
| Entrada de `admin:create`     | Variables ausentes o inválidas → rechazo antes de tocar la base                                                                                                                               |

### E2E del backend (supertest contra PostgreSQL `_test`)

**Autenticación**

| ID  | Escenario                                                                                     | Esperado                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Login válido                                                                                  | `200`; `Set-Cookie` con `HttpOnly`, `SameSite=Strict`, `Path=/`; cuerpo sin hash ni token                                           |
| A2  | Contraseña incorrecta                                                                         | `401` «Credenciales inválidas»; sin cookie                                                                                          |
| A3  | Correo inexistente                                                                            | Idéntico a A2                                                                                                                       |
| A4  | Usuario inactivo con contraseña correcta                                                      | Idéntico a A2                                                                                                                       |
| A5  | `/me` con cookie válida                                                                       | `200` con `mustChangePassword`                                                                                                      |
| A6  | `/me` sin cookie                                                                              | `401`                                                                                                                               |
| A7  | Firma inválida, payload alterado o `alg: none`                                                | `401`                                                                                                                               |
| A8  | JWT expirado                                                                                  | `401`                                                                                                                               |
| A9  | Usuario desactivado después del login                                                         | `401` en la petición siguiente                                                                                                      |
| A10 | Cookie usada tras logout, y cookie de otra sesión del mismo usuario                           | `401`                                                                                                                               |
| A11 | Cambio de rol                                                                                 | La sesión anterior del afectado → `401`; tras un nuevo login rige el rol nuevo                                                      |
| A12 | Undécimo intento en 60 s desde la misma IP                                                    | `429`, sin `LOGIN_FAILED` para el intento limitado                                                                                  |
| A13 | `POST` con `Sec-Fetch-Site: cross-site`, o `same-site` desde un origen que no es de confianza | `403`                                                                                                                               |
| A14 | Cambio de contraseña propia                                                                   | Otras sesiones revocadas; la actual sigue con cookie nueva; actual incorrecta o igual → `422`                                       |
| A15 | Restablecimiento por ADMIN                                                                    | Sesiones del objetivo revocadas; `mustChangePassword = true`                                                                        |
| A16 | Usuario con cambio pendiente                                                                  | `/users` u otra ruta → `403 PASSWORD_CHANGE_REQUIRED`; `me`, `change-password` y `logout` permitidas; tras el cambio, acceso normal |

**RBAC**

| ID  | Escenario                                                                 | Esperado             |
| --- | ------------------------------------------------------------------------- | -------------------- |
| R1  | `ADMIN` en cada ruta de `/users`                                          | Permitido            |
| R2  | `COMPRAS`, `INVENTARIO`, `PRODUCCION` y `VENTAS` en cada ruta de `/users` | `403`                |
| R3  | Sin sesión en `/users`                                                    | `401`                |
| R4  | Cada rol en `/auth/me` y `/auth/logout`                                   | Permitido            |
| R5  | Prueba de arquitectura: toda ruta declara exactamente una política        | Ninguna sin política |

**Usuarios, último ADMIN y transacciones**

| ID  | Escenario                                                                 | Esperado                                                                                |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| U1  | Alta                                                                      | `201`; sin hash; correo normalizado; `mustChangePassword = true`                        |
| U2  | Correo duplicado con otras mayúsculas                                     | `409`                                                                                   |
| U3  | Campos extra (`isActive`, `passwordHash`, `mustChangePassword`, `roleId`) | `400`                                                                                   |
| U4  | Contraseña temporal de 14 caracteres                                      | `400`; el cuerpo del error no contiene la contraseña                                    |
| U5  | Activar, desactivar y transiciones sin efecto                             | `200` / `409`                                                                           |
| U6  | Autoprotección: desactivarse o cambiarse el rol                           | `403`; estado intacto; sin auditoría                                                    |
| U7  | Único ADMIN activo intenta desactivarse o quitarse el rol                 | Rechazado; sigue activo y ADMIN; sin `AuditLog` de éxito                                |
| U8  | Carrera: A desactiva a B y B desactiva a A a la vez                       | Exactamente un `200` y un `409`; queda un ADMIN activo; un solo `DISABLE`               |
| U9  | Carrera mixta: desactivar y degradar en paralelo                          | Se mantiene la invariante                                                               |
| U10 | Falla la auditoría en cada una de las siete operaciones atómicas de §11   | Estado intacto en cada caso: usuario, rol, hash, `mustChangePassword` y `token_version` |
| U11 | Falla el cambio de estado (alta con correo duplicado)                     | Ninguna fila `CREATE`                                                                   |
| U12 | Paginación                                                                | `meta` correcta; `limit` mayor de 100 → `400`                                           |

**Auditoría**

| ID  | Evento                               | Comprobación                                                                   |
| --- | ------------------------------------ | ------------------------------------------------------------------------------ |
| AU1 | `LOGIN`                              | Actor `USER` = entidad `USER` = usuario; `ipAddress` y `requestId` presentes   |
| AU2 | `LOGIN_FAILED`, cuenta existente     | `ANONYMOUS`; `actorUserId` nulo; entidad `USER`/objetivo                       |
| AU3 | `LOGIN_FAILED`, correo desconocido   | `ANONYMOUS`; `actorUserId` nulo; entidad nula; fila localizada por `requestId` |
| AU4 | `CREATE` por ADMIN                   | Actor ADMIN; `newValues` exactamente con la lista permitida                    |
| AU5 | `ENABLE` y `DISABLE`                 | Snapshots de `isActive`                                                        |
| AU6 | `CHANGE_ROLE`                        | `previousValues.role` y `newValues.role` con códigos de rol                    |
| AU7 | `CHANGE_PASSWORD` y `RESET_PASSWORD` | Solo `mustChangePassword` cuando cambió; nunca credenciales                    |
| AU8 | `LOGOUT`                             | Actor = entidad = usuario                                                      |
| AU9 | Primer ADMIN por comando             | `SYSTEM`, sin actor, `CREATE`, `mustChangePassword: false`                     |

**Información sensible, comando y migración**

| ID  | Escenario                                                         | Esperado                                                                          |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| S1  | Respuestas de login, me, usuarios y errores                       | No contienen la contraseña, la temporal, `$argon2id$`, el JWT ni `JWT_SECRET`     |
| S2  | Filas de `AuditLog` generadas por la suite                        | Tampoco                                                                           |
| S3  | Logs capturados durante un login fallido y un error de validación | Sin contraseñas                                                                   |
| B1  | Sin ADMIN activo                                                  | Crea el administrador con `mustChangePassword = false` y audita como `SYSTEM`     |
| B2  | Con ADMIN activo                                                  | Rechaza sin cambios                                                               |
| B3  | Usuario ya existente                                              | Falla; contraseña y rol no cambian                                                |
| M1  | Columnas nuevas                                                   | `token_version` 0 y `must_change_password` `true` por omisión; negativo → `CHECK` |
| M2  | `INSERT` con correo en mayúsculas                                 | Violación del `CHECK`                                                             |
| M3  | Enum y _drift_                                                    | Tres valores nuevos; segundo `migrate dev` sin cambios                            |
| M4  | Actualización Foundation → Auth                                   | Datos previos intactos; valores por omisión aplicados; restricciones activas      |

### Pruebas del frontend (Vitest + React Testing Library, `jsdom`)

| ID  | Escenario                                                  | Esperado                                                        |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| F1  | Formulario de login con correo inválido y contraseña vacía | Mensajes de validación; no se llama al servicio                 |
| F2  | Ruta protegida sin sesión                                  | Se muestra la pantalla de login                                 |
| F3  | Ruta protegida con sesión                                  | Se muestra el contenido                                         |
| F4  | Usuario sin rol `ADMIN`                                    | «Usuarios» no aparece en el menú; `/users` muestra la vista 403 |
| F5  | Usuario con `mustChangePassword = true`                    | Cualquier ruta lleva a la pantalla de cambio, sin menú          |
| F6  | Error `5xx` del cliente HTTP                               | Mensaje genérico con referencia; nunca el cuerpo crudo          |

Se renderiza con un `QueryClient` de prueba, con reintentos desactivados, y un `MemoryRouter`; la
sesión se fija en la caché y las llamadas de red se sustituyen en el límite de `fetch` o del módulo
de servicios. Las pruebas manuales en el navegador completan, pero no sustituyen, esta cobertura.

### Condiciones de la infraestructura de pruebas

- La base `_test` **acumula datos**: los usuarios no pueden borrarse porque la auditoría es
  append-only y los referencia con `Restrict`. Las pruebas usan sufijos únicos, nunca cuentan filas
  globales y localizan sus filas por `requestId` o por `entityId`.
- Los escenarios «un solo ADMIN activo» y «ningún ADMIN activo» preparan ese estado explícitamente,
  desactivando a los demás administradores de la base de pruebas.
- La prueba U10 hace fallar `AuditService.record` solo en la operación bajo prueba.
- Los archivos generales sustituyen la configuración del límite de intentos; un archivo dedicado
  prueba el límite real. Cada archivo crea su propia aplicación y su propio contador.
- Las contraseñas se generan al azar en cada ejecución.
- Las pruebas e2e nuevas exigen que `DATABASE_URL` termine en `_test`.

### Antes del PR

`pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm --filter backend test`,
`pnpm --filter backend test:e2e`, `pnpm --filter frontend test`, `prisma validate` y
`prisma generate`, más una búsqueda de secretos en el diff: `.env`, contraseñas, valores de
`JWT_SECRET`, tokens y cookies.

---

## 16. Documentación afectada

| Archivo                         | Cambio                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Este documento                  | Pasa a `Aprobado`; al terminar, registra las desviaciones encontradas                                                    |
| `docs/decisions/` y su `README` | ADR 008, 009 y 010                                                                                                       |
| `docs/architecture.md`          | Estado actual del backend y del frontend; recorrido de guards; ADR y diseño de la etapa                                  |
| `docs/api.md`                   | Endpoints; cookie; 401/403/409/422/429; `PASSWORD_CHANGE_REQUIRED`; formato de error; Swagger con cookie; `X-Request-Id` |
| `docs/audit.md`                 | Acciones nuevas; lista permitida con `role` y `mustChangePassword`; atomicidad; contexto; qué no se audita               |
| `docs/database.md`              | `token_version`, `must_change_password`, `CHECK` de correo, enum, plan de migraciones, riesgo del enum, §13              |
| `docs/requirements.md`          | Estados de RNF-002, D-AUT-001 y P-AUT-001; filas nuevas (abajo)                                                          |
| `docs/setup.md`                 | `JWT_SECRET`; `admin:create` por shell; pruebas del frontend; login desde Swagger                                        |
| `docs/progress.md`              | Checklist de la Etapa 3 y evidencia                                                                                      |
| `README.md`                     | Pasos de arranque con `JWT_SECRET` y primer administrador                                                                |
| `CLAUDE.md`                     | Estado actual; `react-router` en el stack; regla «toda ruta declara una política de acceso»                              |
| `.env.example`                  | `JWT_SECRET=change-me` con la instrucción de generación                                                                  |

Filas propuestas para `requirements.md`, sin convertir decisiones técnicas en requisitos oficiales:

| ID        | Requisito                                                                  | Origen      | Evidencia                                  |
| --------- | -------------------------------------------------------------------------- | ----------- | ------------------------------------------ |
| D-AUT-002 | Un usuario inactivo no se autentica ni opera                               | `DERIVADO`  | RNF-002                                    |
| D-AUT-003 | ADMIN crea usuarios, los activa o desactiva y cambia su rol                | `DERIVADO`  | RNF-002: credenciales individuales y roles |
| P-AUT-002 | Sesión en cookie `HttpOnly` con `SameSite` y protección de origen          | `PROPUESTO` | RNF-002 no fija el transporte              |
| P-AUT-003 | Argon2id y política de 15 a 128 caracteres, alineada parcialmente con NIST | `PROPUESTO` | RNF-002 exige no guardar texto plano       |
| P-AUT-004 | Revocación de sesiones por versión                                         | `PROPUESTO` | —                                          |
| P-AUT-005 | Límite de intentos de login                                                | `PROPUESTO` | —                                          |
| P-AUT-006 | Invariante del último ADMIN y autoprotección                               | `PROPUESTO` | —                                          |
| P-AUT-007 | Alta del primer ADMIN por comando explícito                                | `PROPUESTO` | —                                          |
| P-AUT-008 | Contraseñas temporales con cambio obligatorio y cambio propio              | `PROPUESTO` | —                                          |

P-AUT-001 (JWT) sigue siendo `PROPUESTO`: la Entrega exige autenticación, no JWT.

---

## 17. ADR propuestos

| ADR                                                   | Decisión                                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [008](../decisions/008-sesion-jwt-en-cookie.md)       | Sesión JWT en cookie `HttpOnly`, versión de sesión, protección de origen compatible con 12.0.4 |
| [009](../decisions/009-contrasenas-argon2id.md)       | Argon2id, política de longitud y contraseñas temporales de un solo uso                         |
| [010](../decisions/010-autorizacion-por-politicas.md) | Autorización por políticas declarativas, denegada por defecto                                  |

Transcriben solo lo aprobado y quedan `Aceptado` junto con este diseño el 2026-10-01, conforme a
`decisions/README.md`.

---

## 18. Plan de commits

```text
docs: record foundation integration status             hecho: b102f5c
docs: define authentication and rbac design            este diseño, ADR 008–010
build: add backend authentication dependencies         tras comprobar argon2 en Windows con pnpm 10
feat: add authentication schema migration              token_version, must_change_password, CHECK, acciones
feat: add password hashing service
feat: add request context and audit service
feat: implement jwt authentication                     login, me, logout, cookie, protección de origen, límite
feat: implement access policies                        Public, Authenticated, Roles, cambio pendiente
feat: add user administration
feat: add password change and admin reset
feat: add first admin bootstrap command
build: add frontend authentication dependencies        incluidas las de pruebas
feat: add authentication frontend                      router, query client, cliente HTTP, login, rutas, layout
feat: add user administration frontend
test: add authentication and rbac e2e coverage         suites transversales: sensibles y concurrencia
docs: update authentication documentation and progress
```

Cada `feat:` lleva sus propias pruebas; el commit `test:` agrupa solo las suites que atraviesan
varias piezas. Las dependencias entran en commits `build:` propios, cada uno con la lista exacta de
§5 y §13 ya aprobada.

---

## 19. Definición de terminado

Es la lista del prompt de la etapa, copiada en `progress.md`, más cuatro casillas que añade la
revisión: flujo de `mustChangePassword` funcional, protección de origen probada, actualización
Foundation → Auth probada y pruebas mínimas del frontend en verde. Cada casilla se marca solo con
la prueba o la evidencia que le corresponde en §15. La política de integración se actualizó por
autorización del responsable el 2026-10-01: `Integrado` exige un PR fusionado en `develop` con diff
y checks verificados; Luigui789 puede fusionar su propio PR, mientras que los otros dos
integrantes requieren aprobación de otro miembro. Véase la política vigente en `progress.md`.

---

## 20. Fuera de alcance

| Elemento                                     | Motivo                                               | Camino futuro                               |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Refresh tokens                               | 8 horas más nuevo login bastan; la versión revoca    | ADR nuevo si la jornada o la UX lo exigen   |
| Tabla de sesiones o cierre por dispositivo   | El logout global es aceptable                        | ADR que sustituya al 008                    |
| MFA                                          | No requerida                                         | —                                           |
| Recuperación por correo                      | Sin SMTP ni requisito                                | El restablecimiento por ADMIN cubre el caso |
| Bloqueo de cuentas                           | Vector de denegación de servicio                     | Se mantiene el límite por IP                |
| Lista de contraseñas comprometidas           | No se implementa en esta etapa                       | Mejora futura                               |
| Actualizar NestJS a 12.1                     | No se actualiza el framework para obtener una API    | Decisión explícita y separada (§4)          |
| `GET /api/audit`                             | Etapa posterior                                      | P-AUD-004                                   |
| `GET /api/roles`                             | Los cinco códigos son fijos y el frontend los conoce | Si los roles dejan de ser fijos             |
| Editar nombre o correo                       | No solicitado                                        | `UPDATE` con snapshot                       |
| Cabeceras de endurecimiento HTTP (CSP, etc.) | Pertenecen al despliegue                             | Etapa de despliegue                         |
| Permisos granulares                          | Cinco roles fijos                                    | ADR cuando un módulo lo necesite            |
| Protección de rama de `develop`              | Configuración del repositorio                        | Se hace aparte, no dentro de esta etapa     |

---

## 21. Estado de las decisiones

D1 a D14 quedan **aprobadas** el 2026-10-01; D10 con la restricción de uso exclusivo como bootstrap
y D13 con pruebas de frontend. Los cinco puntos que añadió la revisión 2 quedaron cerrados así:

1. **Cambio pendiente aplicado por el backend (§7):** aprobado. Con `mustChangePassword = true` solo
   se permiten `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/change-password` y las
   rutas `@Public()`; el resto responde `403 PASSWORD_CHANGE_REQUIRED`.
2. **Restablecimiento de la propia contraseña (§9):** aprobado. Un ADMIN no puede ejecutar
   `POST /api/users/:propio/reset-password`; usa `change-password` con su contraseña actual.
3. **Límite en `change-password` (§8):** aprobado, con el mismo orden de magnitud que el login y
   local a la instancia del backend.
4. **Candado del rol `ADMIN` (§9):** aprobado con cambio. Solo en las operaciones que pueden
   modificar el conjunto de ADMIN activos, todas con el mismo protocolo.
5. **`must_change_password` con valor `true` por omisión (§12):** aprobado.

Durante la implementación no se reabre el diseño general salvo que aparezca una incompatibilidad o
una decisión que cambie la arquitectura; en ese caso se detiene el trabajo y se reporta.

---

## 22. Desviación técnica de implementación — bloqueo compatible con auditoría

El 2026-10-01, U9 (`users.e2e-spec.ts`) detectó un interbloqueo con dos administradores
desactivándose mutuamente. A bloqueaba a B con `FOR UPDATE`; B bloqueaba a A y esperaba el rol.
Al insertar su auditoría, A debía comprobar la FK hacia su actor A con `FOR KEY SHARE`, pero B
tenía esa fila bloqueada. El análisis original de §9 omitía este bloqueo implícito de la FK.

`UsersService` usa ahora `FOR NO KEY UPDATE` en la fila objetivo y la del rol ADMIN. Sigue
serializando escrituras administrativas y estabilizando rol/estado del objetivo, pero permite
`FOR KEY SHARE`: ninguna operación cambia claves. Se conserva el orden objetivo → rol, el
candado condicional de ADMIN, READ COMMITTED y la auditoría dentro de la transacción. No se
añadieron reintentos, bloqueos consultivos ni cambios de esquema.

La invariante sigue siendo al menos un ADMIN activo. U9 comprueba tanto desactivaciones como
cambios de rol cruzados. La evidencia ejecutada está en `progress.md`. Esta corrección documenta
la incompatibilidad encontrada en la prueba; no sustituye los ADR 008–010 ni cambia el alcance.
