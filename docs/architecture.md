# Arquitectura — EcoSoap ERP

## 1. Estilo arquitectónico

Cliente-servidor con API REST sobre un **monolito modular**. Un solo backend desplegable, con
separación interna clara entre dominios. No se usan microservicios: el alcance del proyecto no los
justifica y añadirían complejidad operativa que no aporta valor académico.

```text
┌─────────────────────────────────────┐
│              FRONTEND               │
│  React + TypeScript + Vite          │
│  Tailwind CSS + shadcn/ui           │
│  TanStack Query + TanStack Table    │
│  React Hook Form + Zod              │
└────────────────┬────────────────────┘
                 │ REST / JSON
                 ▼
┌─────────────────────────────────────┐
│               BACKEND               │
│  NestJS + TypeScript                │
│  Auth · Compras · Inventario        │
│  Producción · Ventas                │
│  Swagger / OpenAPI                  │
└────────────────┬────────────────────┘
                 │ Prisma
                 ▼
┌─────────────────────────────────────┐
│             PostgreSQL              │
└─────────────────────────────────────┘
```

## 2. Estructura del monorepo

```text
Manufactura/
├── package.json            privado; scripts de desarrollo y calidad
├── pnpm-workspace.yaml     declara frontend y backend
├── docker-compose.yml      solo PostgreSQL
├── .env.example            referencia única de variables
├── CLAUDE.md               identidad, reglas y Task Router
├── docs/
├── backend/
└── frontend/
```

`frontend/` y `backend/` son aplicaciones independientes: cada una declara sus propias
dependencias y no se mezclan entre sí. La raíz solo aporta orquestación (scripts con filtros de
pnpm) y la configuración compartida de formato.

No existe `packages/shared`. Se creará solo si aparece una necesidad real de compartir tipos o
contratos, no de forma preventiva.

## 3. Patrón del backend

```text
Controller  →  recibe HTTP, valida DTO, delega, devuelve HTTP
    ↓
Service     →  reglas de negocio, validaciones, transacciones, coordinación
    ↓
Prisma      →  acceso a persistencia
    ↓
PostgreSQL
```

Los controllers no contienen lógica de negocio. Los services no conocen HTTP. Prisma se usa
exclusivamente para persistencia; no se escribe SQL manual salvo razón técnica clara.

## 4. Estado actual del backend

Los módulos integrados en `develop` mediante el PR #3 son:

| Módulo         | Responsabilidad                                                         |
| -------------- | ----------------------------------------------------------------------- |
| `ConfigModule` | Carga y **valida** las variables de entorno al arrancar (fail fast)     |
| `PrismaModule` | Expone `PrismaService`, único punto de acceso a PostgreSQL              |
| `HealthModule` | `GET /api/health`: verifica NestJS → Prisma → PostgreSQL                |
| `AuthModule`   | Login, sesión, logout, cambio de contraseña; guards globales y hashing  |
| `UsersModule`  | Administración de cuentas, bootstrap y protección del último ADMIN      |
| `AuditModule`  | Auditoría atómica, snapshots por lista permitida y contexto de petición |

```text
backend/src/
├── main.ts              prefijo /api, CORS con credenciales, Swagger con cookie
├── app.module.ts        APP_PIPE único, cookie-parser y RequestContextMiddleware
├── auth/                servicios, contraseña, sesión y cuatro guards globales
├── users/               DTO, conversión pública y transacciones administrativas
├── audit/               record(tx), snapshots y diferencias permitidas
├── common/              contexto AsyncLocalStorage, correo y paginación
├── cli/                 admin:create (solo primer ADMIN)
├── config/              validación de variables de entorno
├── prisma/              PrismaModule + PrismaService
├── health/              HealthModule + HealthController + HealthService + DTO
├── inventory/           productos, almacenes y protocolo de ajustes Foundation
└── purchases/           PurchasesModule → SuppliersModule (proveedores)
```

Foundation añade `backend/src/inventory/apply-adjustment.ts`: valida lote y producto, bloquea
`StockBalance`, crea movimiento, actualiza saldo y registra auditoría en una transacción. Aún no
hay endpoints de existencias ni de movimientos. Compras empieza con `SuppliersModule`, que
reutiliza los decoradores de validación de `inventory/catalog.dto.ts`. No se crean módulos vacíos
para los otros dominios.

Dependencias: `UsersModule → AuthModule → AuditModule → PrismaModule`, sin ciclos.
`AuthService` consulta con Prisma directamente. La cookie `HttpOnly` transporta el JWT; cada
petición comprueba usuario activo y `tokenVersion`, y obtiene el rol actual de la base. Los
guards se ejecutan en orden: origen → JWT → cambio pendiente → política por rol. Sin política se
deniega. El pipe estricto se registra una vez como `APP_PIPE`, también efectivo en e2e.

Los servicios escriben cambios y auditoría en la misma transacción. El último ADMIN se protege
en READ COMMITTED bloqueando objetivo y, solo si afecta a ADMIN, la fila del rol, con
`FOR NO KEY UPDATE`. Este modo admite la comprobación de FK de auditoría y corrige el
interbloqueo detectado por U9; detalle en el spec §22 y `database.md`.

## 5. Arquitectura futura del backend

Esta es la estructura que el backend adoptará conforme avancen las etapas. Sirve como contrato de
hacia dónde va el proyecto, no como algo que deba existir ya en disco.

```text
backend/src/
├── auth/                 JWT, login, guards, estrategia
├── users/                usuarios
├── roles/                RBAC
│
├── compras/
│   ├── suppliers/        proveedores
│   └── purchase-orders/  órdenes de compra y recepción
│
├── inventario/
│   ├── products/         productos y materias primas
│   ├── stock/            existencias por almacén
│   ├── movements/        movimientos de inventario
│   └── lots/             lotes
│
├── produccion/
│   ├── bom/              lista de materiales
│   ├── production-orders/ órdenes de producción y consumo
│   └── quality/          control de calidad
│
├── ventas/
│   ├── customers/        clientes
│   └── sales-orders/     órdenes de venta y despacho
│
├── common/               filtros, interceptores, decoradores transversales
├── config/
└── prisma/
```

Cada módulo se crea junto a su rama de trabajo. Ejemplo: `ComprasModule` nace en
`feature/purchases`, no antes.

## 6. Estado actual del frontend

```text
frontend/src/
├── main.tsx
├── app/                 App, QueryClientProvider y manejo global de errores
├── index.css            Tailwind 4 + tema de shadcn/ui
├── lib/utils.ts         helper cn()
├── components/          FormField, ErrorNotice y nueve componentes shadcn/ui
├── services/            apiFetch con cookies y ApiError sanitizado
├── routes/              rutas declarativas, inicio y página no encontrada
├── layouts/             cabecera, menú declarativo por rol y Outlet
└── features/            auth y users: formularios, páginas, hooks, esquemas y API
```

La pantalla temporal de Etapa 1 se eliminó. La sesión vive exclusivamente en la consulta
`['auth', 'me']`; no hay contexto de sesión, store adicional ni token en almacenamiento del
navegador. Login y cambio de contraseña actualizan esa consulta. Logout y `401` cancelan
consultas y eliminan datos privados, conservando el observador de sesión para notificar `null`.
Los `403` vuelven a consultar la sesión; `PASSWORD_CHANGE_REQUIRED` bloquea inmediatamente el
menú. La ruta protegida espera a la sesión antes de montar contenido, y `/users` exige ADMIN.

`/account/password` permite cambiar o salir en modo obligatorio, sin menú; en modo voluntario
permite volver al inicio. Los formularios usan RHF y Zod, validan confirmación y envían solo campos
del DTO. Users pagina en el servidor, confirma acciones y deshabilita las operaciones peligrosas
sobre la propia cuenta. La autorización definitiva permanece en el backend.

## 7. Arquitectura futura del frontend

Organización por funcionalidad, no por tipo de archivo:

```text
frontend/src/
├── app/                  composición raíz, providers
├── components/           componentes reutilizables transversales
│   └── ui/               shadcn/ui
├── layouts/              layout principal (header + sidebar + contenido)
├── routes/               definición de rutas
├── hooks/                hooks transversales
├── lib/                  utilidades
├── services/             cliente HTTP
├── types/                tipos compartidos
└── features/
    ├── auth/
    ├── purchases/
    ├── inventory/
    ├── production/
    └── sales/
```

Cada feature puede contener `components/`, `pages/`, `hooks/`, `services/`, `schemas/` y
`types/`. Igual que en el backend, cada carpeta nace con su funcionalidad: `features/inventory/`
nació con productos y almacenes, y `features/purchases/` con proveedores.

Componentes transversales previstos, para no duplicarlos por módulo: `DataTable`, `PageHeader`,
`StatusBadge`, `ConfirmDialog`, `FormField`, `EmptyState`, `LoadingState`, `ErrorState`,
`Pagination`, `SearchInput`.

Todo dato proveniente del backend es **server state** y se gestiona con TanStack Query, no con un
store global. Usuario y sesión también son estado del servidor en TanStack Query; el estado local
solo controla formularios, diálogos, mensajes y página seleccionada.

## 8. Flujo de negocio transversal

El valor del sistema está en que los cuatro módulos comparten el mismo inventario:

La trazabilidad académica de cada flujo y decisión está en [`requirements.md`](requirements.md).
Las reglas de no modificar inventario al crear órdenes son desgloses `DERIVADO`; la comprobación
informativa de venta sin reserva y las políticas de calidad de lote son `PROPUESTO`, no requisitos
oficiales literales.

```text
Compras     crea orden → confirma → recibe mercancía ──┐
                                                       │
Inventario                       movimientos de stock ◄┼── único mecanismo
                                                       │
Producción  orden → consume MP → genera lote → PT ─────┤
                                                       │
Ventas      orden → confirma → despacha ───────────────┘
```

Reglas que sostienen la integración:

- Crear una orden de compra **no** aumenta inventario; lo aumenta la recepción.
- Crear una orden de venta **no** disminuye inventario; lo disminuye el despacho.
- Producir consume materia prima y genera producto terminado en una sola transacción atómica.
- Toda variación de existencias deja un `InventoryMovement` que permite reconstruir el porqué.

### El inventario como servicio único

Los tres módulos no escriben existencias por su cuenta: invocan un **único servicio de
inventario** que aplica siempre el mismo protocolo dentro de una sola transacción:

```text
BEGIN → obtener o crear StockBalance → bloquear la fila (FOR UPDATE)
      → validar existencia general → validar lote y su estado
      → crear InventoryMovement → actualizar StockBalance
      → actualizar el documento → crear AuditLog → COMMIT
```

Dos detalles no son opcionales. La fila de balance se obtiene con
`INSERT ... ON CONFLICT DO NOTHING` antes de bloquearla, porque «comprobar y luego insertar» es
una carrera. Y cuando una operación toca varios productos, sus filas se bloquean en **orden
ascendente por `product_id` y luego `warehouse_id`**, para que dos operaciones concurrentes no se
interbloqueen.

Es la contrapartida necesaria de mantener `StockBalance` como dato derivado del ledger, y lo que
impide que aparezcan las tres lógicas distintas de stock que el proyecto quiere evitar. El detalle
está en [ADR 004](decisions/004-inventario-ledger-y-balance.md) y en
[`database.md`](database.md), sección 8.

### Confirmar una venta no reserva inventario

En esta versión **no existen reservas**. Confirmar una orden de venta hace una comprobación
**informativa** de disponibilidad: no bloquea, no aparta mercancía y no garantiza nada. La
disponibilidad solo queda determinada al despachar, que vuelve a comprobar, bloquea el balance y
valida el lote.

Una orden confirmada puede quedarse sin existencia si otra operación la consume antes. Implementar
reservas sería un requisito nuevo, no un detalle de implementación.

## 9. Las tres capas de trazabilidad

Responder «de dónde salió este cambio y quién lo hizo» exige tres mecanismos distintos que se
complementan. Ninguno sustituye a los otros:

| Capa                       | Mecanismo                   | Pregunta                              |
| -------------------------- | --------------------------- | ------------------------------------- |
| Auditoría del sistema      | `AuditLog`                  | ¿Quién hizo qué y qué cambió?         |
| Trazabilidad empresarial   | Documentos y sus números    | ¿Qué documento originó la operación?  |
| Trazabilidad de inventario | `InventoryMovement` y `Lot` | ¿Por qué entró o salió esta cantidad? |

```text
Usuario  →  OC-2026-000021  →  REC-2026-000014  →  movimiento +40 kg  →  lote LOT-2026-000087
                                        ↓
                        AuditLog: actor, RECEIVE, PURCHASE_RECEIPT
```

`AuditLog` e `InventoryMovement` llevan la columna `requestId`, de modo que **esos dos** se
correlacionan directamente con una sola condición. Los documentos empresariales no la llevan: se
alcanzan por sus claves foráneas y por `entityId`. La estrategia está desarrollada en
[`audit.md`](audit.md) y decidida en [ADR 005](decisions/005-estrategia-de-auditoria.md).

## 10. Referencia ISA-95

El proyecto usa ISA-95 como marco conceptual, no como certificación:

| Nivel | Alcance en este proyecto                            |
| ----- | --------------------------------------------------- |
| 4     | ERP: Compras, Inventario, Producción, Ventas        |
| 3     | Órdenes de producción, lotes, trazabilidad, calidad |
| 2     | SCADA simulado                                      |
| 1     | PLC simulado                                        |
| 0     | Sensores simulados                                  |

El sistema **no es un MES industrial completo**. Implementa algunas funciones asociadas
conceptualmente al nivel 3 con fines académicos.

## 11. Decisiones registradas

Las decisiones difíciles de revertir viven en [`decisions/`](decisions/) como ADR cortos. Un ADR
no se edita una vez aceptado: si la decisión cambia, se escribe uno nuevo que declare a cuál
sustituye.

| ADR                                                   | Decisión                                                 |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [001](decisions/001-package-manager-pnpm.md)          | pnpm como gestor único del monorepo                      |
| [002](decisions/002-monolito-modular.md)              | Monolito modular en lugar de microservicios              |
| [003](decisions/003-postgresql-prisma.md)             | PostgreSQL con Prisma como única vía de persistencia     |
| [004](decisions/004-inventario-ledger-y-balance.md)   | Ledger inmutable + balance materializado                 |
| [005](decisions/005-estrategia-de-auditoria.md)       | Tres capas de trazabilidad y `AuditLog` append-only      |
| [006](decisions/006-estrategia-de-identificadores.md) | UUIDv7 técnico + código humano separado                  |
| [007](decisions/007-trazabilidad-de-lotes.md)         | Lotes en cualquier producto trazable, sin FIFO           |
| [008](decisions/008-sesion-jwt-en-cookie.md)          | Sesión JWT en cookie `HttpOnly` con versión de sesión    |
| [009](decisions/009-contrasenas-argon2id.md)          | Argon2id, política por longitud y contraseñas temporales |
| [010](decisions/010-autorizacion-por-politicas.md)    | Autorización por políticas, denegada por defecto         |

Diseños por etapa:

| Etapa | Documento                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| 1     | [`specs/2026-09-22-setup-inicial-design.md`](specs/2026-09-22-setup-inicial-design.md)                           |
| 2     | [`database.md`](database.md) · [`audit.md`](audit.md) · ADR 004 a 007                                            |
| 3     | [`specs/2026-09-24-autenticacion-rbac-design.md`](specs/2026-09-24-autenticacion-rbac-design.md) · ADR 008 a 010 |

El avance real de cada etapa se sigue en [`progress.md`](progress.md).
