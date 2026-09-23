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
/api/auth                 /api/users                /api/roles

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
dominio. Actualmente existe solo `Health`; los previstos son:

```text
Auth · Users · Roles · Suppliers · Purchases · Products · Inventory
Production · Lots · Quality · Customers · Sales
```

## 7. Autenticación y autorización

Previsto, aún no implementado:

- Autenticación con JWT: usuario y contraseña → validación → token → frontend.
- Autorización RBAC con roles `ADMIN`, `COMPRAS`, `INVENTARIO`, `PRODUCCION`, `VENTAS`.
- **El backend verifica los permisos.** Ocultar un botón en el frontend no es seguridad.

## 8. Paginación

Los listados administrativos se paginan desde el backend. No se devuelven miles de registros de
una vez para que el frontend los filtre.
