# Producción C-2 — ejecución, calidad y trazabilidad

Fecha de cierre de validación: 2026-10-18 (America/Managua). Rama: `feature/production-execution`.
Base: `develop` en `f5fcc28b0bc2c5f30a4a7b839301d6eb921257ba`, con A-1, C-1,
Compras y A-2 (PR #15) integrados. Al retomar la solicitud el 18 de octubre, la rama ya
existía con los cambios C-2 sin commits; se conservaron y completaron. `git fetch origin`
confirmó la misma base, `merge-base --is-ancestor` terminó con código 0 y el reflog confirma
que la rama se creó desde ese HEAD. No se descartaron cambios ni se volvió a integrar PR #15.

Fuentes: [prompt principal](specs/2026-10-14-production-execution-c2-plan.md),
[diseño de la ronda](specs/2026-10-10-inventory-purchases-production-design.md) y ADR 011–014.

## Comportamiento entregado

- START bloquea OP, valida DRAFT, catálogo/BOM y disponibilidad consumible consistente en
  REPEATABLE READ mediante `StockQueryService` con el cliente transaccional. No escribe stock,
  movimientos, lotes ni reservas. Registra inicio/estado/auditoría. Conflictos concurrentes
  de Prisma/PostgreSQL se convierten en 409, incluido el error raw SQLSTATE 40001.
- COMPLETE bloquea OP IN_PROGRESS, calcula desde la versión histórica y cantidad planificada,
  exige asignación explícita exacta de lotes y una cantidad real positiva no superior al plan.
  Una llamada a Inventario registra consumos/output y crea el único lote; la misma transacción
  contiene secuencia, cantidades/estado/fin y auditoría. Se conserva el protocolo de bloqueos.
- Inventario relee catálogo, saldos, lotes y estados después de esperar bloqueos. Lotes no
  RELEASED no se consumen. Sin FIFO/FEFO, reservas, conversión de unidades ni expansión de BOM.
- Dos migraciones nuevas incorporan enums y luego restricciones/FKs, unicidad parcial de
  output y Calidad. Las migraciones compartidas anteriores permanecen intactas.
- `business-origin.ts` sustituye `purchase-origin.ts`; todos los callers usan el resolver común.
  Purchase conserva exactamente su respuesta. Lotes y movimientos incorporan OP/BOM, con
  discriminantes frontend; ajustes mantienen referencia nula. Relaciones ausentes con FK
  presente fallan explícitamente. El consumo referencia su OP, no el documento origen del lote.
- La UI extiende las órdenes de C-1 y el detalle de lote de A-2. COMPLETE usa el endpoint de
  lotes existente con filtros y paginación, conserva selecciones entre páginas y permite quitarlas.
  Actualiza órdenes, requerimientos, stock, movimientos y lotes después del commit.
  Muestra requerido/asignado/restante y deshabilita submit si la asignación no es exacta.
  La OP completada muestra fecha, cantidad, estado y enlace al lote concreto, calidad y trazabilidad.
- Calidad inspecciona una vez los lotes producidos QUARANTINED, con observaciones y
  no conformidades obligatorias al rechazar. Inventario cambia el estado en la transacción
  de inspección/auditoría. No hay inspección de compras ni reinspección.
- Trazabilidad usa un grafo con DFS iterativo, ruta activa y visitados; admite cadenas largas
  y antecesores compartidos, detecta ciclos y alcanza REC/OC/proveedor mediante intermedios.
  Los componentes no trazables conservan producto/cantidad sin atribuciones inventadas.
- Cambiar datos después de revisar reinicia la confirmación. Conflictos de stock/estado o de
  inspección concurrente refrescan los datos; la UI no sigue ofreciendo una inspección terminada.

## Evidencia local

Pruebas nuevas en Windows, Node 22.16.0, pnpm 10.30.3 y PostgreSQL **18.6** aislado:

- Backend unitario: **197/197 en 14 archivos**, con origen Purchase exacto, origen OP, integridad de relaciones,
  cadena válida de 250 lotes, antecesor compartido y ciclo explícito.
- E2E completo final: **384/384 en 28 archivos**, incluidos **29 casos C-2** y 355 de regresión.
  Terminó con código 0 en 369,11 s. La suite C-2 también pasó aislada en una base nueva. Cubre
  A-1, C-1, Compras y A-2; cantidades plan/real, START libre, COMPLETE concurrente/repetido,
  competencia de stock, lotes inválidos/insuficientes, catálogo, Calidad concurrente y rollback.
- Frontend: **453/453 en 20 archivos**, incluidos los ocho casos de ejecución/calidad/trazabilidad
  y apertura del lote concreto por URL. Se verifican sumas exactas, paginación, errores,
  confirmación tras editar, permisos y conflicto de inspección.
- Instalación vacía: `prisma migrate deploy` aplicó las 10 migraciones finales en
  `ecosoap_c2_20261018_test`; seed explícito correcto. La suite final C-2 usa otra base nueva,
  `ecosoap_c2_focus_20261018_test`. Se conservaron las bases anteriores; no se ejecutó reset.
- Upgrade PostgreSQL 18: `production-migrations.mjs` preservó las filas de 18 tablas, incluido
  el origen de Compra. SQL directo rechazó origen vacío/doble, segundo lote, producto incorrecto,
  segundo output, output con lote ajeno y COMPLETED sin fecha; admitió múltiples consumos por OP.
  También rechazó signos incorrectos, cero, OP ausente, origen doble y reason en producción.
  Append-only y reconciliación correctos. La prueba usa y retira exclusivamente su schema temporal.
- `purchases-migrations.mjs`: instalación vacía, upgrade de movimientos/catálogos/auditoría/BOM/OP
  y rechazo atómico de lotes legados sin origen correctos con las migraciones C-2.
- Docker: imágenes construidas y tres servicios saludables en el proyecto separado `ecosoap-c2-review`,
  con puertos/volumen propios. `docker/verify.mjs` validó Compras/A-2 y el flujo C-2 real:
  recibo trazable → START sin reserva → consumo para 10/output 9 → lote QUARANTINED → aprobación
  RELEASED → trazabilidad al proveedor; repetición 409 y reconciliación SQL. También comprobó
  frontend, salud, CORS, cookies/autenticación y logout. La base de trabajo no se utilizó.
  Puertos separados: PostgreSQL 5546, backend 3102 y frontend 5182; volumen propio.
- `prisma generate`, lint, builds backend/frontend, formato y drift **aprobados**.
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
  devolvió código 0 y `No difference detected`. `git diff --check` sin errores.

Total: **1.034 pruebas aprobadas** en el contenido final de código. Los cambios posteriores
al HEAD de código indicado abajo son exclusivamente documentación de esta evidencia.

Los errores 500 que aparecen durante las pruebas corresponden a fallos inyectados de auditoría
o escritura para comprobar rollback; los casos los esperan. El aviso de bundle Vite >500 kB
y la deprecación del adapter pg ya aparecen en el entorno; no se cambian límites ni aserciones
de CI. Las suites locales usan timeout 20 s/60 s y frontend secuencial por los recursos de la
máquina, sin modificar la configuración de CI ni sus pruebas.

## Revisión y entrega

La revisión de la implementación cubrió el CHECK nullable de completedAt, UUID uppercase en COMPLETE,
confirmación conservada tras editar y caché de inspección obsoleta tras 409. Se corrigieron con
regresiones SQL/API/UI. La CI ejecuta también las pruebas de upgrade de Producción y el smoke
Docker ampliado. La evidencia local no acredita checks remotos ni merge.

La primera ejecución E2E detectó una aserción nueva que esperaba conservar un requestId enviado
por el cliente. El contrato vigente genera el ID en el servidor; la prueba final compara
movimientos y el header de respuesta. No se cambió el comportamiento de correlación.
El fallo tardío de auditoría comprueba dentro de la transacción que ya existen ambos movimientos,
el lote, el saldo de output y el avance de secuencia, antes de forzar el rollback y comparar
el estado completo anterior.

## Commits

HEAD del código validado: `bd3e00f3630e1d2a18972c9223a1b733bc22a158`.
El commit documental de cierre se identifica con el HEAD final del informe de entrega.

| SHA       | Cambio                                                |
| --------- | ----------------------------------------------------- |
| `3b4fb71` | Persistencia, enums y restricciones físicas C-2       |
| `e036d06` | Plan de Inventario y orígenes empresariales           |
| `fcc9db1` | START, COMPLETE, calidad y trazabilidad               |
| `0c5de02` | Flujos frontend y sus pruebas                         |
| `bd3e00f` | E2E, migraciones, concurrencia, rollback, CI y Docker |

Migraciones agregadas: `20261014020000_production_execution_enums` y
`20261014021000_production_execution`. Las ocho migraciones anteriores de `develop` se conservan.

## Entrega y alcance

- START y COMPLETE conservan la versión BOM persistida, cálculo decimal y permisos ADMIN/PRODUCCION.
  Las lecturas y trazabilidad admiten roles autenticados; cada ruta tiene una sola política.
- Inventario exige una única OP y exactamente un output por plan, además de la protección SQL;
  crea lotes y escribe ledger/saldos usando la transacción del llamador.
- `business-origin.ts` es el único resolver Purchase/Production y conserva el contrato REC/OC/proveedor.
  Los consumos referencian la OP consumidora; el origen físico del lote permanece separado.
- Calidad registra una decisión por lote producido QUARANTINED, con fechas de creación/inspección
  y actor; no amplía calidad de compras ni reinspección.
- Trazabilidad incluye OP/BOM, movimiento, cantidad, almacén y lotes componentes hasta proveedor.
  Sin lote no se inventa recepción ni proveedor. Se prueban cadena larga, antecesor compartido y ciclo.
- CI incorpora upgrade de Compras/Producción, drift y smoke Docker ampliado. No se abrió PR,
  no se publicó la rama y no se atribuye una ejecución remota de GitHub Actions a esta entrega local.
- Las decisiones nuevas se registran en el Design Spec, sección «Decisiones de implementación C-2».
  No se modificaron ADR 011–014 ni PurchaseReceiptsService. No hay desviaciones arquitectónicas.
- Fuera de alcance: ventas/despacho, reservas, transferencias, FIFO/FEFO, asignación automática,
  consumo editable, sobreproducción, reversas, scrap, conversión de unidades y scheduling.

Pendientes funcionales dentro de C-2: **ninguno**. La publicación, apertura del PR, ejecución
remota de CI y revisión de integración son pasos posteriores a este informe; no se realizó merge.

Rollback de aplicación: conservar schema, enums, migraciones y datos. Después de producir,
un build anterior que no entienda esos tipos no constituye un downgrade seguro. Retirar rutas
requiere un build compatible; no borrar documentos, lotes, movimientos, inspecciones o auditoría.
El PR se prepara hacia `develop`; el merge sigue la política de revisión del equipo.

## Archivos cambiados (56)

```text
.github/workflows/ci.yml
backend/eslint.config.mjs
backend/package.json
backend/prisma/migrations/20261014020000_production_execution_enums/migration.sql
backend/prisma/migrations/20261014021000_production_execution/migration.sql
backend/prisma/schema.prisma
backend/src/inventory/business-origin.spec.ts
backend/src/inventory/business-origin.ts
backend/src/inventory/lots/lots.service.ts
backend/src/inventory/movements/inventory.service.spec.ts
backend/src/inventory/movements/inventory.service.ts
backend/src/inventory/movements/movement-origin.ts
backend/src/inventory/movements/movement-query.service.ts
backend/src/inventory/movements/movement-rules.spec.ts
backend/src/inventory/movements/movement-rules.ts
backend/src/inventory/purchase-origin.spec.ts
backend/src/inventory/purchase-origin.ts
backend/src/inventory/stock/stock-query.service.ts
backend/src/production/orders/dto/complete-order.dto.ts
backend/src/production/orders/orders.controller.ts
backend/src/production/orders/orders.module.ts
backend/src/production/orders/orders.service.ts
backend/src/production/production.module.ts
backend/src/production/quality/inspection.dto.ts
backend/src/production/quality/quality.controller.ts
backend/src/production/quality/quality.module.ts
backend/src/production/quality/quality.service.ts
backend/src/production/quality/traceability.service.spec.ts
backend/src/production/quality/traceability.service.ts
backend/test/production-execution.e2e-spec.ts
backend/test/production-migrations.mjs
backend/test/production-orders.e2e-spec.ts
backend/test/purchases-migrations.mjs
docker/verify.mjs
docs/api.md
docs/audit.md
docs/database.md
docs/production-c2-validation.md
docs/progress.md
docs/requirements.md
docs/specs/2026-10-10-inventory-purchases-production-design.md
docs/specs/2026-10-14-production-execution-c2-plan.md
frontend/src/features/inventory/api/inventory-data.ts
frontend/src/features/inventory/components/BusinessReference.tsx
frontend/src/features/inventory/inventory-labels.ts
frontend/src/features/inventory/pages/InventoryPages.test.tsx
frontend/src/features/inventory/pages/LotsPage.tsx
frontend/src/features/inventory/pages/MovementsPage.tsx
frontend/src/features/production/api/orders.ts
frontend/src/features/production/api/quality.ts
frontend/src/features/production/components/LotProductionDetail.tsx
frontend/src/features/production/components/OrderExecution.tsx
frontend/src/features/production/components/ProductionExecution.test.tsx
frontend/src/features/production/execution-schema.ts
frontend/src/features/production/pages/OrderDetailPage.tsx
frontend/src/features/production/pages/ProductionOrders.test.tsx
```
