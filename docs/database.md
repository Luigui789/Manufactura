# Base de datos — EcoSoap ERP

## 1. Estado actual

**No existe modelo de datos todavía, y es deliberado.**

`backend/prisma/schema.prisma` contiene únicamente el `datasource` y el `generator`. No hay
entidades ni migraciones. El modelo real se diseñará en la etapa siguiente, y la primera migración
nacerá con él.

La razón: el modelo de datos es la decisión más cara de revertir de todo el proyecto. Crear
entidades sueltas solo para «demostrar que Prisma funciona» fijaría decisiones antes de haberlas
analizado. La conectividad se valida en su lugar con `GET /api/health`.

## 2. Motor y acceso

PostgreSQL 18, ejecutado en Docker Compose. El acceso desde la aplicación es exclusivamente a
través de Prisma; no se escribe SQL manual salvo razón técnica clara.

### Particularidades de Prisma 7

Prisma 7 cambió dos cosas respecto de versiones anteriores, y conviene tenerlas presentes:

1. **La URL de conexión ya no vive en el esquema.** El bloque `datasource` no admite `url`. La URL
   para los comandos de Migrate se declara en `backend/prisma.config.ts`, y el cliente en tiempo de
   ejecución recibe un _driver adapter_ (`@prisma/adapter-pg`) construido en `PrismaService`.

2. **El cliente se genera como código TypeScript** en una ruta explícita
   (`backend/src/generated/prisma`) en lugar de dentro de `node_modules`. Esa carpeta está en
   `.gitignore`: es código derivado y cada integrante lo regenera.

Las versiones de `prisma` y `@prisma/client` están **fijadas a 7.10.0**, no a `latest`, porque el
dist-tag `latest` de la CLI apunta actualmente a un release candidate de la versión 8 mientras el
cliente sigue en la 7. Instalar con `latest` produciría un par incompatible.

## 3. Entidades previstas

Estas son las entidades que el modelo deberá contemplar, según el alcance del proyecto. La forma
concreta —campos, relaciones, índices— se decide en la etapa de diseño del modelo.

| Área       | Entidades                                                       |
| ---------- | --------------------------------------------------------------- |
| Seguridad  | `User`, `Role`                                                  |
| Catálogos  | `Product`, `Supplier`, `Customer`, `Warehouse`                  |
| Compras    | `PurchaseOrder`, `PurchaseOrderItem`                            |
| Inventario | `InventoryMovement`                                             |
| Producción | `Bom`, `BomItem`, `ProductionOrder`, `Lot`, `QualityInspection` |
| Ventas     | `SalesOrder`, `SalesOrderItem`                                  |

Antes de crear una entidad nueva hay que preguntarse si realmente lo es, o si es un atributo, una
relación, un estado o una tabla intermedia. No se crean tablas redundantes.

## 4. Enums de estado previstos

Los estados de negocio se modelan como enums, nunca como texto libre:

```text
PurchaseOrderStatus     DRAFT · CONFIRMED · PARTIALLY_RECEIVED · RECEIVED · CANCELLED
ProductionOrderStatus   DRAFT · CONFIRMED · IN_PROGRESS · COMPLETED · CANCELLED
SalesOrderStatus        DRAFT · CONFIRMED · DISPATCHED · CANCELLED
InventoryMovementType   PURCHASE_RECEIPT · PRODUCTION_CONSUMPTION · PRODUCTION_OUTPUT
                        SALE_DISPATCH · ADJUSTMENT
```

## 5. Reglas de modelado

- **Dinero en decimal**, nunca `float`. Las cantidades monetarias y las de inventario que admitan
  fracciones usan tipos decimales.
- **Fechas como fecha**, no como cadenas arbitrarias.
- **Integridad en la base, no solo en la aplicación**: claves primarias y foráneas, restricciones
  de unicidad, `NOT NULL`, índices en las columnas por las que realmente se consulta.
- **Auditoría**: las operaciones importantes deben permitir saber qué ocurrió, quién lo hizo,
  cuándo y sobre qué entidad. Como mínimo para movimientos de inventario, compras, producción,
  ventas y ajustes.
- `InventoryMovement` es la bitácora del inventario: ninguna existencia cambia sin dejar un
  movimiento que explique el porqué.

## 6. Migraciones

Todo cambio estructural se hace mediante `schema.prisma` y una migración de Prisma. Las
migraciones se versionan en Git.

```bash
pnpm --filter backend exec prisma migrate dev --name descripcion_del_cambio
pnpm --filter backend prisma:generate
```

Dos reglas que el equipo acordó y que evitan los conflictos más caros:

1. **Los cambios de `schema.prisma` se coordinan entre los tres.** Es el archivo con mayor
   probabilidad de conflicto y el más difícil de resolver a mano.
2. **Una migración compartida no se edita nunca.** Si algo está mal en una migración que ya se
   subió, se corrige con una migración nueva.

## 7. Conexión local

El contenedor expone PostgreSQL en el puerto **5433** del host, no en el 5432, para no chocar con
instalaciones nativas de PostgreSQL. Ver `docs/setup.md`, sección 4.

```text
DATABASE_URL=postgresql://ecosoap:<password>@localhost:5433/ecosoap_erp?schema=public
```
