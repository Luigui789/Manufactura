# Congelamiento funcional EcoSoap ERP

**Estado: D1–D6 implementados — FEATURE FROZEN tras merge de D6**

D6 completa la composición de lectura de D1–D5 en Home `/`, sin reglas duplicadas,
migraciones ni cambios a writers. D6 está implementado y pendiente de merge.
Tras merge de D6 el alcance de dashboards D1–D6 queda completo y vuelve a
**FEATURE FROZEN — D1–D6 completos**. No D7; no se abren dashboards automáticamente.
El reporte C7 conserva sus resultados históricos.

| Dashboard       | Estado                            |
| --------------- | --------------------------------- |
| D1 Producción   | Integrado                         |
| D2 Inventario   | Integrado (PR #39)                |
| D3 Compras      | Integrado (PR #40)                |
| D4 Ventas       | Integrado (PR #41)                |
| D5 Calidad      | Integrado (PR #42)                |
| D6 General/Home | Implementado / pendiente de merge |

C7 cerró la fase técnica previa; D1–D5 están integrados y D6 completa el plan autorizado de dashboards.
El código se entrega a revisión;
la aprobación de merge exige los gates oficiales vigentes en verde y revisión humana.
No se habilita auto-merge ni squash. Base D6: `develop` en `4fe72b6f686e9006a8c02afdd550b4649cc38741`, con C1–C7, D1–D5 y PR #42 mergeado.

## Incluido

Authentication/RBAC; productos/UOM y almacenes; proveedores/clientes; compras y
recepciones; inventario con ledger; BOM multinivel; Production Routes; órdenes
de producción; lotes y trazabilidad; calidad y disposition; ventas/despachos;
IIoT/MQTT y simulador de demostración; dashboards de Producción, Inventario, Compras, Ventas, Calidad y General/Home (D6 implementado); sostenibilidad,
carbono y circularidad; dataset oficial y E2E integrado de defensa.

## Excluido

Contabilidad, RRHH/nómina, tesorería y mantenimiento. No existe D7 ni se autoriza ningún dashboard adicional.
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

Tras el merge de D6, con D1–D6 completos, el alcance queda FEATURE FROZEN.
Solo se permiten:

- Bugs críticos con reproducción y prueba de regresión.
- Documentación.
- Ajustes de defensa sin cambio funcional.
- Correcciones de compatibilidad sin ampliar alcance.

No existe D7. No se autorizan módulos, nuevos dashboards, upgrades oportunistas
ni ampliación de fórmulas, rutas, IIoT, calidad o carbono.
No iniciar C8. La siguiente etapa es informe final, manual/evidencias, bitácora,
capturas y ensayo de defensa.

Pruebas y revisión: [reporte C7](final-hardening-report.md).
Operación: [runbook](defense-runbook.md), [smoke](final-smoke-checklist.md) y
[guion integrado](defense-demo-checklist.md).
