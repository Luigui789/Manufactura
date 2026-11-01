# Rutas y operaciones de producción (C1)

C1 define rutas estándar. No ejecuta ni registra operaciones reales de una OP.
No modifica inventario, BOM ni ProductionOrder. No incluye centros de trabajo,
máquinas, tiempos reales, operadores, scheduling, calidad C2 ni carbono C3.

## Modelo

Product → ProductionRoute: relación opcional uno a uno. La ruta tiene código único
(32), nombre (120), descripción opcional (500), estado y timestamps.
Solo productos activos INTERMEDIATE y FINISHED_GOOD son válidos; no se exige
isLotTracked. productId es inmutable después de crear.

RouteOperation: sequence entero positivo único por ruta, nombre obligatorio,
descripción opcional y standardMinutes Decimal(12,2) positivo. Se acepta una sola
operación. No se exigen incrementos de diez. Orden: sequence ASC, id ASC.

SQL: UNIQUE product_id, UNIQUE code, UNIQUE(route_id, sequence), texto no vacío
tras btrim, sequence > 0, standard_minutes > 0, índices y FK RESTRICT.
UUID v7 lo genera Prisma, como en el modelo existente. No cambian migraciones históricas.

## Contrato REST

Prefijo `/api/production/routes`:

| Método | Sufijo          | Entrada / comportamiento                                     |
| ------ | --------------- | ------------------------------------------------------------ |
| GET    | /               | page, limit, search, isActive, productId; name ASC, id ASC   |
| GET    | /:id            | Producto, operaciones ordenadas, conteo y duración total     |
| POST   | /               | productId, code, name, description?, operations (mínimo una) |
| PATCH  | /:id            | code?, name?, description?; no admite productId              |
| PATCH  | /:id/status     | `{ "isActive": false }`                                      |
| PUT    | /:id/operations | `{ "operations": [...] }`; reemplazo completo                |

Lectura: cualquier usuario autenticado. Mutaciones: ADMIN o PRODUCCION.
No hay DELETE. Se usa el rol actual de la base. Swagger documenta DTO y cookies.
Éxitos: `{ data, message }`; listas: `{ data, meta: { page, limit, total } }`.
Detalle o producto inexistente: 404. Código/producto duplicado o estado repetido: 409.
Producto inválido: 422, INVALID_ROUTE_PRODUCT. Entrada inválida: 400.
search incluye código/nombre de ruta y código/nombre de producto.

code usa trim + uppercase; nombres y descripciones usan trim; descripción vacía
se almacena null. standardMinutes entra/sale como string, hasta diez enteros y
dos decimales, positivo, sin exponentes; ejemplo `"15.00"`.
Prisma.Decimal realiza la suma; totalStandardMinutes tiene dos decimales, es derivado
y no se almacena. Listado devuelve conteo y total sin cargar metadata de operaciones.

## Atomicidad, concurrencia y auditoría

Creación de ruta, operaciones y auditoría comparten transacción. Metadata, estado y
reemplazo bloquean la fila de ruta FOR UPDATE. Reemplazo borra y crea el conjunto en
esa misma transacción: cualquier fallo, incluida auditoría, restaura todo el conjunto.
Lectores nunca ven un conjunto parcial. Producto se bloquea FOR SHARE al crear o
reactivar. Reactivar exige producto válido y operaciones válidas. Desactivar conserva operaciones.
Las escrituras concurrentes se serializan por ruta; no hay bloqueo global. No hay
edición optimista ni fusión de cambios de formularios abiertos simultáneamente.

AuditService registra PRODUCTION_ROUTE: CREATE, UPDATE, ENABLE, DISABLE.
Snapshots completos anterior/posterior incluyen metadata, estado y operaciones,
con Decimal serializado como string. Reemplazo es UPDATE de la ruta y regenera
los IDs de sus operaciones; no hay referencias de ejecución en esta fase.

## Interfaz

Producción · Rutas convive con Dashboard, Órdenes y Fórmulas.
Rutas autenticadas: `/production/routes`, `/production/routes/new`,
`/production/routes/:id`. La creación requiere ADMIN/PRODUCCION; los controles de
edición, operaciones y estado solo son visibles a esos roles.
Listado con búsqueda, estado, paginación, loading/error/empty y reintento.
Detalle con operaciones ordenadas, producto, estado y duración estándar.
Formulario con productos activos intermedios/terminados y operaciones dinámicas:
secuencia, nombre, descripción, minutos. No permite quitar la última operación.
Valida secuencias duplicadas, enteros positivos, minutos positivos y campos obligatorios.
Días son informativos: persistencia/API siempre usa minutos.
TanStack Query invalida lista y detalle tras cada mutación.

## Ejemplo EcoSoap (sin seed automático)

Producto: Jabón ecológico 500 g. Código: RT-JABON-500.
Nombre: Ruta de fabricación Jabón Ecológico 500 g.

| Secuencia | Operación        | Minutos  |
| --------- | ---------------- | -------- |
| 10        | Mezclado         | 15.00    |
| 20        | Moldeado         | 10.00    |
| 30        | Curado / secado  | 21600.00 |
| 40        | Inspección final | 5.00     |
| 50        | Empaque          | 5.00     |

Total: **21635.00 minutos**. Curado: 15 × 24 × 60 = 21600 minutos.
Recepción y filtración podrán pertenecer a la ruta del intermedio Aceite usado filtrado.
ProductionOrder → Route → ejecución se analizará posteriormente en C4.

## Verificación

- routes.service.spec.ts: normalización, DTO, invariantes, Decimal y total exacto.
- production-routes.e2e-spec.ts: PostgreSQL real, API, permisos, rollback por auditoría,
  concurrencia, snapshots y constraints directos.
- production-routes-migrations.mjs: desde cero y upgrade, preservación de productos,
  constraints y FK; integrado en test:migrations.
- Frontend: esquemas, duración, estados de listado, formularios, permisos, orden y mutaciones.
- AppRoutes: autenticación, navegación y creación.

Drift se comprueba con prisma migrate diff contra la base migrada, como en CI.
