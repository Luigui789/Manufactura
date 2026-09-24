# Avance del proyecto — EcoSoap ERP

Este documento refleja el estado **real** del proyecto.

Una casilla marcada significa que la comprobación se ejecutó y se vio el resultado. No se marca
nada por parecer correcto, por estar escrito ni por estar a punto de terminarse.

Última actualización: 2026-09-23.

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

**Diseño aprobado; implementación en curso** en la rama `feature/database-foundation`.

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
- [ ] Repetir las pruebas de migración en PostgreSQL 18 del proyecto
- [ ] Cotejar `requirements.md` con la Entrega 1 oficial
- [ ] PR revisado
- [ ] Integrado en `develop`

### Estado de los artefactos

| Artefacto                                             | Archivo        | Decisión                      |
| ----------------------------------------------------- | -------------- | ----------------------------- |
| `docs/decisions/004-inventario-ledger-y-balance.md`   | `Redactado`    | `Aceptado`                    |
| `docs/decisions/005-estrategia-de-auditoria.md`       | `Redactado`    | `Aceptado`                    |
| `docs/decisions/006-estrategia-de-identificadores.md` | `Redactado`    | `Aceptado`                    |
| `docs/decisions/007-trazabilidad-de-lotes.md`         | `Redactado`    | `Aceptado`                    |
| `docs/database.md` con ERD y modelo completo          | `Actualizado`  | `Aprobado`                    |
| `docs/audit.md`                                       | `Actualizado`  | `Aprobado`                    |
| `schema.prisma` Foundation                            | `Implementado` | `Verificado` en PostgreSQL 16 |
| Primera migración + SQL personalizado                 | `Implementado` | `Verificado` en PostgreSQL 16 |
| Seed de roles y almacén                               | `Implementado` | `Verificado` dos veces        |

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

Se creó una instancia temporal **PostgreSQL 16** y una base UTF-8 vacía y dedicada. Docker Desktop
no estuvo disponible en esta sesión; por eso aún falta repetir la verificación en PostgreSQL 18,
que es la versión del `docker-compose.yml`.

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

**Pendiente de prueba técnica:** ampliación de enums en migraciones posteriores y repetición de
los checks de Foundation en PostgreSQL 18. La prueba en PostgreSQL 16 no certifica esa versión.

### Cuestiones abiertas

1. **Documento académico de la Entrega 1.** No aportado. El catálogo de requisitos y los RNF
   siguen sin poder cotejarse, de modo que **no puede certificarse conformidad oficial**.
2. **Requisitos propuestos por el equipo.** `RF-PRO-010`, `RF-PRO-011`, `RF-INV-007` y
   `RF-AUD-007` nacen del diseño, no del documento oficial. Ver
   [`requirements.md`](requirements.md).
3. **PostgreSQL 18.** Docker Desktop no respondió en esta sesión; la prueba equivalente queda
   pendiente antes del PR definitivo.

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
