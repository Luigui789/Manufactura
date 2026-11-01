# D5 — Evidencia de validación

Fecha: 2026-11-01, America/Managua. Base `develop`:
`82dfb1f1757441814fe83ffac71f063ae38e83c9`, merge de
[PR #41](https://github.com/Luigui789/Manufactura/pull/41), confirmado antes de
crear `feature/quality-dashboard`. Se conservan reportes C7 y D6 continúa excluido.

## Gates locales

| Gate                                                  | Resultado                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | PASS; lockfile sin cambios                                                   |
| Prisma generate y validate                            | PASS                                                                         |
| Prisma migrate diff (datasource vs schema, exit-code) | PASS, sin drift                                                              |
| Lint                                                  | PASS; se corrigieron tipos de fixture y aserciones innecesarias              |
| Build backend/frontend/simulator                      | PASS; también imágenes Docker finales                                        |
| Prettier                                              | PASS                                                                         |
| Backend unit                                          | 395/395 PASS, 25 archivos                                                    |
| Simulator                                             | 51/51 PASS, 3 archivos                                                       |
| Backend E2E D5 final                                  | 31/31 PASS                                                                   |
| Frontend D5 final                                     | 10/10 PASS                                                                   |
| Migration proofs                                      | PASS: compras, producción, ventas, IIoT, rutas, disposition y sostenibilidad |
| Docker development final                              | Stack aislado saludable (backend, frontend, PostgreSQL, Mosquitto)           |
| Demo seed / verify                                    | Dos ejecuciones PASS; segunda sin cambios                                    |
| Docker smoke final con D5                             | PASS: auth, contrato y conciliación APPROVED/REJECTED + SCRAP                |
| Integrated defense E2E                                | 1/1 PASS; base nueva `_test` separada                                        |

La ejecución general PostgreSQL produjo 712/713 PASS; una prueba existente de
ciclos de BOM agotó 5 segundos durante concurrencia de gates. La repetición
focalizada de ciclos y D5 produjo 39/39 PASS. Tras añadir la prueba de offsets
históricos, D5 final produjo 31/31 PASS. No se modificaron timeouts ni tests previos.
La ejecución general frontend produjo 665/666 PASS; falló una aserción nueva de D5
porque «Reproceso» aparecía como estado y disposición. Se precisó esa aserción y
D5 final produjo 10/10 PASS. La ejecución Windows frontend duplicada se detuvo al
no avanzar; el resultado general anterior corresponde a Linux/Docker.

La CI del PR ejecuta nuevamente todas las suites completas y Docker sobre su SHA
final; los checks del PR son la evidencia definitiva del conjunto, sin combinar
resultados de revisiones distintas. Consultar el PR vinculado a esta entrega.

Logs locales ignorados por Git: `build/d5-quality-final.log`,
`build/d5-ui-final.log`, `build/d5-backend-focused.log`,
`build/d5-e2e-recheck.log`, `build/d5-backend-gates.log`,
`build/d5-frontend-docker.log`, `build/d5-simulator-final.log`,
`build/d5-defense.log`, `build/d5-demo.log`, `build/d5-smoke-final.log`,
`build/d5-docker-final.log`, `build/d5-build-final.log` y `build/d5-format-check.log`.
Credenciales temporales solo en archivos ignorados, no en evidencias ni commits.

Warnings existentes: deprecación de consultas concurrentes del driver pg y
chunks frontend mayores de 500 kB. No se ampliaron timeouts ni se relajaron gates.

## Cobertura de aceptación

- Sesión requerida, lectura COMPRAS y mutaciones de Calidad conservadas como ADMIN/PRODUCCION.
- Fechas/rango/UUID inválidos, producto ausente, producto inactivo sin actividad, defaults Managua.
- Producción real sin calidad → RELEASED; con calidad → QUARANTINED, incluido INTERMEDIATE.
- Cuarentena comprada excluida; pendiente actual independiente de fechas.
- APPROVED → RELEASED; REJECTED pendiente de disposición; no reinspección.
- REJECTED + RELEASE conserva rejected y cuenta release; nunca approved.
- REJECTED + REWORK elimina la cola de decisión y cuenta el lote actualmente marcado.
- REJECTED + SCRAP conserva rejected, cuenta scrap, genera QUALITY_SCRAP negativo y concilia saldo.
- Tasa Decimal `2/3 = 66.67`, cero inspecciones = null; aislamiento por producto.
- inspectedAt y decidedAt independientes, límites exactos Managua, contexto fuera del período.
- day/week/month con actividad real y buckets cero; offsets históricos iguales en conteos y recientes.
- Atención: prioridad de rechazo, antigüedad e id; máximo cinco; recientes con orden determinista,
  inspector, lote y OP. Links de detalle correctos.
- No cantidades físicas globales, no parsing de texto libre, no inferencia causal IIoT.
- UI: loading, error/retry, vacío con cola actual, porcentaje nulo/0%, disposiciones,
  filtro de fecha, selección histórica de todos los tipos, regresión del picker,
  tablas accesibles para gráficos, ruta y navegación.

## Archivos de la entrega

| Capa           | Archivos                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API            | `backend/src/production/quality/dashboard/dashboard-query.dto.ts`, `dashboard.controller.ts`, `dashboard.service.ts`, `dashboard.module.ts`; `backend/src/production/quality/quality.module.ts` |
| Backend E2E    | `backend/test/quality-dashboard.e2e-spec.ts`                                                                                                                                                    |
| Frontend       | `frontend/src/features/production/api/quality-dashboard.ts`, `frontend/src/features/production/pages/QualityDashboardPage.tsx`, `QualityDashboardPage.test.tsx`                                 |
| Integración UI | `frontend/src/components/CatalogPicker.tsx`, `frontend/src/routes/AppRoutes.tsx`, `frontend/src/layouts/navigation.ts`                                                                          |
| Smoke          | `docker/verify.mjs`                                                                                                                                                                             |
| Documentación  | `README.md`, `docs/feature-freeze.md`, `docs/progress.md`, `docs/quality-dashboard.md`, `docs/quality-dashboard-validation.md`                                                                  |

No cambian `schema.prisma`, migraciones, writers, seed, simulador, IIoT,
sostenibilidad, compras ni ventas. Contrato y decisiones: [D5](quality-dashboard.md).
