# D6 — Dashboard General / Home

Home sigue en `/`, el index autenticado de AppLayout. La navegación **Inicio**
sigue apuntando a `/`; no hay `/general/dashboard`, `/home/dashboard` ni un enlace
General · Dashboard. Mantiene bienvenida, nombre, rol y accesos de cuenta por rol.

Base: `develop` en `4fe72b6f686e9006a8c02afdd550b4649cc38741`, merge del
[PR #42 / D5](https://github.com/Luigui789/Manufactura/pull/42), confirmado antes
de crear `feature/general-dashboard`. Contiene C1–C7 y D1–D5.

## Una composición de contratos existentes

No hay un contrato empresarial JSON nuevo ni API General. Home reutiliza sin
cambios los hooks TanStack Query y tipos de estas fuentes:

| Fuente        | GET (prefijo `/api`)            | Hook                     | Enlace                  |
| ------------- | ------------------------------- | ------------------------ | ----------------------- |
| D1 Producción | `/production/dashboard`         | `useProductionDashboard` | `/production/dashboard` |
| D2 Inventario | `/inventory/dashboard`          | `useInventoryDashboard`  | `/inventory/dashboard`  |
| D3 Compras    | `/purchases/dashboard`          | `usePurchasesDashboard`  | `/purchases/dashboard`  |
| D4 Ventas     | `/sales/dashboard`              | `useSalesDashboard`      | `/sales/dashboard`      |
| D5 Calidad    | `/production/quality/dashboard` | `useQualityDashboard`    | `/quality/dashboard`    |

Los cinco hooks se montan en paralelo, con las mismas fechas explícitas. No hay
un Promise.all que haga fallar toda la pantalla. No cambian fetchers, tipos,
servicios, reglas temporales, permisos ni SQL D1–D5. No se añade código productivo
backend, controller, DTO, Prisma, migración, writer ni seed.

Cada endpoint conserva su snapshot y su semántica. La página no promete una
transacción global ni un snapshot atómico entre cinco requests independientes.

## Calendario común

`defaultHomePeriod` calcula una sola vez al montar el Home el día de
`America/Managua`, con Intl.DateTimeFormat y formatToParts. Los últimos 30 días
incluyen hoy. La aritmética UTC se usa únicamente sobre etiquetas de calendario,
sin tomar el día local del navegador. Las cinco consultas reciben exactamente
`from` y `to` en `YYYY-MM-DD`; ninguna resuelve su default por separado.

El formulario solo tiene Desde/Hasta, Aplicar y Actualizar. No hay producto,
almacén, proveedor ni cliente global. Al aplicar se validan fechas de calendario,
`from <= to` y máximo 366 días inclusivos. Un rango inválido muestra error con
aria-describedby, conserva la última selección válida y no dispara consultas.
Los controles muestran el período efectivo. Actualizar refetchea las cinco
fuentes sin recalcular el período, incluso al atravesar medianoche.

Se verifica `from`, `to`, `timeZone = America/Managua` y granularidad entre las
respuestas disponibles. Una discrepancia se informa visiblemente; no se cambia
el período del servidor para ocultarla. Una respuesta con fechas/zona distintas
no alimenta sus métricas. Series comerciales con períodos/granularidad
incompatibles no se unen.

## Métricas seleccionadas

| Dominio    | Estado actual                                                                                                | Actividad del período                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Producción | No se infiere una cola global                                                                                | Órdenes total, completadas y en proceso, siguiendo pertenencia al período D1 |
| Inventario | Posiciones con existencia, lotes con existencia, liberados, cuarentena, rechazados y marcados para reproceso | No se inventa stock histórico                                                |
| Compras    | Pendientes de recepción y vencidas                                                                           | Órdenes, recepciones, valor comprometido y proveedores con actividad         |
| Ventas     | Pendientes de despacho                                                                                       | Órdenes, despachos, valor confirmado y clientes con actividad                |
| Calidad    | Pendientes de inspección, rechazos sin disposición y lotes marcados para reproceso                           | Inspecciones, aprobadas, rechazadas, tasa y disposiciones de descarte        |

Las etiquetas «Estado actual» y «Actividad del período» distinguen ambas
perspectivas. Producción no presenta inProgress como toda la fábrica: es un
estado de órdenes pertenecientes al período según D1. Compras mantiene orderedAt /
receivedAt; Ventas orderedAt / dispatchedAt; Calidad inspectedAt / decidedAt.
No se vuelve a calcular ninguna de esas métricas en Home.

Valores comprometido y confirmado se muestran como sus Decimal strings, sin
convertirlos a Number ni añadir moneda. No se suman ni se comparan como margen.
La tasa de aprobación de D5 se muestra como porcentaje; null se representa con
`—`. No se convierte ausencia de inspecciones en 0%. Reproceso solo indica lote
marcado; REJECTED conserva su historia aunque reciba RELEASE.

«Requieren atención» muestra seis cifras enlazadas, por separado: pendientes y
vencidas de Compras, pendientes de despacho de Ventas y las tres colas de Calidad.
No hay suma, severidad común ni total de problemas: pueden solaparse y representan
unidades conceptuales diferentes.

## Gráficos y sostenibilidad

Dos gráficos Recharts, con carga de código separada del Home:

- Actividad comercial: une las filas de Compras y Ventas por `period`, después de
  verificar período, zona y granularidad. Conserva cuatro series distintas:
  órdenes de compra, recepciones, órdenes de venta y despachos. Ordena etiquetas;
  una fila ausente en una serie conserva ceros en esa serie. No suma series.
- Inspecciones de calidad: aprobadas y rechazadas del D5, sin mezclar disposiciones.

Incluyen nombres, leyendas, trazos diferentes, tablas accesibles y animaciones
desactivadas. No se inspeccionan nodos SVG en tests. Grids envuelven tarjetas en
móvil/tablet/desktop, gráficos usan contenedor responsive y tablas tienen overflow.
Formularios con labels, errores asociados, botones y enlaces nativos, foco del
sistema visual existente y regiones con nombres por módulo.

Sostenibilidad enlaza `/sustainability`, con «Huella parcial de carbono y
circularidad» y el CarbonDisclaimer existente. No dispara una sexta consulta,
no suma huellas históricas ni muestra carbono corporativo o una comparación
entre bases funcionales distintas.

## Errores y carga parcial

Cada tarjeta observa su query: loading compacto, error y botón Reintentar de ese
módulo. Un fallo de Ventas deja visibles Producción, Inventario, Compras y Calidad.
Atención muestra Cargando o No disponible cuando corresponde, nunca un cero
fabricado. Una gráfica derivada espera únicamente sus fuentes; no bloquea las
otras tarjetas. Cabecera, filtros, enlaces y accesos no esperan a cinco respuestas.
Actualizar refetchea manualmente, sin polling, WebSocket ni SSE.
Los errores de sesión conservan el tratamiento global de autenticación existente.

## Límites deliberados y pruebas

No se crean totalOperations, ERPScore, salud global, alertas combinadas, moneda,
revenue, margen, beneficio, cash flow, stock físico multi-UOM, producción física
global, OEE nuevo ni huella corporativa. No se selecciona un producto artificial
para conseguir una cantidad. No hay exportaciones, predicción, IA ni D7.

`frontend/src/features/home/HomeDashboard.test.tsx` cubre calendario en ambos lados
de medianoche de Managua y cambio de año, fechas/rango, período compartido,
request filters, módulos, atención, strings Decimal, tasa null, gráficos/tablas,
períodos incompatibles, errores/retry/carga parciales, ruta Inicio y accesos por
los cinco roles. Los tests previos de rutas reciben fixtures de las cinco nuevas
lecturas Home; sus assertions de autenticación/navegación se conservan.

Docker smoke verifica los cinco GET con un período explícito idéntico y el E2E
integrado comprueba, después del flujo oficial, período compatible y actividad
propia de cada dominio. No cambia el dataset ni replica todas las assertions D1–D5.
Resultados de gates: [validación D6](general-dashboard-validation.md).

D6 cierra D1–D6. Tras el merge se restablece FEATURE FROZEN; no existe D7.
Se conservan los reportes históricos C7. Decisión vigente:
[feature freeze](feature-freeze.md).
