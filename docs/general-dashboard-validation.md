# D6 — Evidencias de cierre D1–D6

Fecha: 2026-11-01, America/Managua. Base `develop`:
`4fe72b6f686e9006a8c02afdd550b4649cc38741`, merge de
[PR #42 / D5](https://github.com/Luigui789/Manufactura/pull/42), confirmado antes
de crear `feature/general-dashboard`. D1–D5 y C1–C7 estaban integrados.

## Gates oficiales

| Gate                       | Resultado local                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frozen install             | PASS, pnpm 10.30.3; lockfile sin cambios                                                                     |
| Prisma generate / validate | PASS                                                                                                         |
| Schema drift               | PASS, no difference detected                                                                                 |
| Lint / formato / build     | PASS                                                                                                         |
| Backend unit               | 395/395 PASS, 25 archivos                                                                                    |
| Frontend completo          | 695/695 PASS, 40 archivos                                                                                    |
| Home D6                    | 29/29 PASS, incluido período común, carga/error/retry independientes y gráficos                              |
| Rutas / auth               | 58/58 PASS en repetición focalizada, sin modificar assertions originales                                     |
| Simulator                  | 51/51 PASS                                                                                                   |
| Backend PostgreSQL E2E     | 718/718 PASS, 46 archivos                                                                                    |
| Migration proofs           | PASS: compras, producción, ventas, IIoT, rutas, disposition y sostenibilidad                                 |
| Docker development         | PASS, cuatro servicios saludables en stack D6 aislado                                                        |
| Demo seed / verify         | Dos ejecuciones PASS; segunda sin cambios                                                                    |
| Docker smoke               | PASS, incluida compatibilidad de las cinco fuentes con el mismo período                                      |
| Integrated defense E2E     | 1/1 PASS en base limpia separada; las cinco fuentes compatibles después del flujo real                       |
| Revisión responsive        | Preview temporal con fixtures en móvil/tablet/escritorio; tarjetas y gráficos sin overflow horizontal global |

Los fallos iniciales del fixture de rutas se corrigieron para interceptar solo
las cinco lecturas Home con fechas explícitas, conservando las assertions del
cliente API de Producción y de autenticación. Durante builds concurrentes hubo
esperas agotadas en tests existentes; no se aumentaron timeouts, no se eliminaron
tests ni se relajaron reglas. Se retiró el stack temporal D5 para liberar memoria,
conservando sus volúmenes y el entorno original. La comprobación final frontend
se ejecutó sin builds concurrentes.

El preview visual utiliza el Home y AppLayout reales con datos de test en caché;
verifica layout, no sustituye los flujos API reales. Sus dos archivos temporales
fueron retirados y no están en Git. Las pruebas de integración sí usan PostgreSQL,
writers, auditoría, triggers, inventario y el dataset oficial sin cambios.

Los checks del PR deben completar los dos jobs oficiales sobre el SHA final:
Quality and tests y Docker development. Consultar el PR vinculado a la entrega
para el resultado de CI; no se habilita auto-merge ni squash.

Logs locales ignorados: `build/d6-install.log`, `build/d6-prisma.log`,
`build/d6-lint.log`, `build/d6-build.log`, `build/d6-format-check.log`,
`build/d6-backend-gates.log`, `build/d6-frontend-serial.log`,
`build/d6-routes-final.log`, `build/d6-simulator.log`, `build/d6-docker.log`,
`build/d6-demo-smoke.log` y `build/d6-defense.log`.
Credenciales temporales solo en archivos ignorados; no se incluyen en evidencias.

Warnings existentes del driver pg y de chunks frontend mayores de 500 kB no se
ocultan. Los gráficos D6 tienen carga de código separada; no se añade librería.

## Archivos modificados

| Capa             | Archivos                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Home             | `frontend/src/routes/HomePage.tsx`, `frontend/src/features/home/HomeDashboard.tsx`                                             |
| Composición      | `frontend/src/features/home/period.ts`, `commercial-activity.ts`                                                               |
| Componentes      | `frontend/src/features/home/components/OverviewCard.tsx`, `ActivityChart.tsx`                                                  |
| Frontend tests   | `frontend/src/features/home/HomeDashboard.test.tsx`, `test/fixtures.ts`, `frontend/src/routes/AppRoutes.test.tsx`              |
| Integración real | `docker/verify.mjs`, `backend/test/integrated-defense.e2e-spec.ts`                                                             |
| Documentación    | `README.md`, `docs/progress.md`, `docs/feature-freeze.md`, `docs/general-dashboard.md`, `docs/general-dashboard-validation.md` |

No cambian endpoints, hooks o contratos fuente D1–D5, código productivo backend,
schema, migraciones, writers, seed, simulador ni reportes históricos C7.
Home continúa en `/` y no existe D7. Semántica y límites:
[Dashboard General](general-dashboard.md). Decisión final:
[Feature freeze](feature-freeze.md).
