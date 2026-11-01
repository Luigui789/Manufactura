# Congelamiento funcional EcoSoap ERP

**Estado: alcance reabierto exclusivamente para D5 — Dashboard de Calidad**

La decisión D5 autoriza un dashboard de calidad de lectura agregada, con estado
actual y actividad del período. No autoriza D6, migraciones ni cambios en las
reglas de escritura. El reporte C7 conserva sus resultados históricos.

| Dashboard       | Estado                     |
| --------------- | -------------------------- |
| D1 Producción   | Integrado                  |
| D2 Inventario   | Integrado (PR #39)         |
| D3 Compras      | Integrado (PR #40)         |
| D4 Ventas       | Integrado (PR #41)         |
| D5 Calidad      | Autorizado / en desarrollo |
| D6 General/Home | Excluido                   |

C7 cerró la fase técnica previa; D1–D4 están integrados y D5 es la nueva excepción autorizada.
El código se entrega a revisión;
la aprobación de merge exige los checks nuevos de C7 en verde y revisión humana.
No se habilita auto-merge ni squash. Base D5: `develop` en `82dfb1f1757441814fe83ffac71f063ae38e83c9`, con C1–C7, D1–D4 y PR #41 mergeado.

## Incluido

Authentication/RBAC; productos/UOM y almacenes; proveedores/clientes; compras y
recepciones; inventario con ledger; BOM multinivel; Production Routes; órdenes
de producción; lotes y trazabilidad; calidad y disposition; ventas/despachos;
IIoT/MQTT y simulador de demostración; dashboards de Producción, Inventario, Compras y Ventas; Calidad (D5 autorizado); sostenibilidad,
carbono y circularidad; dataset oficial y E2E integrado de defensa.

## Excluido

Contabilidad, RRHH/nómina, tesorería y mantenimiento. Continúa excluido el
dashboard General/Home (D6).
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

Con la excepción explícita de D5 (D1–D4 integrados), después del merge de C7 solo se aceptan bugs críticos con reproducción y regresión,
correcciones documentales y ajustes de defensa sin cambio funcional. No módulos,
otros dashboards, upgrades oportunistas ni ampliación de fórmulas/rutas/IIoT/calidad/carbono.
No iniciar C8. La siguiente etapa es informe final, manual/evidencias, bitácora,
capturas y ensayo de defensa.

Pruebas y revisión: [reporte C7](final-hardening-report.md).
Operación: [runbook](defense-runbook.md), [smoke](final-smoke-checklist.md) y
[guion integrado](defense-demo-checklist.md).
