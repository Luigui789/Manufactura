# API REST — EcoSoap ERP

## 1. Convenciones

- Prefijo global: `/api`
- Documentación interactiva: `http://localhost:3000/api/docs`
- Especificación OpenAPI: `http://localhost:3000/api/docs-json`
- Formato: JSON
- Verbos: `GET`, `POST`, `PATCH`, `DELETE` según corresponda

## 2. Formato de respuesta

Éxito con un recurso:

```json
{
  "data": {},
  "message": "Orden de producción creada correctamente"
}
```

Éxito con una lista paginada:

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 150 }
}
```

Los códigos HTTP se usan por su significado real:

| Código | Uso                                                        |
| ------ | ---------------------------------------------------------- |
| 200    | Operación correcta                                         |
| 201    | Recurso creado                                             |
| 400    | Petición mal formada                                       |
| 401    | Sin autenticar                                             |
| 403    | Autenticado pero sin permiso                               |
| 404    | Recurso inexistente                                        |
| 409    | Conflicto con el estado actual (p. ej. stock insuficiente) |
| 422    | Entidad no procesable                                      |
| 500    | Error interno                                              |
| 503    | Dependencia no disponible (p. ej. base de datos caída)     |

## 3. Validación

Toda entrada usa DTO con `class-validator`. El `ValidationPipe` global está configurado con:

- `whitelist: true` — descarta propiedades no declaradas en el DTO
- `forbidNonWhitelisted: true` — las rechaza explícitamente en lugar de ignorarlas en silencio
- `transform: true` — convierte los tipos primitivos de la petición

El backend nunca recibe objetos arbitrarios sin validar. La validación del frontend ayuda al
usuario; la del backend garantiza la regla.

## 4. Endpoints implementados

### `GET /api/health`

Verifica la cadena NestJS → Prisma → PostgreSQL ejecutando `SELECT 1`. Cubre `RF-SYS-003`.

Respuesta `200`:

```json
{
  "data": {
    "status": "ok",
    "database": "up",
    "timestamp": "2026-09-22T23:32:28.000Z"
  },
  "message": "Servicio operativo"
}
```

Respuesta `503` cuando la base de datos no responde:

```json
{
  "data": { "status": "error", "database": "down", "timestamp": "..." },
  "message": "La base de datos no responde"
}
```

El fallo viaja en el código HTTP y no solo en el cuerpo, para que cualquier supervisor externo lo
detecte sin interpretar el JSON.

## 5. Endpoints previstos

Rutas que el sistema expondrá conforme avancen las etapas. Aún no existen.

```text
/api/suppliers            /api/purchase-orders
/api/products             /api/inventory            /api/inventory/movements
/api/boms                 /api/production-orders    /api/lots
/api/customers            /api/sales-orders
```

### Acciones de negocio

Las operaciones que representan un hecho empresarial tienen endpoint propio y semántico, en lugar
de esconderse tras un `PATCH` genérico. El nombre del endpoint debe decir qué ocurrió en la
empresa:

| Endpoint                               | Efecto                                                  |
| -------------------------------------- | ------------------------------------------------------- |
| `POST /purchase-orders/:id/confirm`    | Confirma la orden; no toca inventario                   |
| `POST /purchase-orders/:id/receive`    | Registra recepción; **aumenta** inventario              |
| `POST /production-orders/:id/start`    | Inicia la producción tras verificar disponibilidad      |
| `POST /production-orders/:id/complete` | Consume materia prima, genera lote y producto terminado |
| `POST /sales-orders/:id/confirm`       | Confirma la venta; no toca inventario                   |
| `POST /sales-orders/:id/dispatch`      | Registra despacho; **disminuye** inventario             |

## 6. Tags de Swagger

Cada módulo declara su tag al incorporarse, de modo que la documentación quede agrupada por
dominio. Actualmente existen `Health`, `Auth` y `Users`; los previstos son:

```text
Suppliers · Purchases · Products · Inventory
Production · Lots · Quality · Customers · Sales
```

## 7. Autenticación y autorización

Implementado, verificado e integrado en `develop` mediante el PR #3 (merge `24bd515`). Las once
rutas de Auth y Users se suman al health check público. No existen `/api/roles` ni `/api/audit`
en esta etapa.

| Método y ruta                        | Acceso                                            | Cuerpo                                         | Resultado                                                    |
| ------------------------------------ | ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `POST /api/auth/login`               | Público; 10 intentos/minuto/IP                    | `{ email, password }`                          | `200 { data: UserResponse, message }` y cookie               |
| `GET /api/auth/me`                   | Sesión válida, incluso cambio pendiente           | —                                              | `200 { data: UserResponse, message }`                        |
| `POST /api/auth/logout`              | Sesión válida, incluso cambio pendiente           | —                                              | `200 { data: null, message }` y cookie expirada              |
| `POST /api/auth/change-password`     | Sesión válida, incluso cambio pendiente; limitado | `{ currentPassword, newPassword }`             | `200 { data: UserResponse, message }` y cookie renovada      |
| `GET /api/users?page=1&limit=20`     | ADMIN sin cambio pendiente                        | —                                              | `200 { data: UserResponse[], meta: { page, limit, total } }` |
| `GET /api/users/:id`                 | ADMIN sin cambio pendiente                        | —                                              | `200 { data: UserResponse, message }`                        |
| `POST /api/users`                    | ADMIN sin cambio pendiente                        | `{ fullName, email, role, temporaryPassword }` | `201 { data: UserResponse, message }`                        |
| `POST /api/users/:id/enable`         | ADMIN sin cambio pendiente                        | —                                              | `200 { data: UserResponse, message }`                        |
| `POST /api/users/:id/disable`        | ADMIN sin cambio pendiente                        | —                                              | `200 { data: UserResponse, message }`                        |
| `PATCH /api/users/:id/role`          | ADMIN sin cambio pendiente                        | `{ role }`                                     | `200 { data: UserResponse, message }`                        |
| `POST /api/users/:id/reset-password` | ADMIN sin cambio pendiente                        | `{ temporaryPassword }`                        | `200 { data: UserResponse, message }`                        |

`UserResponse` contiene `id`, `email`, `fullName`, `role` (código), `isActive`,
`mustChangePassword`, `createdAt` y `updatedAt`. Nunca contiene JWT, hash, versión de sesión ni
`roleId`. Correos: trim + minúsculas; contraseñas nuevas: NFC, 15–128 caracteres, sin reglas de
composición. El alta y el restablecimiento exigen cambio de contraseña; el bootstrap no.

La cookie `ecosoap_session` es `HttpOnly`, `SameSite=Strict`, `Path=/`, dura 8 horas y es `Secure`
en producción. El cliente usa `credentials: 'include'`. El JWT HS256 solo lleva `sub`, `ver`,
`iat` y `exp`; el rol se lee de la base en cada petición. Logout revoca todas las sesiones del
usuario. Desactivar, cambiar rol y restablecer contraseña también las revocan; cambiar la propia
renueva solo la sesión actual.

Los guards globales aplican protección de origen, autenticación, cambio pendiente y RBAC, en ese
orden. Cada ruta declara `Public`, `Authenticated` o `Roles`; sin política se deniega. CORS admite
solo `FRONTEND_URL`, con credenciales. Los métodos que modifican verifican `Sec-Fetch-Site` y
`Origin`/`Referer` según el algoritmo del spec §4. Detrás de un proxy debe configurarse `trust
proxy` antes de confiar en la IP; los límites viven en memoria y se reinician con el proceso.

Errores de NestJS: `{ statusCode, message, error }`; la validación puede dar `message: string[]`.

| Código | Casos en Auth/Users                                                                  |
| ------ | ------------------------------------------------------------------------------------ |
| `400`  | DTO inválido, propiedades adicionales o UUID incorrecto                              |
| `401`  | Credenciales inválidas o sesión ausente, expirada, revocada o usuario inactivo       |
| `403`  | Origen no permitido, rol insuficiente, acción sobre cuenta propia o cambio pendiente |
| `404`  | Usuario inexistente                                                                  |
| `409`  | Correo duplicado, transición sin efecto o retirada del último ADMIN activo           |
| `422`  | Contraseña actual incorrecta o nueva igual a la actual                               |
| `429`  | Límite de intentos por IP                                                            |

El bloqueo de contraseña devuelve `error: 'PASSWORD_CHANGE_REQUIRED'`: el cliente lo convierte
en `ApiError.code` y lleva a `/account/password`. Los otros `403` actualizan la consulta de sesión
y muestran el mensaje. Un `401` fuera del login limpia datos privados y lleva a `/login`.
`GET /auth/me` convierte `401` en sesión nula; login muestra el error genérico de credenciales.

Toda respuesta incluye `X-Request-Id`, expuesto por CORS. Ante `5xx`, el frontend muestra solo
«Error interno del servidor (ref. …)», sin interpretar el cuerpo interno. Sin red informa que no
pudo conectar. Swagger en `/api/docs` declara cookie auth: ejecutar login desde Swagger permite
probar las rutas; no se pega un JWT en el formulario de autorización.

## 8. Paginación

Los listados administrativos se paginan desde el backend. No se devuelven miles de registros de
una vez para que el frontend los filtre.
