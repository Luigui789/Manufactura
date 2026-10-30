# Dashboard IIoT — Fase 7

El monitoreo forma parte del ERP en `/production/orders/:id/iiot`. Se carga de forma
diferida dentro de los guards existentes de sesión y contraseña vigente; cualquier rol
autenticado puede consultarlo, igual que la API de Fase 6. El detalle de una OP ofrece
**Monitoreo IIoT** para `IN_PROGRESS` y `COMPLETED`, sin sustituir las acciones de
producción. No se añade un módulo al sidebar. El acceso directo también admite órdenes
`DRAFT` y `CANCELLED` válidas.

## Componentes y contrato

```text
frontend/src/features/iiot/
├── api/monitoring.ts
├── components/
│   ├── AlertsTable.tsx
│   ├── MetricCard.tsx
│   └── TelemetryChart.tsx
├── pages/IiotDashboardPage.tsx
├── presentation.ts
├── types.ts
└── test/fixtures.ts
```

Se reutilizan `apiFetch`, `VITE_API_URL`, TanStack Query, `PageHeader`, `StatusBadge`,
`LoadingState`, `ErrorNotice`, `EmptyState`, estilos y tipografía del ERP.
La [API de Fase 6](iiot-monitoring-api.md) es la única fuente de datos:

| Hook                                         | Ruta relativa a `VITE_API_URL`                            | Query key                                               |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `useIiotOverview(orderId)`                   | `/iiot/production-orders/:id/overview`                    | `['iiot', orderId, 'overview']`                         |
| `useIiotReadings(orderId, filters, options)` | `/iiot/production-orders/:id/readings?metric=…&limit=100` | `['iiot', orderId, 'readings', { metric, limit: 100 }]` |
| `useIiotAlerts(orderId, filters, options)`   | `/iiot/production-orders/:id/alerts?limit=20&severity=…`  | `['iiot', orderId, 'alerts', { severity, limit: 20 }]`  |

Las consultas propagan `AbortSignal` y conservan el manejo central de sesión de
`apiFetch`. No existe otro cliente HTTP. Los conteos de lecturas, advertencias,
críticas y alertas sin reconocer proceden exclusivamente de los agregados del overview.

## Histórico y métricas

Se muestra una card por métrica presente en `latestByMetric`, con valor, unidad,
dispositivo, medición y recepción. Se soportan temperatura, humedad, pH, nivel de
tanque y RPM del mezclador. El selector usa ese orden canónico y selecciona la primera
métrica disponible; no solicita un histórico sin métricas.

Recharts es la única librería de gráficas y está instalada solo en frontend. La gráfica
de línea consulta como máximo las últimas 100 lecturas de la métrica seleccionada.
Copia el array y lo invierte de DESC a ASC antes de dibujar; nunca modifica el caché.
El eje temporal usa `recordedAt`, con unidades y tooltip. Solo los puntos de la gráfica
convierten temporalmente `value` a `number`; las cards, tooltip y tablas conservan el
string decimal original, incluidos sus cuatro decimales. La representación numérica
de la gráfica puede perder precisión para valores grandes de `Decimal(18,4)`.

Hay resumen textual y tabla desplegable del histórico, además de navegación por
teclado de Recharts. No hay animación de los puntos. Cards en 1/2/4 columnas según
ancho, gráfica adaptable y tablas con scroll horizontal; etiquetas visibles, headings
jerárquicos y tablas semánticas.

## Alertas

Se consultan hasta 20 alertas recientes. El selector **Todas / Advertencia / Crítica**
envía `severity` al backend; no filtra solo una página en React. La tabla muestra
severidad con texto e icono, tipo, mensaje, métrica, valor, dispositivo y fecha.
Si `reading` es null, métrica, valor y dispositivo muestran `—`.

## Actualización y estados

`monitoringInterval(status)` devuelve 5000 solo para `IN_PROGRESS`, y false para
los demás estados. Se usa `refetchInterval` de TanStack Query en las tres consultas,
con el estado del overview; no hay temporizadores manuales. TanStack Query pausa el
polling en pestañas ocultas de forma predeterminada.

Una OP `COMPLETED` se consulta y conserva el histórico sin polling continuo.
El botón **Actualizar** refresca las consultas activas del dashboard sin recargar la
página, muestra actividad y conserva los datos existentes. **Última actualización del
resumen** procede del `dataUpdatedAt` del overview, no de una fecha de telemetría.
Todas las fechas visibles usan `America/Managua`, incluyendo segundos cuando corresponde.

Carga inicial, actualización de fondo, error y ausencia de datos se presentan por
sección. Un error de histórico o alertas mantiene el resto disponible. Un error de
overview conserva su último resultado y detiene el polling hasta actualizar manualmente.
Un 404 no se reintenta automáticamente ni mantiene polling; overview 404 oculta los
datos previos y ofrece **Volver a órdenes de producción**.

## Límites y verificación

Solo lectura REST: no hay conexión MQTT desde el navegador, WebSocket, SSE ni
acknowledgement. Tampoco se modifican backend, schema, migraciones, simulador,
inventario. La [Fase 8](iiot-quality-integration.md) reutiliza estos hooks para mostrar
evidencia compacta dentro de Calidad, manteniendo la decisión humana.

Las pruebas de `api/monitoring.test.tsx` usan TanStack Query real y verifican rutas,
filtros, claves, errores y polling con reloj simulado, incluida la transición a
`COMPLETED`. `pages/IiotDashboardPage.test.tsx` cubre carga, agregados, precisión,
selección, alertas nullable, filtros, empty states, errores parciales y refresco manual.
Comprueba la gráfica real y su tabla sin mutar el origen. `AppRoutes.test.tsx` prueba
guards, acceso de VENTAS y navegación; `ProductionOrders.test.tsx` prueba el enlace
según estado y preserva las pruebas existentes de acciones de producción.

Validación local: `pnpm --filter frontend test`, `pnpm lint`, `pnpm format:check`,
`pnpm build`, pruebas de backend/simulator y el stack de [Docker](docker.md).
La CI mantiene sus gates de calidad, pruebas y aceptación Docker existentes.
