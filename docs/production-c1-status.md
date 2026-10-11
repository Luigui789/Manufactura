# Producción C-1 — primer bloque local

Fecha: 2026-10-10. Rama: `feature/production-core`.
Base: `develop` en `37e2548` (PR0 integrado mediante PR #11).

Este bloque implementa el inicio indicado en el punto 171 del plan de ejecución:
`BillOfMaterial`, `BomVersion`, `BomItem` y `BomCalculatorService`, con API,
pantallas y pruebas. C-1 completo sigue en desarrollo; no hay PR de Producción.

Fuentes: [diseño de la ronda](specs/2026-10-10-inventory-purchases-production-design.md)
y [ADR 014](decisions/014-versionado-bom-y-ejecucion-produccion.md).

## Implementado localmente

- Cabecera única por producto: creación, nombre, activación/desactivación y consulta paginada.
- Versiones consecutivas bajo bloqueo de la cabecera; componentes sin duplicados ni autorreferencia.
- Primera versión activa automáticamente; las siguientes se activan explícitamente.
- Índice parcial de PostgreSQL que permite una sola versión activa por fórmula.
- Contenido guardado sin endpoints de edición ni borrado. Triggers impiden modificar o borrar
  versiones y componentes existentes; solo la activación de una versión es mutable.
- Salida activa `INTERMEDIATE` o `FINISHED_GOOD` con `isLotTracked=true`.
- Componentes activos `RAW_MATERIAL`, `CONSUMABLE` o `INTERMEDIATE`.
- Revalidación del catálogo al crear/activar versiones y calcular; los intermedios no se expanden.
- Cada cantidad usa `Product.unit`, sin campo de unidad duplicado ni conversiones.
- Productos referenciados por fórmulas conservan tipo y unidad mediante una restricción en
  `ProductsService`; cambiar nombre o estado mantiene las políticas existentes.
- Mutaciones y auditoría en la misma transacción; fallo de auditoría revierte la operación.
- Escritura para ADMIN/PRODUCCION; consulta y cálculo para cualquier usuario autenticado.
- Interfaz `/production/boms` y detalle: creación, versiones, activación y cálculo.
- Selectores de productos con filtros, búsqueda y paginación; cantidades siempre como strings.

Las operaciones BOM no escriben saldos, movimientos, lotes ni secuencias de documentos.
No se incorporó ni copió el desarrollo local de Inventory A-1.

## Cálculo y precisión

`requerido = cantidad_componente × cantidad_planificada / cantidad_base_salida`.

Se utilizan decimales con contexto aislado de precisión 60. El servicio verifica el residuo
antes de dividir y rechaza resultados no representables exactamente con cuatro decimales,
incluidos subescala y desbordamiento de `Decimal(18,4)`. No redondea silenciosamente.

Esta es la política conservadora del borrador local para la decisión de precisión que el
ADR 014 deja abierta; debe confirmarse al revisar el bloque. Todas las versiones creadas
se conservan inmutables, incluso antes de asociarlas a una OP.

Ejemplo verificado para 100 jabones, salida base 1:

| Componente | Cantidad base | Requerimiento |
| ---------- | ------------- | ------------- |
| Aceite     | 500           | 50000.0000    |
| Soda       | 70            | 7000.0000     |
| Agua       | 180           | 18000.0000    |
| Fragancia  | 5             | 500.0000      |

## Transacciones y migración

Las modificaciones de una fórmula bloquean primero su cabecera `FOR UPDATE`, y después
los productos únicos por UUID ascendente `FOR SHARE`. Este bloqueo de productos es incompatible
con el `FOR NO KEY UPDATE` usado por el editor de catálogo. El cálculo también toma esos
bloqueos para revalidar un catálogo coherente.

La migración nueva `20261010180000_production_boms` agrega tres tablas, dos tipos de entidad
de auditoría, claves foráneas, checks positivos, índice de versión activa y triggers.
Las cuatro migraciones publicadas anteriores no se modifican.

Se probó exclusivamente en bases nuevas dedicadas `*_test`, no en la base de trabajo.
La prueba de upgrade conserva idénticas las filas de 11 tablas existentes: roles, usuarios,
productos, almacenes, lotes, saldos, movimientos, auditoría, secuencias, proveedores y clientes.
Se verificó además que continúan las protecciones de auditoría/ledger append-only y saldo no negativo.

La migración permanece local: su integración definitiva debe coordinarse sobre el `develop`
actualizado después de las dependencias indicadas en la especificación.

## Pendiente para completar C-1

- `ProductionOrder`: creación en DRAFT, edición, cancelación y persistencia de una versión concreta.
- Numeración OP mediante el servicio de secuencias real de Inventory A-1.
- Disponibilidad informativa mediante el `StockQueryService` definitivo; no se creó un proveedor simulado.
- Pantallas y pruebas de órdenes y disponibilidad.
- Actualizar la rama con `develop` después del merge de A-1 y coordinar Prisma.

El catálogo integrado no permite configurar `isLotTracked` por API todavía. Por eso, crear
una fórmula desde la UI requiere productos que ya tengan el flag habilitado; las pruebas crean
fixtures así en su base aislada. Debe coordinarse la habilitación de ese campo con el responsable
de Inventario. No se agrega un endpoint paralelo de catálogo en Producción.

No se inicia C-2: ejecución, consumo, output, lotes, calidad y trazabilidad dependen además
de Inventario y Compras.

## Validación

Resultados de la primera verificación:

- cálculo: 13 pruebas unitarias aprobadas, incluido el ejemplo de 100 jabones;
- API BOM: 20 pruebas e2e aprobadas, incluyendo permisos, creación/activación simultánea,
  inmutabilidad, rollback al crear y activar, carrera de edición de unidad/tipo contra publicación
  de una versión y ausencia de escrituras de inventario;
- schemas frontend: 102 pruebas aprobadas;
- formularios: 5 pruebas aprobadas, incluyendo resultados obsoletos y preservación del borrador;
- backend y frontend compilaron;
- lint, Prettier y diff check aprobados;
- upgrade sobre datos existentes aprobado.

Regresiones: 85 pruebas unitarias backend y 235 frontend aprobadas. Las pruebas e2e
restantes aprobaron 222 casos; Foundation aprobó 11 después de completar su fixture de
almacén faltante. Sumadas a las 20 de BOM, acreditan 253 casos e2e por suites.
La ejecución e2e general inicial omitió Foundation por ese fixture; no se presenta como
una ejecución general aprobada.

La revisión detectó además arrays anidados en `items`: se incorporó validación de objeto
por componente y un caso HTTP de regresión.

No se ejecutó CI remoto ni Docker build en este bloque. Los cambios siguen sin stage, commit ni push.
