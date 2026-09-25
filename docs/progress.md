# Avance del proyecto — EcoSoap ERP

Este documento refleja el estado **real** del proyecto.

Una casilla marcada significa que la comprobación se ejecutó y se vio el resultado. No se marca
nada por parecer correcto, por estar escrito ni por estar a punto de terminarse.

Última actualización: 2026-09-24.

## Estados del trabajo

La auditoría de diseño señaló con razón que «redactado» no es «aprobado» y que ninguno de los dos
es «verificado». Se distinguen cinco estados y no se saltan:

| Estado         | Significado                                                 |
| -------------- | ----------------------------------------------------------- |
| `Redactado`    | El artefacto existe. No implica que nadie lo haya revisado. |
| `Aprobado`     | Revisado y aceptado. Puede implementarse.                   |
| `Implementado` | El código existe y compila.                                 |
| `Verificado`   | Se ejecutó la comprobación y se vio el resultado.           |
| `Integrado`    | Fusionado en `develop` mediante pull request revisado.      |

---

## Etapa 1 — Configuración inicial

**Integrada en `develop`** mediante el pull request #1.

- [x] pnpm workspace
- [x] NestJS
- [x] React + Vite
- [x] Tailwind CSS
- [x] shadcn/ui
- [x] PostgreSQL
- [x] Docker Compose
- [x] Prisma
- [x] Swagger
- [x] Health check
- [x] ESLint
- [x] Prettier
- [x] Build frontend
- [x] Build backend
- [x] Test e2e del health check
- [x] Integrado en `develop`

### Evidencia

Comprobaciones ejecutadas el 2026-09-22 durante la implementación de la etapa:

| Comprobación                       | Resultado observado                                             |
| ---------------------------------- | --------------------------------------------------------------- |
| `pnpm -v`                          | 10.30.3, coincide con `packageManager`                          |
| Lockfiles                          | Solo `pnpm-lock.yaml`                                           |
| `docker compose ps`                | `ecosoap-postgres` en estado `healthy`, puerto 5433             |
| `prisma generate`                  | Cliente 7.10.0 generado                                         |
| `GET /api/health`                  | `200` con `"database": "up"`                                    |
| `GET /api/docs` y `/api/docs-json` | `200`, OpenAPI documenta el endpoint                            |
| Frontend en el navegador           | Tailwind y shadcn renderizan; PostgreSQL «Conectada»            |
| `pnpm lint`                        | Limpio en ambos proyectos, sin avisos                           |
| `pnpm format:check`                | Limpio                                                          |
| `pnpm build`                       | Ambos proyectos compilan                                        |
| `pnpm --filter backend test:e2e`   | 1 prueba, pasa                                                  |
| Higiene de Git                     | `.env`, `node_modules`, `dist/` y el cliente generado ignorados |

Estas casillas registran una verificación **histórica**, no una reejecución de hoy. La integración
en `develop` sí es comprobable en cualquier momento en el historial de Git.

### Desviaciones registradas

En [`specs/2026-09-22-setup-inicial-design.md`](specs/2026-09-22-setup-inicial-design.md), sección
10: NestJS 12 y Vite 8 ya no generan con ESLint sino con oxlint; Prisma 7 eliminó `url` del bloque
`datasource`; PostgreSQL 18 cambió el punto de montaje del volumen; el puerto 5432 estaba ocupado
por una instalación nativa; y TypeScript 6 deprecó `baseUrl`.

### Deuda pendiente

- La pantalla temporal de verificación hace `fetch` dentro de un `useEffect`. Debe migrar a
  TanStack Query cuando este se instale.
- `CLAUDE.md` describía la Etapa 1 como en curso en `feature/project-setup`. Corregido el
  2026-09-23.

---

## Etapa 2 — Database foundation

**Foundation implementada y verificada; cotejo académico completado** en la rama
`feature/database-foundation`.

- [x] Modelo conceptual completo
- [x] Estrategia de identificadores
- [x] Modelo de inventario
- [x] Estrategia de lotes
- [x] Estrategia de auditoría
- [x] ERD aprobado para Foundation
- [x] `schema.prisma` de la fundación
- [x] Primera migración aplicada desde base limpia en PostgreSQL 16 temporal
- [x] Índices y constraints de Foundation creados y comprobados
- [x] Tests de integridad de Foundation ejecutados
- [x] Documentación actualizada para Foundation
- [x] Repetir las pruebas de migración en PostgreSQL 18 del proyecto
- [x] Cotejar `requirements.md` con la Entrega 1 oficial
- [ ] PR revisado
- [ ] Integrado en `develop`

### Estado de los artefactos

| Artefacto                                             | Archivo        | Decisión                                               |
| ----------------------------------------------------- | -------------- | ------------------------------------------------------ |
| `docs/decisions/004-inventario-ledger-y-balance.md`   | `Redactado`    | `Aceptado`                                             |
| `docs/decisions/005-estrategia-de-auditoria.md`       | `Redactado`    | `Aceptado`                                             |
| `docs/decisions/006-estrategia-de-identificadores.md` | `Redactado`    | `Aceptado`                                             |
| `docs/decisions/007-trazabilidad-de-lotes.md`         | `Redactado`    | `Aceptado`                                             |
| `docs/database.md` con ERD y modelo completo          | `Actualizado`  | `Aprobado`                                             |
| `docs/audit.md`                                       | `Actualizado`  | `Aprobado`                                             |
| `schema.prisma` Foundation                            | `Implementado` | Versión actual verificada en PostgreSQL 18.6           |
| Primera migración + SQL personalizado                 | `Implementado` | Versión actual verificada en PostgreSQL 18.6           |
| Seed de roles y almacén                               | `Implementado` | Versión actual verificada dos veces en PostgreSQL 18.6 |

Son dos ejes distintos y no se contradicen. La columna **Decisión** refleja el estado del ADR
según [`decisions/README.md`](decisions/README.md), que es la fuente de verdad sobre decisiones
aceptadas. La columna **Archivo** refleja que existen en la rama de trabajo pero aún no están
integrados en `develop`.

La auditoría señaló correctamente que la versión anterior presentaba los ADR como aceptados y
pendientes a la vez. Queda resuelto.

### Correcciones aplicadas tras la auditoría de diseño

| #   | Corrección                                                                  |
| --- | --------------------------------------------------------------------------- |
| 1   | Matriz tipo → origen de `InventoryMovement` definida por migración          |
| 2   | `AuditLog` admite `ANONYMOUS` y entidad nula solo en `LOGIN_FAILED`         |
| 3   | `ProductionOrder.plannedDate` añadida como fecha de calendario              |
| 4   | `BomItem` sin unidad propia; congelación de la versión de BOM usada         |
| 5   | Igualdad lote–producto garantizada con clave foránea compuesta              |
| 6   | Origen único y obligatorio de cada lote                                     |
| 7   | Política de calidad; bloqueo de consumo además de despacho                  |
| 8   | Confirmar una venta no reserva inventario                                   |
| 9   | Protocolo de concurrencia con orden estable de bloqueo                      |
| 10  | Consulta de reconciliación balance contra ledger                            |
| 11  | `AdjustmentReason` obligatorio en los ajustes                               |
| 12  | Semántica de `DocumentSequence`: huecos válidos, sin reciclaje              |
| 13  | Instantes frente a fechas de calendario; zona empresarial `America/Managua` |
| 14  | Sanitización de auditoría por lista permitida, no por lista prohibida       |
| 15  | Estado único de los ADR; `CLAUDE.md` actualizado                            |
| 16  | Cantidades recibidas y despachadas derivadas, no almacenadas                |
| 17  | Afirmaciones sobre UUIDv7 y `requestId` matizadas                           |

### Evidencia ejecutada de Foundation

El 2026-09-23 se verificó una revisión anterior de Foundation en **PostgreSQL 16** temporal. Tras
el cotejo académico, la migración inicial se corrigió antes de integrarse en `develop`. La versión
actual se verificó el 2026-09-24 en **PostgreSQL 18.6** del `docker-compose.yml`, usando una nueva
base vacía terminada en `_test`, sin modificar la base de trabajo `ecosoap_erp`.

| Comprobación                                          | Resultado observado                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `prisma validate` y `prisma generate`                 | Esquema válido; cliente 7.10.0 generado                                                                                 |
| `migrate dev --create-only`                           | Migración Foundation generada antes de editar su SQL                                                                    |
| `migrate dev` desde base limpia                       | Migración completa, incluidos `CHECK` y disparadores, aplicada                                                          |
| Segundo `migrate dev`                                 | `Already in sync`; sin drift reportado; historial reproducido en base sombra                                            |
| Seed ejecutado dos veces y luego con `prisma db seed` | 5 roles, 1 almacén, 0 usuarios; comando configurado comprobado                                                          |
| `foundation.e2e-spec.ts`                              | 10 pruebas pasan: signos, cero, motivo, FK lote–producto, actor, unicidad, inmutabilidad, concurrencia y reconciliación |
| Suite e2e completa                                    | 2 archivos, 11 pruebas pasan, incluido health check                                                                     |
| Calidad                                               | ESLint backend/frontend, Prettier, builds backend/frontend pasan                                                        |

En PostgreSQL 18.6, **después** de añadir `Product.category` y `Warehouse.location`, se observaron
estos resultados:

| Comprobación                                        | Resultado observado                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docker compose ps` y `SHOW server_version`         | Contenedor `healthy`; PostgreSQL 18.6 en puerto 5433                                                                                             |
| `prisma validate` y `prisma generate`               | Esquema válido; cliente 7.10.0 generado                                                                                                          |
| Primer `prisma migrate dev` en base dedicada vacía  | Migración inicial corregida `20260924041058_database_foundation` aplicada; esquema sincronizado                                                  |
| Segundo `prisma migrate dev`                        | `Already in sync`; sin cambios pendientes ni drift reportado                                                                                     |
| `pnpm --filter backend db:seed` ejecutado dos veces | 5 roles, 1 almacén con `location = Planta principal - Managua`, 0 usuarios, comprobados con SQL                                                  |
| Suite e2e completa                                  | 2 archivos y 12/12 pruebas pasan; incluye límites de `category`/`location`, `CHECK`, FK, append-only y reconciliación                            |
| Carrera de creación del primer saldo                | Falló inicialmente con `P2002` en `upsert`; corregido con `createMany(skipDuplicates)` más `FOR UPDATE`; pasó en suite y 3 repeticiones aisladas |
| UUID de saldos                                      | SQL confirmó versión 7 tras la corrección de concurrencia                                                                                        |
| Calidad final                                       | `pnpm lint`, `pnpm format:check` y `pnpm build` pasan en backend y frontend                                                                      |

Para reproducirlo, crear una base PostgreSQL 18 vacía con nombre terminado en `_test`, apuntar
`DATABASE_URL` a ella y ejecutar desde `backend/` `prisma migrate dev` dos veces y
`prisma generate`. Desde la raíz, ejecutar `pnpm --filter backend db:seed` dos veces y
`pnpm --filter backend test:e2e`. La suite exige el sufijo `_test` para proteger la base de
trabajo. Quien haya aplicado la versión previa de esta migración en una base local debe respaldar
los datos que necesite antes de recrear esa base; no se resetea ninguna base automáticamente.

**Pendiente de prueba técnica:** ampliación de enums en migraciones posteriores.

### Cuestiones abiertas

1. **Cotejo académico.** Completado contra la Entrega 1 oficial. La matriz de
   requisitos `OFICIAL`/`DERIVADO`/`PROPUESTO`, las correcciones de IDs y el estado real de cada
   flujo están en [`requirements.md`](requirements.md). No se marcó como verificado ningún flujo
   empresarial por tener únicamente entidades Foundation.
2. **Brechas de Foundation cerradas.** `Product.category` se añadió como texto obligatorio de hasta
   100 caracteres, separado de `ProductType`; `Warehouse.location` se añadió como texto obligatorio
   de hasta 255 caracteres. Se actualizaron migración, seed y pruebas, y se verificó en PostgreSQL
   18.6 desde base vacía. Los CRUD empresariales siguen pendientes.
3. **Requisitos propuestos por el equipo.** La política de lotes, `requestId`, snapshots de
   auditoría, JWT, versionado de BOM y otras extensiones quedan explícitamente como
   `PROPUESTO`; véase [`requirements.md`](requirements.md).

---

## Etapas siguientes

| Etapa | Contenido                                         | Estado    |
| ----- | ------------------------------------------------- | --------- |
| 3     | Autenticación JWT y RBAC                          | Pendiente |
| 4     | Datos maestros: productos, almacenes, proveedores | Pendiente |
| 5     | Compras y recepción                               | Pendiente |
| 6     | Inventario y movimientos                          | Pendiente |
| 7     | BOM y producción                                  | Pendiente |
| 8     | Lotes, trazabilidad y calidad                     | Pendiente |
| 9     | Clientes, ventas y despacho                       | Pendiente |
| 10    | Dashboard y reportes básicos                      | Pendiente |
| 11    | Simulación ISA-95                                 | Pendiente |

`develop` se integra en `main` cuando haya un bloque funcional completo —configuración, modelo de
datos, autenticación y datos maestros—, no al terminar cada etapa.
