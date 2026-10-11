# Producción C-1 — BOM, borradores y disponibilidad

Fecha: 2026-10-10. Rama: `feature/production-core`.
Base: `origin/develop` en `e7f12bc`, con Inventory A-1 integrado.

C-1 está implementado en su rama; su integración en `develop` queda pendiente del PR.
Fuentes: [diseño de la ronda](specs/2026-10-10-inventory-purchases-production-design.md)
y [ADR 014](decisions/014-versionado-bom-y-ejecucion-produccion.md).

## Alcance

- BOM única por producto, nombre/estado, versiones consecutivas y una sola versión activa.
- Componentes en unidad base, sin duplicados, autorreferencia ni expansión recursiva de intermedios.
- Salida activa intermedia o terminada y trazable; componentes y almacén activos.
- Cálculo exacto y versiones históricas conservadas; protección de tipo/unidad de productos referenciados.
- OP DRAFT: crear, consultar, editar y cancelar a CANCELLED, con versión concreta persistida.
- Número `OP-año-contador` mediante el `DocumentSequenceService` real; año empresarial de Managua.
- Requerimientos y disponibilidad mediante el `StockQueryService` real por componente/almacén.
- API y pantallas de BOM y órdenes: carga/error/vacío, búsqueda/filtros/paginación, edición,
  cancelación con confirmación y actualización de disponibilidad.
- ADMIN/PRODUCCION escriben; todos los roles autenticados consultan.
- Mutaciones, secuencia y auditoría comparten transacción; un fallo revierte el conjunto.

C-1 produce **cero escrituras** de saldos, movimientos y lotes; no reserva stock.
No incluye `start`, `complete`, asignación de lotes, calidad ni trazabilidad de C-2.

## Decisiones concretadas

Estas políticas cierran elecciones que PR0 dejó abiertas o especificó con un mínimo menos estricto:

1. Resultados no representables exactamente con cuatro decimales o fuera de `Decimal(18,4)`
   se rechazan, sin redondeo/truncamiento. Contexto decimal aislado de precisión 60.
2. Todas las versiones conservan su contenido desde creación, incluso antes de usarse en una OP.
   La activación sigue siendo mutable y nunca cambia la versión de una orden existente.
3. Primera versión activa automáticamente; siguientes versiones con activación explícita.
4. Elección explícita del responsable: `plannedStartAt` y `plannedEndAt` opcionales como
   `timestamptz`/UTC, UI en `America/Managua`, editables en DRAFT. Cualquiera puede omitirse;
   si existen ambos, fin >= inicio. No son fechas de ejecución y no se agrega `plannedDate`.

La especificación y `database.md` registran estas decisiones. Los ADR aceptados se conservan
como registro de PR0; estas políticas no se presentan como obligaciones originales del ADR 014.

## Contratos y concurrencia

La OP guarda `bomVersionId`; activar otra versión no altera su referencia. Un PATCH que omite
producto/versión conserva esa selección histórica, aunque ya no sea la activa. Elegir explícitamente
otra versión exige que esté activa y pertenezca al producto. Se revalida después de esperar bloqueos.

Creación: cabecera BOM → secuencia OP → productos por UUID ascendente → almacén.
Edición: OP → cabecera BOM → productos ordenados → almacén. OP/BOM usan `FOR UPDATE`;
catálogo usa `FOR SHARE`, incompatible con los editores `FOR NO KEY UPDATE`.
Cancelación bloquea la OP y solo admite DRAFT; catálogo inactivo no impide cancelarla.

Requerimientos se reconstruyen desde la versión persistida, sin tabla derivada adicional.
Devuelven `required`, `available`, `shortage` como strings y `canStart` informativo.
Para trazables, solo los lotes RELEASED del almacén cuentan como consumibles.
La consulta no ofrece una instantánea transaccional de todos los componentes ni garantiza
stock futuro; C-2 deberá revalidar. La UI evita mostrar requisitos de una revisión anterior
actualizando detalle y requerimientos juntos. Editar otro campo conserva los segundos de
fechas introducidas por API aunque el formulario muestre minutos.

## Migraciones y preservación

- `20261010180000_production_boms`: tablas BOM/versiones/items, auditoría, checks,
  índice parcial y triggers de inmutabilidad. Se conserva idéntica al checkpoint anterior al rebase.
- `20261010220000_production_orders`: OP, enum de estados, secuencia OP, entidad/acción de auditoría,
  FKs, índices y checks de cantidades/ventana de fechas.
- Las cuatro migraciones publicadas y `migration_lock.toml` conservan sus hashes de `origin/develop`.

Validación en PostgreSQL 18.6: instalación vacía de seis migraciones y upgrade desde las cuatro
publicadas con datos en 11 tablas. Sus filas permanecieron idénticas después de migrar y de crear
la primera OP. Continuaron ledger/auditoría append-only y saldo no negativo. Fueron 72 comprobaciones
aprobadas; el despliegue Prisma también aplicó la migración OP en la base aislada de pruebas.
La base de trabajo no se utilizó y no se eliminaron datos ni bases existentes.

Rollback: conservar migraciones y documentos. Retirar las rutas/pantallas de Producción exige
mantener un cliente Prisma y los valores/prefijos de enum compatibles con OP y su auditoría;
no se propone ejecutar ciegamente un build A-1 anterior sobre estos datos ni borrar tablas/enums.
Las cantidades y documentos anteriores no se transforman por estas migraciones aditivas.

## Coordinación y pendientes

El catálogo todavía no configura `isLotTracked` por API. Crear BOM requiere productos con ese
flag habilitado; las pruebas instalan fixtures trazables en su base aislada. La configuración
corresponde a Inventario A-2 y debe coordinarse con su responsable; no se agrega un endpoint
paralelo de catálogo. El guard de tipo/unidad de `ProductsService` está aislado en su propio commit.

C-2 depende además de Compras y del contrato necesario de Inventario. No se inicia en este PR.

## Validación

- Backend unitario completo: 148/148 aprobado.
- API BOM: 20/20 aprobado; API órdenes: 22/22 aprobado.
- UI órdenes: 8 casos, incluidos permisos, creación, edición, cancelación, filtros, revisión
  obsoleta y refresco tras edición de otra persona; regresión frontend completa en ejecución.
- BOM calculator: ejemplo de 100 jabones y precisión cubiertos por las pruebas unitarias.
- Backend/frontend build aprobado; verificación final de lint, formato, enlaces y diff pendiente.
- Regresión e2e general en ejecución; los resultados finales se registran antes del commit.

No se atribuye esta implementación a `develop` ni se afirma una revisión manual de navegador.
Los checks remotos se consultan tras publicar el PR; el merge queda a cargo del responsable.
