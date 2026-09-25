# ADR 002 — Monolito modular en lugar de microservicios

- **Estado:** Aceptado
- **Fecha:** 2026-09-22
- **Etapa:** 1 — Configuración inicial

## Contexto

El ERP integra cuatro dominios —Compras, Inventario, Producción y Ventas— que comparten el mismo
inventario y deben coordinarse de forma transaccional. Lo desarrollan tres estudiantes en un
semestre y debe poder defenderse ante un tribunal.

Las operaciones centrales del sistema (recibir una compra, completar una producción, despachar una
venta) tocan varias entidades a la vez y deben ser atómicas.

## Decisión

Un único backend desplegable con separación interna por dominio: **monolito modular**. Frontend y
backend son aplicaciones separadas que se comunican por REST/JSON.

Quedan descartados sin justificación explícita: microservicios, Kubernetes, Kafka, RabbitMQ,
GraphQL, MongoDB, Next.js, Redis, event sourcing y CQRS complejo.

## Consecuencias

- Las operaciones multi-entidad se resuelven con una transacción de base de datos, no con
  coordinación distribuida ni compensaciones. Esto es decisivo: la regla «si algo falla, rollback
  completo» sería considerablemente más difícil de garantizar entre servicios.
- Un solo despliegue, un solo esquema, una sola fuente de verdad del inventario.
- El límite entre dominios lo sostiene la disciplina del equipo, no la red. Si un módulo empieza a
  manipular directamente las tablas de otro, el modelo se degrada sin que nada lo impida
  técnicamente.
- Escalar horizontalmente por dominio no es posible. Para el alcance académico del proyecto esto
  no representa una limitación real.
