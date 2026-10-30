# API de monitoreo IIoT — Fase 6

API REST de solo lectura para preparar el dashboard de Fase 7. Consulta PostgreSQL
mediante Prisma dentro de `IiotModule`, sin depender de `OrdersService`.
No modifica producción, calidad ni inventario; no requiere cambios de schema ni migraciones.

## Endpoints y acceso

El prefijo global es `/api`. Las tres rutas requieren cookie de sesión válida
(`@Authenticated()`), para cualquier rol autenticado, igual que la consulta de OP.
Sin sesión: `401`. UUID o filtros inválidos: `400`. OP inexistente: `404` en las tres rutas.
No se exige `IN_PROGRESS`: una OP `COMPLETED` conserva todo su historial consultable.
Swagger está disponible en `/api/docs`.

| Método | Ruta                                       | Respuesta                                    |
| ------ | ------------------------------------------ | -------------------------------------------- |
| GET    | `/api/iiot/production-orders/:id/overview` | `{ data, message }`                          |
| GET    | `/api/iiot/production-orders/:id/readings` | `{ data: [], meta: { page, limit, total } }` |
| GET    | `/api/iiot/production-orders/:id/alerts`   | `{ data: [], meta: { page, limit, total } }` |

## Overview

```json
{
  "data": {
    "productionOrder": {
      "id": "019a3210-0000-7000-8000-000000000001",
      "number": "OP-000001",
      "status": "COMPLETED",
      "startedAt": "2026-10-30T10:00:00.000Z",
      "completedAt": "2026-10-30T12:00:00.000Z",
      "product": {
        "id": "019a3210-0000-7000-8000-000000000002",
        "code": "SOAP-01",
        "name": "Jabón"
      }
    },
    "telemetry": {
      "totalReadings": 240,
      "lastReadingAt": "2026-10-30T11:59:00.000Z",
      "latestByMetric": [
        {
          "id": "019a3210-0000-7000-8000-000000000003",
          "productionOrderId": "019a3210-0000-7000-8000-000000000001",
          "metric": "TEMPERATURE",
          "value": "27.2500",
          "unit": "°C",
          "recordedAt": "2026-10-30T11:59:00.000Z",
          "receivedAt": "2026-10-30T11:59:01.000Z",
          "device": {
            "id": "019a3210-0000-7000-8000-000000000004",
            "code": "CURING-01",
            "name": "Curado"
          }
        }
      ]
    },
    "alerts": {
      "total": 14,
      "warning": 10,
      "critical": 4,
      "unacknowledged": 14,
      "lastAlertAt": "2026-10-30T11:58:00.000Z"
    }
  },
  "message": "Monitoreo IIoT consultado"
}
```

`latestByMetric` contiene como máximo una lectura por `TEMPERATURE`, `HUMIDITY`,
`PH`, `TANK_LEVEL`, `MIXER_RPM`, en ese orden. Omite métricas nunca registradas.
Cinco `findFirst` con filtro OP/métrica, orden `recordedAt DESC, id DESC` y selección
acotada aprovechan los índices existentes sin cargar el historial a memoria.
La última medición se determina por `recordedAt`, no por `receivedAt`.
Los totales y fechas máximas usan agregados; severidades usan `groupBy`;
`unacknowledged` cuenta `acknowledgedAt IS NULL`.

Sin telemetría: `totalReadings = 0`, `latestByMetric = []`, `lastReadingAt = null`.
Sin alertas: todos los conteos son cero y `lastAlertAt = null`.
Las consultas no constituyen un snapshot transaccional: durante ingesta concurrente,
los agregados y los listados pueden reflejar instantes ligeramente distintos.

## Histórico de readings

| Parámetro    | Validación / comportamiento                                                               |
| ------------ | ----------------------------------------------------------------------------------------- |
| `metric`     | Valor exacto de `IiotMetric`                                                              |
| `deviceId`   | UUID del dispositivo                                                                      |
| `from`, `to` | Timestamp ISO-8601 válido con timezone obligatorio; límites inclusivos sobre `recordedAt` |
| `page`       | Entero >= 1, default 1                                                                    |
| `limit`      | Entero entre 1 y 100, default 20                                                          |

Los filtros se combinan con AND. Se reutiliza `PaginationQueryDto`.
Orden estable: `recordedAt DESC, id DESC`. `meta.total` cuenta todas las filas filtradas
antes de paginar; una página fuera del conjunto devuelve `data: []`.

```http
GET /api/iiot/production-orders/{id}/readings?metric=TEMPERATURE&page=1&limit=20
GET /api/iiot/production-orders/{id}/readings?from=2026-10-30T10:00:00Z&to=2026-10-30T11:00:00Z
GET /api/iiot/production-orders/{id}/readings?deviceId=019a3210-0000-7000-8000-000000000004
```

Cada elemento contiene exactamente los campos de lectura mostrados en `latestByMetric`:
`id`, `productionOrderId`, `metric`, `value`, `unit`, `recordedAt`, `receivedAt`,
`device: { id, code, name }`. No expone payload MQTT ni metadatos internos del dispositivo.

## Histórico de alertas

| Parámetro       | Validación / comportamiento                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| `severity`      | `WARNING` o `CRITICAL`                                                          |
| `type`          | String exacto, sensible a mayúsculas; trim en extremos; entre 1 y 80 caracteres |
| `from`, `to`    | Timestamp ISO-8601 con timezone; límites inclusivos sobre `IiotAlert.createdAt` |
| `page`, `limit` | Misma paginación de readings                                                    |

Orden estable: `createdAt DESC, id DESC`. Los filtros se combinan con AND.

```http
GET /api/iiot/production-orders/{id}/alerts?severity=CRITICAL
GET /api/iiot/production-orders/{id}/alerts?type=HIGH_TEMPERATURE&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "019a3210-0000-7000-8000-000000000005",
      "productionOrderId": "019a3210-0000-7000-8000-000000000001",
      "type": "HIGH_HUMIDITY",
      "severity": "CRITICAL",
      "message": "Humedad fuera del umbral de demostración",
      "createdAt": "2026-10-30T11:58:01.000Z",
      "acknowledgedAt": null,
      "reading": {
        "id": "019a3210-0000-7000-8000-000000000006",
        "metric": "HUMIDITY",
        "value": "79.0000",
        "unit": "%",
        "recordedAt": "2026-10-30T11:58:00.000Z",
        "device": {
          "id": "019a3210-0000-7000-8000-000000000004",
          "code": "CURING-01",
          "name": "Curado"
        }
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1 }
}
```

Si `readingId` es nullable, la API devuelve `reading: null`. `acknowledgedAt` se
expone como timestamp o null; no hay endpoint de acknowledgement.

## Fechas y Decimal

Se reutiliza el decorador `IsTimestamp` del backend para ambos límites:
`2026-10-30T10:00:00Z` y `2026-10-30T10:00:00-06:00` son válidos.
Fechas sin hora o sin timezone son inválidas. Un offset positivo en query debe
codificar `+` como `%2B`. `from > to` devuelve `400`; ambos límites pueden coincidir.

`value` siempre es string con cuatro decimales (`NUMERIC(18,4)`), mediante
`Decimal.toFixed(4)`, sin conversión intermedia a number y sin pérdida de precisión.
Las respuestas JSON serializan fechas como timestamps UTC.

## Alcance y verificación

No hay frontend, gráficas, buckets, downsampling, SSE, WebSocket, MQTT desde navegador,
acknowledgement ni integración con calidad. Fase 7 podrá usar TanStack Query con polling
HTTP, invertir puntos para gráficas y mostrar métricas actuales y conteos de alertas.

`backend/test/iiot-monitoring.e2e-spec.ts` usa AppModule, guards, validación y PostgreSQL
real. Cubre overview vacío/multimétrica, empates, conteos, filtros, paginación, fechas,
Decimal, proyección, reading nullable, autenticación con rol VENTAS, errores 400/401/404,
OP completada y consultas sin cambios en conteos de ProductionOrder, IiotReading,
IiotAlert, Lot, QualityInspection e InventoryMovement.
Incluye ingesta normal/desviada con parser y motor reales y comparación DB → HTTP.

`docker/verify-monitoring.mjs`, llamado desde la aceptación Docker existente, reconcilia
overview, últimos valores, páginas y conteos con SQL tras simulator normal/deviation →
MQTT → NestJS → PostgreSQL. Repite la consulta tras completar la OP, verifica 401 sin
sesión y compara los seis conteos antes/después. Ejecutar exclusivamente en base `_test`,
según la [guía Docker](docker.md). Las pruebas e2e usan la base aislada del
[setup](setup.md#8-pruebas) y se ejecutan con `pnpm --filter backend test:e2e`.
