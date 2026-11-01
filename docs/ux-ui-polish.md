# UX1 — Pulido final de UX/UI

Fase exclusivamente de presentación sobre `develop` con C1–C7 y D1–D6 integrados (D6: PR #43).
No es D7: no agrega funcionalidad, no cambia reglas, KPIs, contratos, schema, migraciones, writers,
dataset ni rutas.

## Objetivo

Que un usuario nuevo responda en segundos: dónde está, qué requiere atención, qué puede hacer y a
qué módulo ir, sin leer bloques largos de texto.

## Principios aplicados

- **Jerarquía:** título → período → atención → KPIs → gráficas → detalle → notas metodológicas.
- **Ruido mínimo:** los ceros siguen visibles pero en tono secundario; las notas metodológicas se
  conservan como texto discreto (`DashboardNote`) junto a los datos que explican.
- **Consistencia:** los cinco dashboards comparten filtros, tarjetas de KPI, secciones, gráficas,
  tablas y estados.
- **Divulgación progresiva:** Inicio resume; el detalle vive en cada dashboard.

## Navegación

- Menú agrupado por módulo (`frontend/src/layouts/navigation.ts`): General, Operaciones (Compras,
  Ventas, Producción, Calidad, Inventario como secciones expandibles), Análisis, Maestros y
  Administración.
- El módulo de la ruta actual se expande solo, también en deep links y con atrás/adelante; la
  entrada activa usa `aria-current="page"`.
- Las etiquetas visibles son cortas («Órdenes», «Resumen»); el nombre accesible incluye el módulo
  («Producción · Órdenes»).
- El drawer móvil usa exactamente la misma estructura. El encabezado muestra «Módulo / Página».
- Rutas, visibilidad por rol y `RouteGuards` no cambian.

## Componentes compartidos

| Componente                                              | Uso                                                   |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `MetricCard`, `MetricGrid`                              | KPI con el número como elemento dominante.            |
| `DashboardSection`                                      | Separa «Estado actual / Pipeline actual» del período. |
| `DashboardFilterBar`                                    | Desde/Hasta, Aplicar, acciones y filtros de catálogo. |
| `DashboardNote`                                         | Notas metodológicas discretas.                        |
| `chartGrid`, `chartAxis`, `chartTooltip`, `chartLegend` | Estilo común de Recharts sobre tokens del tema.       |
| `.table-link`                                           | Enlaces dentro de tablas.                             |

Los componentes viven en `frontend/src/components/dashboard.tsx` y los helpers sin JSX de
componente en `frontend/src/lib/dashboard.tsx`. Se reutilizan `PageHeader`, `StatusBadge`,
`EmptyState`, `LoadingState` y `ErrorNotice`.

## Pantallas revisadas

- **Inicio:** filtro compacto, «Requieren atención» agrupado por dominio (Compras, Ventas,
  Calidad, sin sumar), tarjetas de módulo con un KPI principal y dos secundarios, acción común
  «Abrir dashboard», Sostenibilidad como bloque informativo y accesos rápidos al final.
- **D1–D5:** breadcrumb «Módulo / Resumen», barra de filtros común con «Limpiar filtros»
  (solo frontend), secciones de estado actual y período separadas, números alineados a la derecha
  en tablas. En Calidad la cola de atención se muestra dentro de «Estado actual».
- **Listados operativos:** breadcrumb «Módulo / Página» y descripciones en voseo consistente.
- **Sostenibilidad y listados:** «Reintentar» como acción secundaria (outline).

## Responsive y accesibilidad

- Revisado a 375, 768, 1024 y 1440 px: una columna en móvil, dos en tablet y tres en escritorio
  para el resumen operativo; tablas con `overflow-x-auto`; gráficas en `ResponsiveContainer`.
- Se conservan skip-link, landmarks, `aria-label`, captions de tabla y alternativas tabulares de
  las gráficas. Los módulos del menú son botones con `aria-expanded` y `aria-controls`.

## Límites

- Sin dependencias nuevas, sin cambios de backend y sin cambios en semántica de KPIs.
- No se movieron filtros a la URL ni se agregó estado global.
- `CarbonDisclaimer` fue retirado antes de UX1 (commit `c1d42af`) y no se restaura.
- `.entity-summary` (selector de entidad en formularios) conserva su borde izquierdo de 4 px:
  es un patrón previo usado por todos los formularios y queda fuera del alcance de UX1.
