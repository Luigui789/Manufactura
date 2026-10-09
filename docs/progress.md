# Avance del proyecto — EcoSoap ERP

Este documento refleja el estado **real** del proyecto.

Una casilla marcada significa que la comprobación se ejecutó y se vio el resultado. No se marca
nada por parecer correcto, por estar escrito ni por estar a punto de terminarse.

Última actualización: 2026-10-08.

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

**Integrada en `develop`** mediante el pull request #1, sin aprobación formal registrada de otro
integrante: véase [Desviaciones de proceso](#desviaciones-de-proceso).

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

- Cerrada en Etapa 3: la pantalla temporal de verificación y su `fetch` dentro de `useEffect`
  se eliminaron; los datos del servidor se consultan con TanStack Query.
- `CLAUDE.md` describía la Etapa 1 como en curso en `feature/project-setup`. Corregido el
  2026-09-23.

---

## Etapa 2 — Database foundation

**Integrada en `develop`** mediante el pull request #2, fusionado el 2026-09-24 (commit de merge
`dbda607`), sin aprobación formal registrada de otro integrante: véase
[Desviaciones de proceso](#desviaciones-de-proceso).

| Estado              | Evidencia                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Diseñada y aprobada | ADR 004 a 007 aceptados; `database.md` y `audit.md` aprobados tras la auditoría de diseño          |
| Implementada        | `schema.prisma`, migración `20260924041058_database_foundation`, seed y protocolo de ajustes       |
| Verificada          | PostgreSQL 18.6 desde base vacía, suite e2e 12/12 y calidad limpia; detalle en las tablas de abajo |
| Integrada           | Pull request #2 fusionado en `develop`; merge `dbda607`                                            |

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
- [ ] PR revisado — sin aprobación formal registrada; no se completa de forma retroactiva
- [x] Integrado en `develop` (pull request #2, merge `dbda607`)

### Estado de los artefactos

| Artefacto                                             | Archivo     | Decisión                                               |
| ----------------------------------------------------- | ----------- | ------------------------------------------------------ |
| `docs/decisions/004-inventario-ledger-y-balance.md`   | `Integrado` | `Aceptado`                                             |
| `docs/decisions/005-estrategia-de-auditoria.md`       | `Integrado` | `Aceptado`                                             |
| `docs/decisions/006-estrategia-de-identificadores.md` | `Integrado` | `Aceptado`                                             |
| `docs/decisions/007-trazabilidad-de-lotes.md`         | `Integrado` | `Aceptado`                                             |
| `docs/database.md` con ERD y modelo completo          | `Integrado` | `Aprobado`                                             |
| `docs/audit.md`                                       | `Integrado` | `Aprobado`                                             |
| `schema.prisma` Foundation                            | `Integrado` | Versión actual verificada en PostgreSQL 18.6           |
| Primera migración + SQL personalizado                 | `Integrado` | Versión actual verificada en PostgreSQL 18.6           |
| Seed de roles y almacén                               | `Integrado` | Versión actual verificada dos veces en PostgreSQL 18.6 |

Son dos ejes distintos y no se contradicen. La columna **Decisión** refleja el estado del ADR
según [`decisions/README.md`](decisions/README.md), que es la fuente de verdad sobre decisiones
aceptadas. La columna **Archivo** refleja su estado en el repositorio: todos están integrados en
`develop` desde el pull request #2.

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

## Etapa 3 — Autenticación y RBAC

**Integrada en `develop`** mediante el [pull request #3](https://github.com/Luigui789/Manufactura/pull/3),
fusionado el 2026-10-01 (America/Managua), merge `24bd515`, tras revisar diff y checks según
la política vigente del equipo. Diseño aprobado el 2026-10-01:
[`specs/2026-09-24-autenticacion-rbac-design.md`](specs/2026-09-24-autenticacion-rbac-design.md);
decisiones: ADR 008, 009 y 010, aceptados.

- [x] Diseño de autenticación (aprobado; ADR 008 y 010)
- [x] Estrategia de passwords (aprobada; ADR 009)
- [x] Estrategia JWT (aprobada; ADR 008)
- [x] Argon2id comprobado en Windows con Node 22 y pnpm 10
- [x] Migración `auth_rbac`: base limpia, actualización Foundation → Auth y sin drift
- [x] Primer administrador (`admin:create`, solo bootstrap)
- [x] Login backend
- [x] JWT guard
- [x] Protección de origen
- [x] RBAC con políticas `Public`, `Authenticated` y `Roles`
- [x] Bloqueo por `mustChangePassword`
- [x] Gestión básica de usuarios
- [x] Protección del último ADMIN
- [x] Auditoría auth
- [x] Login frontend
- [x] Protected routes
- [x] TanStack Query
- [x] Tests auth
- [x] Tests RBAC
- [x] Tests auditoría
- [x] Tests frontend mínimos
- [x] Swagger
- [x] Documentación
- [x] Review (diff inspeccionado y `Quality and tests` aprobado; PR propio de Luigui789)
- [x] Integrated into develop (PR #3, merge `24bd515`)

### Evidencia ejecutada de la Etapa 3

Comprobaciones del 2026-10-01 en Windows 11, Node 22.16.0, pnpm 10.30.3 y PostgreSQL 18.6 del
`docker-compose.yml`, siempre en bases nuevas terminadas en `_test`; la base de trabajo
`ecosoap_erp` no se tocó.

| Comprobación                                  | Resultado observado                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `argon2` 0.45.1 con su script bloqueado       | Carga el binario `win32-x64`; `hash` y `verify` correctos; prefijo `$argon2id$v=19$m=19456,p=1,t=2`; unos 46 ms por hash |
| NFC frente a NFD sin normalizar               | `verify` devuelve `false`: la normalización NFC del servicio es necesaria                                                |
| Dependencias del backend                      | Versiones aprobadas instaladas; `@nestjs/core` sigue en 12.0.4; `pnpm --filter backend build` limpio                     |
| SQL generado de `auth_rbac`                   | Coincide con el diseño; se añadieron los dos `CHECK` antes de aplicarla                                                  |
| Actualización Foundation → Auth               | Base con Foundation, seed y suite Foundation (11/11); tras `migrate deploy`, recuentos de 7 tablas idénticos             |
| Valores y restricciones tras la actualización | `must_change_password = true`, `token_version = 0`; `CHECK` de versión y de correo rechazan datos inválidos              |
| Base limpia                                   | Primer `migrate dev` aplica ambas; el segundo: `Already in sync`; `prisma validate` correcto                             |
| Suite e2e en base limpia                      | Health y Foundation 12/12; `auth-migration.e2e-spec.ts` (M1–M3) 3/3                                                      |

---

### Cierre de implementación y comprobaciones finales

La implementación local de Etapa 3 se verificó el 2026-10-01. En ese cierre previo al versionado,
el HEAD era `1b29dfd`; backend, frontend y documentación todavía estaban sin commit ni push.
Esta referencia identifica el punto de partida de la evidencia, no el estado actual de Git.

### Cierre de integración

La rama `feature/auth` se publicó con commits separados para backend, frontend, CI y
documentación. Se inspeccionó el diff y se comprobó que no incluía `.env`, secretos, fixtures
locales, logs, bases temporales ni artefactos generados. Los checks locales post-commit
(`pnpm lint`, `pnpm format:check`, `pnpm build`) pasaron con el árbol limpio.

El check remoto `Quality and tests` pasó en el commit `6f41775`, antes del merge:
[ejecución de GitHub Actions](https://github.com/Luigui789/Manufactura/actions/runs/36965936324).
Ubuntu 24.04, Node 22.16.0, pnpm 10.30.3 y PostgreSQL 18 efímero ejecutaron instalación con
lockfile congelado, generación de Prisma, migraciones, seed, lint, formato, builds y las tres
suites: 35 unitarias backend, 51 e2e y 29 frontend (115 en total).

El PR #3 fue fusionado por Luigui789 a las `2026-10-02T04:50:42Z`
(2026-10-01 22:50:42 en America/Managua), con merge
`24bd515b5e8400cb5dbe1b81501d924c78da02e1`. La revisión de diff y checks satisface la política
vigente para sus PR propios; no se afirma una aprobación externa inexistente. Se actualizó
`develop` local mediante fast-forward. La Etapa 4 permanecía pendiente al cerrar esta integración
el 2026-10-01; el avance de proveedores se registra en la sección siguiente.

| Comprobación final de Etapa 3 | Resultado observado                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unitario              | 4 archivos, 35/35 pruebas; guards, política/hash, snapshots y entrada del CLI                                                                                                                                         |
| Backend e2e                   | 7 archivos, 51/51 en `ecosoap_auth_clean_test`; sesión/cookie, origen, RBAC, auditoría atómica, revocación, usuarios, concurrencia, secretos, throttle y migración                                                    |
| Frontend automatizado         | 2 archivos, 29/29 con Vitest y RTL: F1–F6, carga sin contenido protegido, cuatro roles no ADMIN, login, cambio/confirmación, logout, 401/403, alta, acciones propias y paginación                                     |
| Navegador contra API real     | Login ADMIN, tabla y acciones propias deshabilitadas, selector de roles, logout, VENTAS sin menú Usuarios y URL directa 403; cuenta temporal redirigida desde `/users` a contraseña sin menú; `ecosoap_auth_cli_test` |
| CLI real en base nueva        | `ecosoap_auth_bootstrap_verify_test`: ambas migraciones, seed, primer ADMIN creado con contraseña aleatoria no mostrada; segundo intento rechazado sin modificar usuario                                              |
| Swagger real                  | `/api/docs-json`: 12 operaciones, esquema `ecosoap_session` declarado como cookie                                                                                                                                     |
| Calidad                       | `pnpm build`, `pnpm lint` y `pnpm format:check` pasan; compilación TypeScript incluida en los builds                                                                                                                  |

**Desviación del bloqueo ADMIN.** U9 detectó un interbloqueo con `FOR UPDATE` cuando dos ADMIN
actuaban sobre el otro: la comprobación de FK de auditoría necesita `FOR KEY SHARE` sobre el
actor. Se corrigió a `FOR NO KEY UPDATE` en objetivo y rol, compatible con esa FK y con la
serialización de escrituras. Se mantienen auditoría atómica, READ COMMITTED, orden objetivo → rol
y candado ADMIN condicional. La suite e2e actual vuelve a pasar el escenario; el traspaso anterior
registró además seis repeticiones sin fallos. Detalle en spec §22 y `database.md`, sin cambiar ADR
ni migraciones compartidas.

**Corrección frontend probada.** `QueryClient.clear()` eliminaba también el observador activo de
sesión y podía mantener la vista anterior después del login o un 401. Se cancelan consultas y
eliminan datos privados conservando `['auth', 'me']` para notificar el usuario nuevo o `null`.
Las pruebas de login, logout y revocación cubren esta regresión.

**Limitación de build.** Vite avisa que el bundle inicial mide aproximadamente 683 kB (211 kB
gzip), por encima de su umbral de 500 kB. La página administrativa se carga aparte (115 kB,
36 kB gzip). El build termina correctamente; la optimización restante queda como deuda de
rendimiento, sin añadir dependencias ni cambiar el umbral para ocultar el aviso.

Las bases de verificación terminan en `_test`. No se modificó `ecosoap_erp`. Las tres cuentas de
navegador se desactivan al cerrar la comprobación, preservando las filas referenciadas por
auditoría. Los archivos locales de fixtures y sus credenciales no se versionan.

---

## Etapa 4 — Datos maestros: Proveedores

**Implementado y verificado localmente** en la rama `feature/suppliers` (PR #8, de Lure94). La
revisión del 2026-10-08 pidió cambios y el responsable del proyecto los aplicó en la misma rama.
Productos y Almacenes se registran en `feature/products-warehouses` (PR #6), que debe integrarse
antes: esta rama arrastra cuatro commits antiguos de esa feature, que desaparecen del diff al
integrarla.

- [x] Backend: listar (paginado), crear, consultar, editar y cambiar estado en `/api/suppliers`
- [x] Modelo `Supplier` según `database.md` §10 y migración `suppliers`
- [x] Consulta para roles autenticados; gestión solo para ADMIN y COMPRAS
- [x] Auditoría mediante `AuditService`, con lista permitida y en la misma transacción
- [x] Bloqueo de fila y `409` para código duplicado o estado repetido
- [x] Frontend: listado paginado, alta, edición parcial, activar/desactivar con confirmación
- [x] Pruebas e2e y de frontend de proveedores
- [x] `docs/api.md` §10, `docs/requirements.md`, `docs/database.md` y `docs/architecture.md`
- [x] Recorrido completo en el navegador
- [ ] Review
- [ ] Integrated into develop

### Evidencia ejecutada de Proveedores

| Comprobación                       | Resultado observado                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter backend test:e2e`   | 8 archivos, 81/81 contra una base temporal `_test` con la migración `suppliers`; `suppliers.e2e-spec.ts` 30/30                                                                                                                      |
| `pnpm --filter backend test`       | 5 archivos, 72/72                                                                                                                                                                                                                   |
| `pnpm --filter frontend test`      | 4 archivos, 46/46; proveedores 17 (página con HTTP simulado y esquema)                                                                                                                                                              |
| `pnpm lint`, `format:check`, build | Aprobados; Vite mantiene el aviso conocido por el tamaño del bundle                                                                                                                                                                 |
| Migración en `ecosoap_erp`         | `prisma migrate deploy` aplicó `20261009025713_suppliers`; `migrate status` sin pendientes                                                                                                                                          |
| Swagger en ejecución               | `/api/docs-json`: cinco operaciones bajo `/api/suppliers` con el esquema de cookie `ecosoap_session`                                                                                                                                |
| Navegador, ADMIN                   | Confirmado por el responsable: alta con código en minúsculas guardado en mayúsculas y contacto vacío; código duplicado rechazado en el diálogo; edición solo del teléfono; desactivación con confirmación; persistencia al recargar |

### Correcciones de la revisión del 2026-10-08

1. La ruta era `/api/api/suppliers` por repetir el prefijo global; el frontend repetía el error.
2. El modelo usaba el correo como identidad única y no tenía `code`; ahora sigue la especificación.
   La migración se regeneró antes de integrarse; quien aplicó la anterior debe resetear su base
   local.
3. `{"isActive": "false"}` activaba el proveedor; ahora se exige un booleano JSON real.
4. Correo duplicado, UUID inválido y `null` en la edición producían `500`.
5. La auditoría se escribía sin `AuditService`: sin `requestId`, con la fila completa y sin
   valores en los cambios de estado.
6. `pnpm-workspace.yaml` aprobaba los scripts de `@scarf/scarf` y `argon2`; se restauró la
   versión documentada de `develop`.

Las pruebas unitarias con Prisma simulado se sustituyeron por `suppliers.e2e-spec.ts`, porque no
detectaban ninguno de estos fallos.

### Cuestiones abiertas

- `catalog.dto.ts` vive en `inventory/` y ahora también lo usa `purchases/`; conviene moverlo a
  `common/` en un cambio aparte.
- Filtros de listado (estado y búsqueda) cuando Compras los necesite al elegir proveedor.

---

## Desviaciones de proceso

Los dos primeros pull requests se integraron sin la revisión que exigía el flujo de esas etapas. Esa
revisión no se reconstruye ni se completa de forma retroactiva: queda registrada como desviación.

| PR  | Rama                          | Integración                                      | Pruebas                              | Revisión                                            |
| --- | ----------------------------- | ------------------------------------------------ | ------------------------------------ | --------------------------------------------------- |
| #1  | `feature/project-setup`       | Fusionado en `develop` (merge `4060763`)         | Verificadas; evidencia de la Etapa 1 | Sin aprobación formal registrada de otro integrante |
| #2  | `feature/database-foundation` | Fusionado en `develop` el 2026-09-24 (`dbda607`) | Verificadas; evidencia de la Etapa 2 | Sin aprobación formal registrada de otro integrante |

### Política vigente desde 2026-10-01

Se añade `.github/workflows/ci.yml`: `Quality and tests` ejecuta en Linux la misma cadena de
lint, formato, builds y 115 pruebas contra PostgreSQL 18 efímero (`ecosoap_ci_test`). Las Actions
están fijadas por SHA; el secreto de sesión se genera por ejecución. El resultado remoto se
verifica en el PR antes de integrar; la existencia del workflow por sí sola no acredita un pase.

Por autorización del responsable del proyecto, los cambios siempre se integran mediante PR hacia
`develop`. Luigui789 puede fusionar sus propios PR una vez verificados el diff y los checks
requeridos. Los otros dos integrantes necesitan al menos una aprobación de otro miembro antes
del merge. Nadie trabaja directamente sobre `develop` ni `main`; `main` conserva bloques estables.
Esta excepción no reconstruye revisiones ni borra las desviaciones históricas de los PR #1 y #2.

```text
Luigui789: feature/* → PR hacia develop → diff y checks verificados → merge propio permitido
Otros integrantes: feature/* → PR hacia develop → aprobación de otro miembro → merge
```

La protección de `develop`, si se configura, debe reflejar esta excepción para Luigui789 y exigir
la aprobación para los demás. La configuración de GitHub se gestiona aparte; esta actualización
solo documenta la política y no cambia permisos ni reglas remotas.

---

## Etapas siguientes

| Etapa | Contenido                                         | Estado                                                                                              |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3     | Autenticación JWT y RBAC                          | Integrada en `develop` (PR #3)                                                                      |
| 4     | Datos maestros: productos, almacenes, proveedores | En curso: proveedores verificados en `feature/suppliers` (PR #8); productos y almacenes en el PR #6 |
| 5     | Compras y recepción                               | Pendiente                                                                                           |
| 6     | Inventario y movimientos                          | Pendiente                                                                                           |
| 7     | BOM y producción                                  | Pendiente                                                                                           |
| 8     | Lotes, trazabilidad y calidad                     | Pendiente                                                                                           |
| 9     | Clientes, ventas y despacho                       | Pendiente                                                                                           |
| 10    | Dashboard y reportes básicos                      | Pendiente                                                                                           |
| 11    | Simulación ISA-95                                 | Pendiente                                                                                           |

`develop` se integra en `main` cuando haya un bloque funcional completo —configuración, modelo de
datos, autenticación y datos maestros—, no al terminar cada etapa.

La bóveda de Obsidian no estuvo disponible durante el diseño de la Etapa 3 (el servidor no
respondió) y no fue fuente de ese diseño. Las fuentes fueron la Entrega 1 oficial, `docs/`, los
ADR, el código, las migraciones, las pruebas y el historial de Git.
