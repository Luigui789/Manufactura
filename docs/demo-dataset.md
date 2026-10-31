# C5 — Dataset oficial de demostración EcoSoap

Base reproducible para la demostración integral de EcoSoap Nicaragua S.A. con dos productos
terminados:

- **Producto piloto principal:** Jabón ecológico EcoSoap 500 g (barra).
- **Producto manufacturado adicional:** Jabón líquido EcoSoap embotellado.

El dataset no contiene datos aleatorios de prueba ni transacciones simuladas. Todas las
definiciones viven en un solo archivo: `backend/src/demo/demo-data.ts`.

## 1. Comandos

```bash
export DEMO_USER_PASSWORD='frase local de al menos quince caracteres'
pnpm demo:seed
pnpm demo:verify
```

| Comando                              | Qué hace                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm demo:seed`                     | Ejecuta el seed Foundation (`db:seed`) y luego el dataset (`db:seed:demo`).   |
| `pnpm demo:verify`                   | Verifica el dataset en una transacción `READ ONLY`. No crea ni modifica nada. |
| `pnpm --filter backend db:seed`      | Solo Foundation: 5 roles y `ALM-PRINCIPAL`. Sigue siendo pequeño.             |
| `pnpm --filter backend db:seed:demo` | Solo el dataset; exige Foundation previo.                                     |

`DEMO_USER_PASSWORD` es obligatoria (15–128 caracteres, misma política que las demás cuentas).
Sin ella, `demo:seed` termina **antes de abrir la conexión** a la base. Nunca se imprimen la
contraseña ni su hash. `.env.example` declara la variable vacía; conviene definirla solo en la
sesión, como `ADMIN_PASSWORD`.

### Garantías

- **Una sola transacción** serializada por el advisory lock `ecosoap:demo-dataset:v1`. Dos seeds
  concurrentes no duplican datos ni dejan una configuración parcial.
- **Idempotencia:** una segunda ejecución no crea nada ("Dataset EcoSoap ya estaba completo").
  No duplica usuarios, productos, proveedores, clientes, fórmulas, versiones, rutas, operaciones,
  factores, perfiles circulares ni movimientos de stock inicial, y no repone stock ya consumido.
- **Drift:** si un código del dataset ya existe con otra semántica (por ejemplo `PT-JABON-LIQ` con
  `type = RAW_MATERIAL`, `ENV-BOTELLA-LIQ` con `unit = LITER`, una fórmula activa distinta, una
  ruta con otras operaciones o una cuenta demo con otro rol o inactiva), el seed falla con
  `DEMO_DATASET_DRIFT` y hace rollback completo. **Nunca corrige en silencio.**
- **Auditoría:** cada alta se audita (`CREATE`, actor `SYSTEM`) y cada carga de stock como
  `ADJUST_STOCK` del administrador demo, en la misma transacción.

### Reconstrucción local (manual)

No existe un comando de reset destructivo: ningún script ejecuta `DROP DATABASE`, `TRUNCATE` ni
`docker compose down -v`. Para empezar desde cero, quien opera lo decide explícitamente:

```bash
docker compose down -v        # borra el volumen de PostgreSQL: pierde TODOS los datos locales
docker compose up -d --wait
pnpm --filter backend exec prisma migrate deploy
pnpm demo:seed
pnpm demo:verify
```

## 2. Usuarios demo

| Correo                         | Rol        | Nombre              |
| ------------------------------ | ---------- | ------------------- |
| `admin.demo@ecosoap.test`      | ADMIN      | Demo Administración |
| `compras.demo@ecosoap.test`    | COMPRAS    | Demo Compras        |
| `inventario.demo@ecosoap.test` | INVENTARIO | Demo Inventario     |
| `produccion.demo@ecosoap.test` | PRODUCCION | Demo Producción     |
| `ventas.demo@ecosoap.test`     | VENTAS     | Demo Ventas         |

El hash se calcula con `PasswordHasherService` (Argon2id, ADR 009), el mismo mecanismo que el
resto de usuarios. Las cuentas quedan con `mustChangePassword = false` porque son
**exclusivamente locales de demostración**; no deben existir en un entorno real. Reejecutar el
seed no cambia la contraseña de una cuenta ya creada.

## 3. Catálogo

Almacén: se reutiliza `ALM-PRINCIPAL` (Foundation); no se crean almacenes artificiales.

| Código            | Nombre                          | Tipo          | Unidad     | Lote | Inspección |
| ----------------- | ------------------------------- | ------------- | ---------- | ---- | ---------- |
| `MP-ACU`          | Aceite de cocina usado recibido | RAW_MATERIAL  | MILLILITER | Sí   | No         |
| `INT-ACU-FIL`     | Aceite de cocina usado filtrado | INTERMEDIATE  | MILLILITER | Sí   | No         |
| `MP-NAOH`         | Soda cáustica                   | RAW_MATERIAL  | GRAM       | No   | No         |
| `MP-AGUA`         | Agua                            | RAW_MATERIAL  | MILLILITER | No   | No         |
| `MP-ESENCIA`      | Esencia aromática               | RAW_MATERIAL  | MILLILITER | No   | No         |
| `PT-JABON-500`    | Jabón ecológico EcoSoap 500 g   | FINISHED_GOOD | UNIT       | Sí   | Sí         |
| `PT-JABON-LIQ`    | Jabón líquido EcoSoap           | FINISHED_GOOD | UNIT       | Sí   | Sí         |
| `ENV-BOTELLA-LIQ` | Botella para jabón líquido      | CONSUMABLE    | UNIT       | No   | No         |
| `ENV-TAPA-LIQ`    | Tapa para jabón líquido         | CONSUMABLE    | UNIT       | No   | No         |
| `ENV-ETIQ-LIQ`    | Etiqueta EcoSoap jabón líquido  | CONSUMABLE    | UNIT       | No   | No         |

Proveedores ficticios: `SUP-ACU-001` Red de Recolección de Aceite EcoSoap, `SUP-INS-001` Proveedor
de Insumos EcoSoap y `SUP-ENV-001` Proveedor de Envases EcoSoap. Clientes ficticios:
`CLI-VERDE-001` Distribuidora Verde Demo y `CLI-ECOVIDA-001` Tienda EcoVida Demo. Ninguno
corresponde a una empresa real.

## 4. Productos terminados EcoSoap

### Jabón en barra (`PT-JABON-500`)

La fórmula y la ruta provienen de la documentación existente del proyecto
(`docs/multilevel-manufacturing.md` §10 y `docs/production-routes.md`).

- **BOM** «BOM Jabón ecológico EcoSoap 500 g», v1 activa, salida 1 UNIT: 500 mL `INT-ACU-FIL`,
  70 g `MP-NAOH`, 180 mL `MP-AGUA` y 5 mL `MP-ESENCIA`.
- **Empaque:** el caso documenta la operación «Empaque» pero no un material físico de empaque de
  la barra. Por eso no se creó `ENV-JABON-BARRA` ni se inventó un consumible.
- **Ruta** `RT-JABON-500` «Ruta Jabón EcoSoap 500 g», tiempos documentados: 10 Mezclado (15 min),
  20 Moldeado (10), 30 Curado / secado (21600), 40 Inspección final (5), 50 Empaque (5).

### Jabón líquido (`PT-JABON-LIQ`)

> La formulación del jabón líquido fue incorporada como configuración adicional para ampliar el
> caso EcoSoap. Cuando no existe una cantidad documentada en la Entrega 1, el dataset la
> identifica como supuesto académico de demostración.

- **Presentación:** el proyecto no documenta un volumen de presentación, así que el código es
  `PT-JABON-LIQ`, sin volumen. El producto se vende embotellado (botella + tapa + etiqueta).
  Cuando el equipo defina la presentación (por ejemplo 500 mL), se ajustarán el código
  (`PT-JABON-LIQ-500`) y la fórmula en `demo-data.ts`.
- **BOM** «BOM Jabón líquido EcoSoap», v1 activa, salida 1 UNIT. Es un **SUPUESTO ACADÉMICO DEL
  CASO ECOSOAP**:

  | Componente        | Cantidad por unidad | Origen                            |
  | ----------------- | ------------------- | --------------------------------- |
  | `INT-ACU-FIL`     | 150 mL              | Supuesto académico                |
  | `MP-NAOH`         | 20 g                | Supuesto académico                |
  | `MP-AGUA`         | 300 mL              | Supuesto académico                |
  | `MP-ESENCIA`      | 3 mL                | Supuesto académico                |
  | `ENV-BOTELLA-LIQ` | 1 UNIT              | Empaque físico de la presentación |
  | `ENV-TAPA-LIQ`    | 1 UNIT              | Empaque físico de la presentación |
  | `ENV-ETIQ-LIQ`    | 1 UNIT              | Empaque físico de la presentación |

  No es una fórmula industrial certificada ni proviene de la Entrega 1. Reutiliza los insumos
  documentados del caso con proporciones propias, sin copiar la fórmula de la barra. En la
  práctica industrial el jabón líquido suele saponificarse con hidróxido de potasio. Como el caso
  no documenta ese insumo, C5 **no** lo agrega por conocimiento externo ni sustituye `MP-NAOH`. Si
  el equipo valida otra formulación, basta cambiar `DEMO_BOMS` en `demo-data.ts` (la detección de
  drift obligará a reconstruir una base que ya tenga la v1 anterior).

- **Ruta** `RT-JABON-LIQ` «Ruta Jabón Líquido EcoSoap». Son **tiempos estándar estimados para
  simulación académica**, no medidos:

  | Secuencia | Operación                        | Minutos |
  | --------- | -------------------------------- | ------- |
  | 10        | Preparación / dosificación       | 15      |
  | 20        | Mezclado                         | 30      |
  | 30        | Homogeneización / reposo         | 120     |
  | 40        | Inspección del producto a granel | 10      |
  | 50        | Llenado / embotellado            | 20      |
  | 60        | Tapado                           | 5       |
  | 70        | Etiquetado                       | 5       |
  | 80        | Inspección final                 | 5       |
  | 90        | Empaque                          | 10      |

### Intermedio compartido

Ambos terminados consumen el mismo intermedio, lo que demuestra la estructura multinivel de C4:

```text
               MP-ACU
                  │  BOM Aceite filtrado: 1000 mL ← 1000 mL (v1)
                  ▼
            INT-ACU-FIL
               /      \
              ▼        ▼
   PT-JABON-500      PT-JABON-LIQ
```

Ruta del intermedio `RT-ACU-FIL` «Ruta de filtración de aceite usado»: 10 Recepción / preparación
(10 min) y 20 Filtración (20 min), también tiempos estimados para simulación académica. En
`GET /api/production/manufacturing-structure/:productId` ambos terminados quedan `READY` con
`maxDepth = 2`; los consumibles de empaque son hojas.

## 5. Por qué el embotellado forma parte de la ruta

| Modelo           | Pregunta que responde | Jabón líquido                             |
| ---------------- | --------------------- | ----------------------------------------- |
| `RouteOperation` | ¿Qué hacemos?         | Llenado / embotellado, Tapado, Etiquetado |
| `BomItem`        | ¿Qué consumimos?      | 1 botella, 1 tapa y 1 etiqueta por unidad |

El embotellado es una operación de transformación y presentación necesaria para obtener el
producto vendible, por eso pertenece a Producción y a la misma OP. El producto se convierte en
`FINISHED_GOOD` al completar esa OP: ingredientes → proceso líquido → embotellado →
`PT-JABON-LIQ`. Para 10 unidades, `BomCalculatorService` exige exactamente 10 botellas, 10 tapas y
10 etiquetas, y completar la OP genera sus `PRODUCTION_CONSUMPTION`.

**Opción futura (no implementada):** un modelo industrial más detallado podría separar
`INT-JABON-LIQ-GRANEL` (OP de fabricación a granel) y una OP posterior de embotellado. C5 no lo
necesita y evita esa sobreingeniería.

## 6. Stock inicial

Toda la carga entra por `InventoryService` como `ADJUSTMENT_IN` con motivo `INITIAL_LOAD` y marca
`requestId = ecosoap-demo-initial-stock-v1`. Nunca se escribe `StockBalance` directamente.

| Producto          | Cantidad inicial | Motivo                                             |
| ----------------- | ---------------- | -------------------------------------------------- |
| `MP-NAOH`         | 20000 g          | Auxiliar para barra y líquido                      |
| `MP-AGUA`         | 50000 mL         | Auxiliar para barra y líquido                      |
| `MP-ESENCIA`      | 2000 mL          | Auxiliar para barra y líquido                      |
| `ENV-BOTELLA-LIQ` | 50 UNIT          | Embotellar sin una segunda compra en la demo       |
| `ENV-TAPA-LIQ`    | 50 UNIT          | Ídem                                               |
| `ENV-ETIQ-LIQ`    | 50 UNIT          | Ídem                                               |
| `MP-ACU`          | **0**            | El flujo de defensa empieza con compra → recepción |
| `INT-ACU-FIL`     | **0**            | Se obtiene con una OP de filtrado                  |
| `PT-JABON-500`    | **0**            | Se obtiene con una OP real                         |
| `PT-JABON-LIQ`    | **0**            | Se obtiene con una OP real                         |

La marca hace idempotente la carga: una segunda ejecución no vuelve a sumar ni repone lo
consumido.

## 7. Sostenibilidad y circularidad

Factores `DEMO-*`, todos con `sourceName = Supuesto académico EcoSoap`. Son **valores ilustrativos
sin fuente externa**: no representan datos ambientales reales, no provienen de ninguna norma,
ministerio ni estudio, y no deben citarse como tales. Su único propósito es que la huella parcial
C3 de ambos productos se pueda finalizar sin factores faltantes durante la demo.

| Código             | Producto          | Categoría    | kg CO₂e por unidad |
| ------------------ | ----------------- | ------------ | ------------------ |
| `DEMO-ACU`         | `MP-ACU`          | RAW_MATERIAL | 0.05 / L           |
| `DEMO-ACU-FIL`     | `INT-ACU-FIL`     | RAW_MATERIAL | 0.02 / L           |
| `DEMO-NAOH`        | `MP-NAOH`         | RAW_MATERIAL | 1.50 / kg          |
| `DEMO-WATER`       | `MP-AGUA`         | RAW_MATERIAL | 0.001 / L          |
| `DEMO-ESSENCE`     | `MP-ESENCIA`      | RAW_MATERIAL | 2.00 / L           |
| `DEMO-BOTTLE`      | `ENV-BOTELLA-LIQ` | PACKAGING    | 0.08 / unidad      |
| `DEMO-CAP`         | `ENV-TAPA-LIQ`    | PACKAGING    | 0.02 / unidad      |
| `DEMO-LABEL`       | `ENV-ETIQ-LIQ`    | PACKAGING    | 0.005 / unidad     |
| `DEMO-ELECTRICITY` | — (manual)        | ENERGY       | 0.50 / kWh         |

Circularidad: perfil `USED_COOKING_OIL_RECOVERED` «Aceite de cocina usado valorizado» sobre
`INT-ACU-FIL`, reportado en LITER. Aplica a la barra y al líquido porque ambos consumen el
intermedio. Como en C3, no se descuenta de la huella de carbono.

## 8. IIoT

No se seedean lecturas, alertas ni dispositivos: la telemetría se genera en vivo con la simulación
existente, que ya soporta ambos procesos (`POST /api/iiot/production-orders/:id/simulation`):

- Jabón en barra → `process = bar`.
- Jabón líquido → `process = liquid`.

El simulador no se modificó; `demo:verify` comprueba que ambos procesos son válidos para el DTO de
simulación.

## 9. Qué NO contiene el baseline

No se insertan `ProductionOrder`, lotes, `IiotReading`, `IiotAlert`, `QualityInspection`,
`QualityDisposition`, `SaleOrder`, `SaleDispatch` ni `ProductionFootprint`. Todo eso se genera
durante la demo. Los dashboards se llenan de forma natural con esas operaciones y el selector por
producto del dashboard de Producción permite comparar ambos terminados.

## 10. Guion de la defensa

### Flujo principal: jabón en barra completo

1. Compras: OC a `SUP-ACU-001` por **10000 mL** de `MP-ACU` → confirmar → recibir (lote MP-ACU).
2. Producción: OP de `INT-ACU-FIL` por **5000 mL** (consume 5000 mL del lote recibido) → lote
   filtrado `RELEASED`.
3. Producción: OP de `PT-JABON-500` por **10 UNIT** → iniciar → simulación IIoT `bar` → completar
   asignando el lote filtrado. Consume 5000 mL de aceite filtrado, 700 g de soda, 1800 mL de agua
   y 50 mL de esencia. El lote nace `QUARANTINED`.
4. Calidad: inspección → `RELEASED`.
5. Ventas: OV a `CLI-VERDE-001` → despacho del lote.
6. Opcional: huella C3 (con `DEMO-ELECTRICITY` manual) y circularidad del aceite valorizado.

### Evidencia de flexibilidad: jabón líquido

Si el tiempo es limitado, basta mostrar BOM, ruta (con embotellado, tapado y etiquetado),
estructura `READY` y la disponibilidad para crear la OP. Si hay tiempo, se ejecuta una OP corta
(`LIQUID_DEMO_BATCH` en `demo-data.ts`):

1. OP de `INT-ACU-FIL` por **1500 mL** con el aceite recibido restante.
2. OP de `PT-JABON-LIQ` por **10 UNIT**: 1500 mL de aceite filtrado, 200 g de soda, 3000 mL de
   agua, 30 mL de esencia, 10 botellas, 10 tapas y 10 etiquetas → simulación IIoT `liquid` →
   completar → lote `QUARANTINED` → inspección → `RELEASED`.
3. Venta opcional de **5 UNIT** de `PT-JABON-LIQ` (no se seedea).

Los requerimientos de la OP líquida listan solo sus componentes directos: no explotan `MP-ACU`
(C4).

## 11. Verificación

`pnpm demo:verify` comprueba roles, usuarios, almacén, proveedores y clientes, productos base,
ambos terminados, packaging líquido, las tres fórmulas (v1 activa, sin v2), las tres rutas
(incluido embotellado, tapado y etiquetado), ambas estructuras `READY` con `maxDepth = 2`, el stock
inicial por ledger, la circularidad, los factores y la compatibilidad IIoT:

```text
EcoSoap Demo Dataset
Roles............................. PASS
Demo users........................ PASS
...
Bar manufacturing structure....... READY
Liquid manufacturing structure.... READY
IIoT compatibility................ PASS
Dataset ready for demonstration.
```

Pruebas:

- `backend/src/demo/demo-data.spec.ts`: definición del dataset y contraseña.
- `backend/test/demo-dataset.e2e-spec.ts`: dos seeds concurrentes, idempotencia, verificación de
  solo lectura, drift con rollback, inicio de sesión demo y requerimientos de la OP líquida.
- CI `Docker development`: `db:seed:demo` y `demo:verify` dos veces sobre el stack real.

C5 no modifica el esquema ni agrega migraciones, y no cambia la semántica de C1–C4, IIoT,
Compras, Inventario, Ventas ni dashboards.
