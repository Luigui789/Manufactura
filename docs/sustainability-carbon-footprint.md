# C3 — Sostenibilidad: huella parcial de carbono y circularidad

> **Estimación académica de huella parcial de carbono basada en factores documentados. No
> constituye certificación, verificación independiente ni ACV completo.**
>
> Este aviso aparece en la API (`disclaimer`) y en todas las pantallas de huella, tanto en
> borrador como finalizada.

## 1. Objetivo

Estimar, de forma trazable y defendible en el contexto académico de la asignatura, la huella
parcial de carbono de una Orden de Producción (OP) completada de EcoSoap, expresada como:

- **kg CO₂e totales** de la OP/lote;
- **kg CO₂e por unidad producida** (intensidad).

Por separado, informar el **material circular valorizado**; para EcoSoap, el indicador principal
es el _aceite de cocina usado recuperado/valorizado_.

## 2. Alcance: `PARTIAL_CRADLE_TO_GATE`

La huella cubre una parte de la etapa «de la cuna a la puerta» de la fábrica. Cada huella persiste
su alcance (`CarbonFootprintScope.PARTIAL_CRADLE_TO_GATE`) para que el registro histórico diga
exactamente qué se calculó, aunque en C3 exista un solo alcance.

### Límites del sistema

| Incluido (categorías)                            | Excluido en C3                          |
| ------------------------------------------------ | --------------------------------------- |
| `RAW_MATERIAL` — materias primas consumidas      | Distribución al cliente                 |
| `ENERGY` — energía del proceso (registro manual) | Uso del jabón por el consumidor         |
| `INBOUND_TRANSPORT` — transporte de entrada      | Fin de vida                             |
| `PACKAGING` — empaque                            | Offsets, compensaciones, carbon credits |
| `WASTE` — residuos del proceso                   | Emisiones evitadas                      |

No existen categorías vagas (`OTHER`, `MISC`, `UNKNOWN`). Al finalizar, el usuario debe describir
los límites concretos en `boundaryNotes` (10–2000 caracteres útiles), que quedan congelados.

## 3. Fórmula

```text
emissionsKgCo2e      = activityQuantity × kgCo2ePerUnit
totalKgCo2e          = Σ emissionsKgCo2e
kgCo2ePerOutputUnit  = totalKgCo2e / quantityProduced
```

- Todo valor persistente usa `Prisma.Decimal` (`Decimal(20, 8)` para kg CO₂e, coeficientes y
  cantidades de actividad); nunca `number`. La API intercambia decimales como texto.
- El cálculo usa precisión interna de 80 dígitos y **un solo redondeo ROUND_HALF_UP a 8
  decimales** al persistir cada emisión y la intensidad. El total es la suma exacta de las
  emisiones ya persistidas.
- Un valor que no cabe en `Decimal(20, 8)` (más de 12 enteros) se rechaza con 422.

Ejemplo verificado en E2E y Docker: materia prima 10 kg × 2.00000000 = 20.00000000; electricidad
5 kWh × 0.50000000 = 2.50000000; total **22.50000000 kg CO₂e**. Con 200 unidades, intensidad
**0.11250000 kg CO₂e/unidad**; con 100 unidades, **0.22500000**.

## 4. Unidades y conversiones

`CarbonActivityUnit`: `UNIT`, `GRAM`, `KILOGRAM`, `MILLILITER`, `LITER`, `KWH`, `KILOMETER`,
`TON_KILOMETER`. Las cinco primeras coinciden con `UnitOfMeasure` de inventario.

| Dimensión | Unidades              | Conversión permitida            |
| --------- | --------------------- | ------------------------------- |
| Conteo    | `UNIT`                | —                               |
| Masa      | `GRAM`, `KILOGRAM`    | 1000 GRAM = 1 KILOGRAM (exacta) |
| Volumen   | `MILLILITER`, `LITER` | 1000 MILLILITER = 1 LITER       |
| Energía   | `KWH`                 | —                               |
| Distancia | `KILOMETER`           | —                               |
| Carga     | `TON_KILOMETER`       | —                               |

Las conversiones entre dimensiones (`LITER → KILOGRAM`, `UNIT → KILOGRAM`, etc.) **se rechazan**:
C3 no aplica densidades ni masas unitarias. El helper puro está en
`backend/src/sustainability/carbon-units.ts` y sus pruebas en `carbon.spec.ts`.

## 5. Factores de emisión

`EmissionFactor` es configuración gobernada: solo `ADMIN` crea, edita o activa/desactiva; cualquier
usuario autenticado puede consultarlos.

- **Fuente obligatoria**: `sourceName` y `sourceReference` (documento, edición, tabla, URL o
  referencia reproducible); `sourceYear` opcional. No hay factores anónimos: lo exige el DTO y un
  `CHECK` de PostgreSQL que rechaza texto vacío o solo espacios.
- **Sin negativos**: `kg_co2e_per_unit >= 0` (DTO y `CHECK`). Un factor cero es válido si su fuente
  lo justifica. Las «emisiones evitadas» no se modelan como factores negativos.
- **Identidad inmutable**: `code`, `productId`, `category` y `activityUnit` no se editan; para otro
  concepto se crea otro factor. Editable: `name`, `kgCo2ePerUnit`, `sourceName`,
  `sourceReference`, `sourceYear`, `notes`.
- **Asociado a producto** (opcional): se aplica automáticamente a los consumos reales del producto.
  Su unidad debe tener la misma dimensión que `Product.unit` (por ejemplo, producto en `GRAM` con
  factor por `KILOGRAM`); si no, 422. Solo categorías `RAW_MATERIAL` o `PACKAGING`.
- **Un factor activo por producto**: índice único parcial
  `UNIQUE(product_id) WHERE is_active AND product_id IS NOT NULL`. Los históricos inactivos se
  conservan.

### No se inventan factores

El seed normal **no contiene ningún factor real** (electricidad de Nicaragua, soda cáustica,
aceites, transporte, plástico, agua). Las pruebas usan factores `TEST-*`/`TEST_*` con fuente
`TEST_FIXTURE`, que nunca deben presentarse como datos ambientales. Los factores reales de la demo
se cargarán en C5 después de documentar sus fuentes.

La metodología ISO/GHG orienta _cómo_ calcular, pero **no sustituye la fuente del valor numérico**
de cada factor.

## 6. Integración con el ledger de inventario

Las actividades automáticas (`source = PRODUCTION_CONSUMPTION`) se derivan **exclusivamente** de los
`InventoryMovement` de tipo `PRODUCTION_CONSUMPTION` de la OP. Nunca de `BomItem.quantity` ni de
`quantityPlanned`: el ledger es la fuente de verdad de lo realmente registrado por Producción.

- **Una actividad por movimiento** (`inventoryMovementId UNIQUE`). Si un componente trazable se
  consumió desde dos lotes, hay dos actividades.
- `activityQuantity = ABS(movement.quantity)`, normalizada a la unidad del factor; se conservan
  `originalQuantity`/`originalUnit`. Un movimiento de salida nunca produce emisiones negativas.
- Un trigger de PostgreSQL exige que el movimiento sea `PRODUCTION_CONSUMPTION` de la misma OP.

Ejemplo: 700 GRAM de soda cáustica → 0.700 KILOGRAM × 2.1 kg CO₂e/kg = 1.47 kg CO₂e.

### Factores faltantes

Si un producto consumido no tiene factor activo asociado, **no se inventa** un valor: la respuesta
incluye `missingFactors` (`productId`, `code`, `name`, `unit`, `consumedQuantity`). Mientras existan,
la huella permanece `DRAFT` y finalizar responde **422** (`MISSING_EMISSION_FACTORS`). La UI muestra
«Faltan factores para calcular la huella completa del alcance seleccionado»; ADMIN ve el botón
«Configurar factor» y PRODUCCION solo el aviso.

## 7. Snapshots

Cada `CarbonActivity` copia el factor usado: código, nombre, valor, fuente, referencia y año. Editar
un factor después **no cambia** actividades existentes. Una sincronización de un `DRAFT` puede
tomar el snapshot actualizado de las actividades automáticas; las manuales lo conservan salvo que
el usuario vuelva a elegir el factor. Una huella `FINALIZED` nunca cambia.

## 8. Actividades manuales

Para `ENERGY`, `INBOUND_TRANSPORT`, `PACKAGING` y `WASTE` (y `RAW_MATERIAL` marcado `MANUAL` si fuera
necesario). Cuerpo: `emissionFactorId`, `description`, `quantity`. **La unidad no viene del cliente**:
se toma de `EmissionFactor.activityUnit`, para impedir combinaciones como factor kg CO₂e/kWh con
cantidad en litros. Los factores asociados a producto no se aceptan manualmente (se aplican desde
el ledger) y un factor inactivo responde 422. Solo se editan o eliminan actividades `MANUAL` de un
`DRAFT`; las automáticas responden 422.

## 9. Finalización

`POST /sustainability/production-orders/:id/footprint/finalize` (ADMIN, PRODUCCION):

1. Bloquea `production_orders` y luego `production_footprints` (orden determinista).
2. Exige `DRAFT` (si no, 409).
3. **Resincroniza** las actividades automáticas con el ledger actual (no confía en un preview viejo).
4. Si `missingFactors.length > 0` → 422; sin actividades → 422.
5. Persiste `totalKgCo2e`, `kgCo2ePerOutputUnit`, `boundaryNotes`, `calculatedAt`, `finalizedAt`,
   `finalizedByUserId` y `status = FINALIZED`, con auditoría `FINALIZE_CARBON_FOOTPRINT`.

Una huella finalizada no admite sync, edición, recálculo ni actividades nuevas, editadas o
eliminadas (409). No existen `unfinalize`, `reopen` ni recálculo: una corrección histórica futura
requerirá otra fase con reglas explícitas. Triggers de PostgreSQL refuerzan la inmutabilidad y
prohíben borrar huellas.

### Concurrencia

Todas las mutaciones toman `FOR NO KEY UPDATE` sobre la OP y luego sobre la huella. Así se
serializan con Producción (que usa `FOR UPDATE`) sin bloquear las FK de otros módulos. Dos
finalizaciones concurrentes: una 200 y otra 409, con una sola auditoría. Una edición manual
concurrente con la finalización entra antes (y queda incluida en el total) o recibe 409.

## 10. Circularidad (separada del carbono)

`CircularMaterialProfile` asocia un producto a una métrica (`metricCode`, `displayName`,
`reportingUnit` compatible con la unidad del producto). La cantidad recuperada se calcula desde el
ledger `PRODUCTION_CONSUMPTION` de la OP y se convierte a la unidad de reporte (100000 MILLILITER →
100 L).

Configuración prevista para EcoSoap (sin IDs en el código; se hará en C4/C5 sobre el producto
definitivo, «Aceite usado recibido» o «Aceite usado filtrado»):

```text
metricCode:  USED_COOKING_OIL_RECOVERED
displayName: Aceite de cocina usado valorizado
reportingUnit: LITER
```

### Qué NO se descuenta

**Huella de carbono ≠ circularidad.** El aceite valorizado **no** reduce `totalKgCo2e`; nunca se
ejecuta `totalKgCo2e -= recoveredOilCredit`. La UI lo indica: «Este indicador se presenta por
separado y no se descuenta automáticamente de la huella de carbono». Las pruebas verifican que
crear o desactivar el perfil no cambia los totales.

## 11. Relación con otros módulos

- **Producción**: `POST /production/orders/:id/complete` no cambió; no exige factores ni crea la
  huella. Una OP se completa aunque Sostenibilidad no tenga ningún factor.
- **Calidad (C2)**: `RELEASE`, `REWORK` o `SCRAP` posteriores no recalculan ni reducen la huella. La
  fabricación ocurrió y generó impacto; `SCRAP` no la convierte en 0 kg CO₂e.
- **IIoT**: no se modifica; temperatura o pH no se convierten en CO₂e y no hay sensor eléctrico.
- **Rutas (C1)**: no se calculan emisiones por tiempo estándar.
- **Dashboards D1–D6**: no se modifican; las APIs quedan listas para una integración posterior.

## 12. API

| Método y ruta                                                                                               | Política          |
| ----------------------------------------------------------------------------------------------------------- | ----------------- |
| `GET /sustainability/emission-factors` (`search`, `category`, `isActive`, `productId`, paginación)          | Authenticated     |
| `GET /sustainability/emission-factors/:id`                                                                  | Authenticated     |
| `POST /sustainability/emission-factors`                                                                     | ADMIN             |
| `PATCH /sustainability/emission-factors/:id`                                                                | ADMIN             |
| `PATCH /sustainability/emission-factors/:id/status`                                                         | ADMIN             |
| `GET /sustainability/circular-materials`                                                                    | Authenticated     |
| `POST /sustainability/circular-materials`                                                                   | ADMIN             |
| `PATCH /sustainability/circular-materials/:id`                                                              | ADMIN             |
| `PATCH /sustainability/circular-materials/:id/status`                                                       | ADMIN             |
| `GET /sustainability/production-orders` (OP completadas, `footprintStatus=NONE\|DRAFT\|FINALIZED`)          | Authenticated     |
| `GET /sustainability/production-orders/:id` (resumen y circularidad)                                        | Authenticated     |
| `GET /sustainability/production-orders/:id/footprint` (`data: null` si no existe; 404 si no hay OP)         | Authenticated     |
| `POST /sustainability/production-orders/:id/footprint` (201; 409 si existe; 422 si la OP no está COMPLETED) | ADMIN, PRODUCCION |
| `POST /sustainability/production-orders/:id/footprint/sync` (200)                                           | ADMIN, PRODUCCION |
| `POST /sustainability/production-orders/:id/footprint/activities` (201)                                     | ADMIN, PRODUCCION |
| `PATCH /sustainability/production-orders/:id/footprint/activities/:activityId`                              | ADMIN, PRODUCCION |
| `DELETE /sustainability/production-orders/:id/footprint/activities/:activityId`                             | ADMIN, PRODUCCION |
| `POST /sustainability/production-orders/:id/footprint/finalize` (200)                                       | ADMIN, PRODUCCION |

Las respuestas de huella incluyen `totalsByCategory`, `totalKgCo2ePreview`,
`kgCo2ePerOutputUnitPreview`, `missingFactors`, actividades con snapshot, `circularity` y
`disclaimer`. Ningún GET crea datos. No se crearon roles nuevos.

## 13. Auditoría

Entidades: `EMISSION_FACTOR`, `CARBON_ACTIVITY`, `PRODUCTION_FOOTPRINT`,
`CIRCULAR_MATERIAL_PROFILE`. Acciones: `CREATE`, `UPDATE`, `DELETE`, `ENABLE`, `DISABLE` y la
específica `FINALIZE_CARBON_FOOTPRINT`, cuyo snapshot contiene `productionOrderId`, `lotId`,
`scope`, `totalKgCo2e`, `quantityProduced`, `outputUnit`, `kgCo2ePerOutputUnit`, `boundaryNotes`,
`activityCount`, `totalsByCategory`, `missingFactors = []`, `finalizedAt` y `finalizedByUserId`
(decimales como texto). Cada sync audita `UPDATE` con el resumen de la reconciliación. La auditoría
sigue siendo append-only y comparte la transacción del caso de uso.

## 14. Referencias metodológicas

Marcos conceptuales consultados para estructurar la estimación:

- ISO 14067:2018 — _Greenhouse gases — Carbon footprint of products — Requirements and
  guidelines for quantification_.
- GHG Protocol — _Product Life Cycle Accounting and Reporting Standard_ (WRI/WBCSD, 2011).

La implementación se inspira en estos marcos para estructurar una estimación académica parcial
(alcance declarado, datos de actividad × factor, trazabilidad de fuentes, límites explícitos). **No
se afirma conformidad, certificación ni verificación bajo dichas normas.**

## 15. Limitaciones

- No es un ACV completo.
- No es un inventario corporativo Scope 1/2/3.
- No incluye offsets ni compensaciones.
- No calcula emisiones evitadas.
- No incluye etapas downstream (distribución, uso, fin de vida).
- No aplica densidades ni masas unitarias automáticas.
- No hay sensor eléctrico IIoT: la energía se registra manualmente.
- La calidad del resultado depende de la calidad de los factores y sus fuentes.
- No sirve para comparaciones ambientales certificadas entre productos.

## 16. Ejemplo EcoSoap (ilustrativo, valores TEST)

| Actividad                   | Cantidad          | Factor (TEST_FIXTURE)  | kg CO₂e                |
| --------------------------- | ----------------- | ---------------------- | ---------------------- |
| Materia prima (ledger)      | 10 kg             | 2.00000000 kg CO₂e/kg  | 20.00000000            |
| Electricidad (manual)       | 5 kWh             | 0.50000000 kg CO₂e/kWh | 2.50000000             |
| **Huella parcial total**    |                   |                        | **22.50000000**        |
| **Intensidad** (200 barras) |                   |                        | **0.11250000 / barra** |
| Aceite usado valorizado     | 100000 mL → 100 L | — (no se descuenta)    | —                      |

Los 100 L de aceite valorizado se informan aparte y **no** reducen los 22.5 kg CO₂e.

## 17. Verificación

- Unitarias: `backend/src/sustainability/carbon.spec.ts`.
- PostgreSQL E2E: `backend/test/sustainability.e2e-spec.ts`.
- Migraciones: `backend/test/sustainability-migrations.mjs` (desde cero, upgrade desde C2,
  restricciones).
- Frontend: `frontend/src/features/sustainability/Sustainability.test.tsx`.
- Docker: `docker/verify-sustainability.mjs`, invocado por `docker/verify.mjs`.
