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

Los módulos HTTP implementados siguen siendo:

| Módulo         | Responsabilidad                                                     |
| -------------- | ------------------------------------------------------------------- |
| `ConfigModule` | Carga y **valida** las variables de entorno al arrancar (fail fast) |
| `PrismaModule` | Expone `PrismaService`, único punto de acceso a PostgreSQL          |
| `HealthModule` | `GET /api/health`: verifica NestJS → Prisma → PostgreSQL            |

```text
backend/src/
├── main.ts              prefijo /api, CORS, ValidationPipe global, Swagger
├── app.module.ts
├── config/              validación de variables de entorno
├── prisma/              PrismaModule + PrismaService
├── health/              HealthModule + HealthController + HealthService + DTO
└── inventory/           protocolo de ajustes Foundation, todavía sin endpoint
```

Foundation añade `backend/src/inventory/apply-adjustment.ts`: valida lote y producto, bloquea
`StockBalance`, crea movimiento, actualiza saldo y registra auditoría en una transacción. Aún no
hay un módulo HTTP de inventario. No se crean módulos vacíos para los otros dominios.

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
├── App.tsx              PANTALLA TEMPORAL de verificación del entorno
├── index.css            Tailwind 4 + tema de shadcn/ui
├── lib/utils.ts         helper cn()
└── components/ui/       componentes de shadcn instalados (button, card, badge)
```

`App.tsx` no forma parte del ERP: comprueba de una sola vez que Tailwind compila, que shadcn
resuelve, que el alias `@` funciona, que `VITE_API_URL` llega desde el `.env` de la raíz y que el
backend responde con CORS correcto. Se reemplaza al empezar el layout real.

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
se crea en `feature/inventory`.

Componentes transversales previstos, para no duplicarlos por módulo: `DataTable`, `PageHeader`,
`StatusBadge`, `ConfirmDialog`, `FormField`, `EmptyState`, `LoadingState`, `ErrorState`,
`Pagination`, `SearchInput`.

Todo dato proveniente del backend es **server state** y se gestiona con TanStack Query, no con un
store global. El estado global se reserva para usuario autenticado, sesión y preferencias de
interfaz.

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

| ADR                                                   | Decisión                                             |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [001](decisions/001-package-manager-pnpm.md)          | pnpm como gestor único del monorepo                  |
| [002](decisions/002-monolito-modular.md)              | Monolito modular en lugar de microservicios          |
| [003](decisions/003-postgresql-prisma.md)             | PostgreSQL con Prisma como única vía de persistencia |
| [004](decisions/004-inventario-ledger-y-balance.md)   | Ledger inmutable + balance materializado             |
| [005](decisions/005-estrategia-de-auditoria.md)       | Tres capas de trazabilidad y `AuditLog` append-only  |
| [006](decisions/006-estrategia-de-identificadores.md) | UUIDv7 técnico + código humano separado              |
| [007](decisions/007-trazabilidad-de-lotes.md)         | Lotes en cualquier producto trazable, sin FIFO       |

Diseños por etapa:

| Etapa | Documento                                                                              |
| ----- | -------------------------------------------------------------------------------------- |
| 1     | [`specs/2026-09-22-setup-inicial-design.md`](specs/2026-09-22-setup-inicial-design.md) |
| 2     | [`database.md`](database.md) · [`audit.md`](audit.md) · ADR 004 a 007                  |

El avance real de cada etapa se sigue en [`progress.md`](progress.md).
