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

Rutas que el sistema expondrá conforme avancen las etapas. Aún no existen. Productos y
almacenes están implementados (§9), al igual que proveedores (§10).

```text
/api/purchase-orders
/api/inventory
/api/inventory/movements
/api/boms
/api/production-orders
/api/lots
/api/customers
/api/sales-orders
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

Cada módulo declara su tag al incorporarse para agrupar su documentación.

Están implementados los tags `Health`, `Auth`, `Users`, `Products`, `Warehouses`
y `Suppliers`.

Los previstos para etapas posteriores son:

```text
Purchases · Inventory
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

## 9. Inventario: productos y almacenes

Implementado en la rama `feature/products-warehouses`. Los catálogos pertenecen
al dominio de Inventario y reutilizan los modelos `Product` y `Warehouse`.

La gestión de productos cubre `RF-INV-001`. Estas operaciones administran datos
maestros y no modifican existencias ni generan movimientos de inventario.

### 9.1. Acceso

Todas las rutas requieren una sesión válida y haber completado cualquier cambio
de contraseña obligatorio.

- Consulta: `ADMIN`, `INVENTARIO`, `COMPRAS`, `PRODUCCION` y `VENTAS`.
- Creación, edición y cambio de estado: únicamente `ADMIN` e `INVENTARIO`.
- Sin sesión válida: `401`.
- Sin permiso para modificar: `403`.

Se reutilizan la cookie `ecosoap_session`, JWT y los guards y políticas del
proyecto. El backend consulta el rol del usuario en la base de datos.

Swagger agrupa los endpoints bajo `Products` y `Warehouses`, con autenticación
por cookie. Se puede iniciar sesión desde `/api/docs` para probarlos.

### 9.2. Endpoints de productos

- `GET /api/products?page=1&limit=20`: listado paginado; responde `200`.
- `POST /api/products`: crea un producto; responde `201`.
- `GET /api/products/:id`: consulta el detalle; responde `200`.
- `PATCH /api/products/:id`: actualiza los datos; responde `200`.
- `PATCH /api/products/:id/status`: activa o desactiva; responde `200`.

Ejemplo de creación:

```json
{
  "code": "MP-ACEITE-01",
  "name": "Aceite usado recolectado",
  "category": "Aceites",
  "type": "RAW_MATERIAL",
  "unit": "LITER"
}
```

Los cinco campos son obligatorios al crear:

- `code`: texto de 1 a 50 caracteres; único.
- `name`: texto de 1 a 200 caracteres.
- `category`: texto de 1 a 100 caracteres, independiente del tipo.
- `type`: uno de los valores del enum `ProductType`.
- `unit`: uno de los valores del enum `UnitOfMeasure`.

Código, nombre y categoría se recortan en los extremos. Además, el código del
producto se convierte a mayúsculas al crear y editar, igual que el de almacenes.
Por ejemplo, `" mp-aceite-01 "` se guarda como `"MP-ACEITE-01"`. Si el código
normalizado ya pertenece a otro producto, la operación devuelve `409`.

Tipos admitidos:

- `RAW_MATERIAL`: materia prima.
- `INTERMEDIATE`: producto intermedio.
- `FINISHED_GOOD`: producto terminado.
- `CONSUMABLE`: consumible, conservado del modelo existente.

Unidades admitidas: `UNIT`, `GRAM`, `KILOGRAM`, `MILLILITER` y `LITER`.

El producto se crea activo. `isActive`, `isLotTracked` y
`requiresQualityInspection` no se aceptan en el cuerpo de creación ni en la
edición general. Los dos últimos conservan sus valores predeterminados del
modelo al crear.

La edición permite enviar cualquiera de los cinco campos del alta, con las
mismas validaciones. Debe incluir al menos un campo; `{}` y los valores `null`
se rechazan. Los campos omitidos conservan su valor.

Si el producto tiene al menos un movimiento de inventario, cambiar `unit` o
`type` devuelve `409`, incluso si sus existencias actuales son cero. Enviar el
mismo valor de unidad o tipo no se considera un cambio. Código, nombre y
categoría siguen siendo editables. Si se intenta un cambio bloqueado junto con
otros campos, se rechaza toda la edición y no se registra un evento `UPDATE`.

El formulario de productos construye el PATCH con `dirtyFields` y envía solo
los campos modificados. Guardar queda deshabilitado si no hay cambios, también
cuando se restauran todos los valores originales.

Ejemplo de edición parcial:

```json
{
  "name": "Aceite usado recolectado para proceso",
  "category": "Aceites recuperados"
}
```

`ProductResponse` incluye `id`, `code`, `name`, `category`, `type`, `unit`,
`isLotTracked`, `requiresQualityInspection`, `isActive`, `createdAt` y
`updatedAt`. El identificador es UUID y las fechas se serializan como texto
ISO 8601.

### 9.3. Endpoints de almacenes

- `GET /api/warehouses?page=1&limit=20`: listado paginado; responde `200`.
- `POST /api/warehouses`: crea un almacén; responde `201`.
- `GET /api/warehouses/:id`: consulta el detalle; responde `200`.
- `PATCH /api/warehouses/:id`: actualiza los datos; responde `200`.
- `PATCH /api/warehouses/:id/status`: activa o desactiva; responde `200`.

Ejemplo de creación:

```json
{
  "code": "ALM-CENTRAL",
  "name": "Almacén Central",
  "location": "Nave Norte, Pasillo A",
  "isActive": true
}
```

Validaciones del alta:

- `code`: obligatorio, de 3 a 50 caracteres; se recorta y convierte a mayúsculas.
- `name`: obligatorio, de 3 a 100 caracteres; se recorta.
- `location`: obligatoria, de 1 a 255 caracteres; se recorta.
- `isActive`: booleano opcional; si se omite, se usa `true`.

El código es único. Intentar usar el código de otro almacén con distinta
capitalización también produce un conflicto, porque se normaliza a mayúsculas.

La edición acepta `code`, `name` y `location` de forma parcial, con las mismas
validaciones. Debe incluir al menos un campo y no admite `null` ni `isActive`.
Los campos omitidos conservan su valor. El estado se modifica mediante `/status`.

El formulario de almacenes construye el PATCH con `dirtyFields` y envía solo
los campos modificados. Confirmar queda deshabilitado si no hay cambios, también
cuando se restauran todos los valores originales.

Ejemplo de edición parcial:

```json
{
  "location": "Nave Sur, Pasillo B"
}
```

`WarehouseResponse` incluye `id`, `code`, `name`, `location`, `isActive`,
`createdAt` y `updatedAt`. El identificador es UUID y las fechas se serializan
como texto ISO 8601.

### 9.4. Estados y conservación de datos

Los dos endpoints `PATCH /:id/status` reciben exclusivamente:

```json
{
  "isActive": false
}
```

Para reactivar se envía `true`. Se exigen booleanos JSON reales: `"false"`,
`0` y `null` se rechazan con `400`.

Solicitar el estado que el recurso ya tiene devuelve `409`.

La desactivación exige que no existan saldos distintos de cero:

- Producto: se comprueban sus saldos en todos los almacenes. Si cualquiera
  tiene `quantity != 0`, se devuelve `409`.
- Almacén: se comprueban los saldos de todos sus productos. Si cualquiera
  tiene `quantity != 0`, se devuelve `409`.

La comprobación se realiza dentro de la transacción, después de bloquear
la fila del producto o almacén y antes de actualizar su estado. Cuando se
rechaza la operación, el recurso conserva sus valores y no se registra
un evento `DISABLE`.

Si todos los saldos son cero, se permite desactivar, aunque existan filas
de `StockBalance` o movimientos históricos. También se permite cuando
el recurso no tiene saldos registrados. La reactivación no exige saldo cero.

La desactivación conserva el registro y sus relaciones. No se ofrecen
endpoints `DELETE` para productos ni almacenes. Cambiar el estado no
modifica saldos ni genera movimientos de inventario.

### 9.5. Respuestas, paginación y filtros

Los listados responden con:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0
  }
}
```

Parámetros de paginación de ambos catálogos:

- `page`: entero desde 1; predeterminado 1.
- `limit`: entero entre 1 y 100; predeterminado 20.
- `meta.total`: cantidad total de registros que cumplen los filtros, antes de
  aplicar la paginación. Sin filtros, incluye todos los registros activos e inactivos.
- Productos: orden por nombre ascendente y, en caso de empate, por identificador.
- Almacenes: orden por código ascendente.
- Una página sin registros devuelve `data: []`, conservando el total filtrado.

Filtros opcionales de `GET /api/products`:

- `isActive`: admite únicamente `true` o `false` en la URL. Si se omite, se
  incluyen ambos estados. `isActive=false` selecciona los productos inactivos.
- `type`: admite `RAW_MATERIAL`, `INTERMEDIATE`, `FINISHED_GOOD` o `CONSUMABLE`.
  Si se omite, se incluyen todos los tipos.
- `search`: texto de 1 a 100 caracteres después de quitar espacios de los extremos.
  Busca coincidencias parciales en el código o el nombre, sin distinguir mayúsculas
  de minúsculas.

Filtros opcionales de `GET /api/warehouses`:

- `isActive`: mismas reglas que en productos.
- `search`: mismas reglas de longitud y comparación; busca en código, nombre o
  ubicación.
- Almacenes no admite el filtro `type`.

Los filtros se combinan: un registro debe cumplir todos los filtros enviados.
Dentro de la búsqueda, basta con que coincida cualquiera de los campos indicados.
La consulta de registros y el cálculo de `meta.total` usan los mismos filtros.

Ejemplos:

```text
GET /api/products?page=1&limit=20&isActive=true&type=RAW_MATERIAL&search=aceite
GET /api/products?page=1&limit=20&isActive=false
GET /api/warehouses?page=1&limit=20&isActive=true&search=central
GET /api/warehouses?page=2&limit=20&isActive=false
```

Valores como `isActive=yes`, `isActive=0`, `type=OTRO`, `search=` o una búsqueda
compuesta solo por espacios devuelven `400`. Una búsqueda de más de 100 caracteres
después de recortar los extremos también se rechaza.

El frontend omite los filtros vacíos, recorta y codifica la búsqueda con
`URLSearchParams`, y conserva explícitamente `isActive=false`. Los filtros forman
parte de la clave de caché del listado. Al cambiar estado o tipo, o aplicar una
búsqueda con el botón Buscar o Enter, se vuelve a la página 1. Al paginar se
conservan los filtros; Limpiar filtros elimina todos los filtros y vuelve a la página 1.

El detalle, la creación, la edición y el cambio de estado responden con
`{ data: recurso, message: texto }`, siguiendo las convenciones generales.

### 9.6. Errores

- `400`: datos inválidos, campos adicionales, edición vacía, UUID incorrecto,
  filtros inválidos o paginación fuera de los límites.
- `401`: sesión ausente o inválida.
- `403`: rol sin permiso, cambio obligatorio de contraseña pendiente u otra
  restricción de los guards globales.
- `404`: producto o almacén inexistente.
- `409`: código duplicado, solicitud de un estado que el recurso ya tiene,
  cambio de `unit` o `type` de un producto con movimientos de inventario,
  o intento de desactivar un producto o almacén con existencias distintas de cero.
- `500`: fallo interno, incluido un fallo al registrar la auditoría.

### 9.7. Auditoría y transacciones

Se utilizan las convenciones existentes: acciones `CREATE`, `UPDATE`, `ENABLE`
y `DISABLE`, junto con la entidad `PRODUCT` o `WAREHOUSE`.

Los eventos identifican al usuario mediante `actorType: USER` y `actorUserId`,
y se correlacionan con la petición mediante `requestId`.

- Creación: registra los valores iniciales del catálogo.
- Edición: registra los valores anteriores y nuevos únicamente de los campos
  que cambiaron.
- Activación y desactivación: registran el cambio de `isActive`.
- En almacenes, los cambios de `location` también quedan auditados.
- Una edición que conserva todos los valores no genera un evento `UPDATE`.

El cambio del recurso y su evento se guardan dentro de la misma transacción.
Si falla la auditoría, ambos se revierten. Los cambios sobre un mismo recurso
se serializan mediante un bloqueo de fila dentro de la transacción.

## 10. Compras: proveedores

Implementado en la rama `feature/suppliers`. Cubre `RF-COM-001` con el modelo `Supplier` de
`database.md` §10. Valida con los decoradores compartidos de `common/catalog.dto.ts`.

### 10.1. Acceso

- Consulta: cualquier rol autenticado (`ADMIN`, `COMPRAS`, `INVENTARIO`, `PRODUCCION`, `VENTAS`).
- Creación, edición y cambio de estado: únicamente `ADMIN` y `COMPRAS`.
- Sin sesión válida: `401`. Sin permiso para modificar: `403`.

### 10.2. Endpoints

- `GET /api/suppliers?page=1&limit=20`: listado paginado por razón social; responde `200`.
- `POST /api/suppliers`: crea un proveedor; responde `201`.
- `GET /api/suppliers/:id`: consulta el detalle; responde `200`.
- `PATCH /api/suppliers/:id`: actualiza los datos enviados; responde `200`.
- `PATCH /api/suppliers/:id/status`: activa o desactiva con `{ "isActive": boolean }`; responde `200`.

Ejemplo de creación:

```json
{
  "code": "PROV-ACEITES",
  "name": "Recicladora del Pacífico S.A.",
  "taxId": "J0310000000001",
  "email": "compras@recicladora.com.ni",
  "phone": "+505 2222-0000",
  "address": "Km 7 Carretera Norte, Managua"
}
```

Validaciones:

- `code`: obligatorio, de 3 a 50 caracteres; se recorta y convierte a mayúsculas; único, también
  con distinta capitalización.
- `name`: obligatorio, de 3 a 200 caracteres; se recorta.
- `taxId` (hasta 50), `phone` (hasta 50) y `address` (hasta 255): opcionales; se recortan.
- `email`: opcional, formato de correo, hasta 254 caracteres; se recorta y pasa a minúsculas.
- Los campos de contacto aceptan `null` para quedar sin dato; un texto vacío se rechaza.
- `isActive` no se acepta en el alta ni en la edición general; el proveedor se crea activo.

La edición es parcial: debe incluir al menos un campo, y `code` y `name` no admiten `null`. El
estado exige un booleano JSON real: `"false"`, `0` y `null` se rechazan con `400`.

`SupplierResponse` incluye `id`, `code`, `name`, `taxId`, `email`, `phone`, `address`,
`isActive`, `createdAt` y `updatedAt`. Los campos de contacto pueden ser `null`.

### 10.3. Errores

- `400`: datos inválidos, campos adicionales, edición vacía, UUID incorrecto o paginación fuera
  de los límites.
- `404`: proveedor inexistente.
- `409`: código duplicado o solicitud de un estado que el proveedor ya tiene.

### 10.4. Auditoría y transacciones

Acciones `CREATE`, `UPDATE`, `ENABLE` y `DISABLE` sobre la entidad `SUPPLIER`, escritas mediante
`AuditService` con `requestId`. Los snapshots usan una lista permitida (`code`, `name`, `taxId`,
`email`, `phone`, `address`, `isActive`), y una edición registra solo los campos que cambiaron.
El cambio y su evento comparten transacción; los cambios sobre un mismo proveedor se serializan
con un bloqueo de fila. La desactivación es lógica: no hay `DELETE`.
