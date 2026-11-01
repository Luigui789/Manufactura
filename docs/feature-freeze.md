# Congelamiento funcional EcoSoap ERP

**Estado: alcance reabierto exclusivamente para D2 — Dashboard de Inventario**

La decisión D2 autoriza un dashboard de inventario de lectura agregada, con
existencia actual y actividad del período. No autoriza D3–D6, migraciones ni
cambios en las reglas de escritura. El reporte C7 conserva sus resultados históricos.

C7 cerró la fase técnica previa; D2 es la excepción posterior autorizada.
El código se entrega a revisión;
la aprobación de merge exige los checks nuevos de C7 en verde y revisión humana.
No se habilita auto-merge ni squash. Base: `develop` con C1–C6 y PR #37 mergeado.

## Incluido

Authentication/RBAC; productos/UOM y almacenes; proveedores/clientes; compras y
recepciones; inventario con ledger; BOM multinivel; Production Routes; órdenes
de producción; lotes y trazabilidad; calidad y disposition; ventas/despachos;
IIoT/MQTT y simulador de demostración; dashboards de Producción e Inventario (D2); sostenibilidad,
carbono y circularidad; dataset oficial y E2E integrado de defensa.

## Excluido

Contabilidad, RRHH/nómina, tesorería y mantenimiento. Continúan excluidos los
dashboards generales, de compras, ventas y calidad (D3–D6).
No se promete ejecución MES por operación, MRP recursivo automático, plataforma
IIoT de alta disponibilidad, despliegue productivo endurecido ni certificación de carbono.

## Limitaciones conocidas

- Las rutas son catálogo/planificación, no ejecución por paso. Cada nivel de
  producción es una OP explícita y requirements/huellas son de consumo directo.
- Factores DEMO, formulación de líquido y perfiles IIoT son supuestos académicos.
  La huella es parcial cradle-to-gate; energía manual, circularidad separada,
  sin certificación externa ni ACV completo.
- MQTT usa QoS 0 descartable; solo OP IN_PROGRESS acepta lecturas. Completarla
  durante una simulación puede rechazar mensajes tardíos. El estado del control
  de simulación vive en memoria; no se promete continuidad tras reiniciar backend.
- C6 consume una base `_test` limpia; una demo usada queda NOT READY. Recuperación
  manual con Docker, sin reset/reposición automática ni modificación histórica.
- No se garantiza profundidad arbitraria de árboles ni rendimiento fuera del
  dataset normal. Los detalles de errores inesperados se omiten de logs para
  evitar secretos; se conserva requestId para correlación.
- `tsc --noEmit` adicional conserva errores previos de tipos en tests fuera del
  build oficial. Warnings de pg/MaxListeners de tests y chunks de frontend se
  registran en el reporte; no bloquean gates oficiales ni justifican upgrades.

## Cambios posteriores permitidos

Con la excepción explícita de D2, después del merge de C7 solo se aceptan bugs críticos con reproducción y regresión,
correcciones documentales y ajustes de defensa sin cambio funcional. No módulos,
otros dashboards, upgrades oportunistas ni ampliación de fórmulas/rutas/IIoT/calidad/carbono.
No iniciar C8. La siguiente etapa es informe final, manual/evidencias, bitácora,
capturas y ensayo de defensa.

Pruebas y revisión: [reporte C7](final-hardening-report.md).
Operación: [runbook](defense-runbook.md), [smoke](final-smoke-checklist.md) y
[guion integrado](defense-demo-checklist.md).
