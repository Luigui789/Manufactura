# ADR 006 — UUIDv7 como clave técnica y código humano separado

- **Estado:** Aceptado
- **Fecha:** 2026-09-23
- **Etapa:** 2 — Database foundation
- **Nota:** revisado tras la auditoría de diseño del 2026-09-23 antes de su aceptación. Se
  matizaron afirmaciones sobre seguridad y orden temporal, y se corrigió la justificación de
  `DocumentSequence`.

## Contexto

Todas las entidades necesitan una clave primaria, y los documentos empresariales necesitan además
un identificador que una persona pueda leer, dictar por teléfono y escribir en un papel. Son dos
necesidades distintas que a menudo se confunden en una sola columna.

La decisión debe ser uniforme en todo el esquema y defendible, no adoptada por moda ni por
comodidad.

## Alternativas evaluadas

| Opción            | Tamaño   | Localidad en el índice | Correlativo | Generable en cliente |
| ----------------- | -------- | ---------------------- | ----------- | -------------------- |
| `BIGINT` identity | 8 bytes  | Óptima                 | **Sí**      | No                   |
| UUIDv4            | 16 bytes | Mala                   | No          | Sí                   |
| UUIDv7            | 16 bytes | Buena                  | No          | Sí                   |
| CUID2             | ~24 car. | Mala (deliberadamente) | No          | Sí                   |

**Autoincremento** ofrece el mejor rendimiento y los índices más pequeños, pero produce
identificadores consecutivos que aparecen en las URL de la API, de modo que `/api/purchase-orders/1`
invita a recorrer identificadores vecinos.

**UUIDv4** lo evita pero es aleatorio: las inserciones caen en páginas dispersas del índice
B-tree, provocando divisiones de página y crecimiento innecesario.

**UUIDv7** (RFC 9562) antepone una marca temporal de milisegundos a los bits aleatorios, de modo
que recupera buena parte de la localidad de inserción sin ser correlativo.

**CUID2** renunció deliberadamente a la monotonicidad, de modo que pierde la localidad y ocupa más
al almacenarse como texto, sin poder usar el tipo `uuid` nativo.

## Decisión

### Clave técnica

Todas las entidades usan `String @id @default(uuid(7)) @db.Uuid`.

El tipo nativo `uuid` de PostgreSQL es obligatorio. Sin `@db.Uuid`, Prisma crea una columna
`varchar(36)`, que ocupa más del doble y compara como texto.

### Qué aporta y qué no aporta UUIDv7

Conviene ser preciso, porque es fácil atribuirle garantías que no tiene:

- **Sí aporta** una clave opaca que no invita a recorrer registros vecinos, y buena localidad
  aproximada de inserción frente a UUIDv4.
- **No es control de acceso.** Proteger un recurso es trabajo de la autorización; un identificador
  difícil de adivinar no sustituye un guard de rol.
- **No oculta la fecha de creación.** Sus bits temporales revelan aproximadamente cuándo se
  generó.
- **No oculta el volumen de operaciones**, porque el código humano correlativo lo revela de todos
  modos. Ese código es información que la empresa quiere mostrar.
- **No sustituye a `createdAt`.** Para ordenar hechos se usa la columna de fecha, no el
  identificador; el orden de UUIDv7 es aproximado y depende del reloj de quien lo genera.

### Identificador humano

Los documentos llevan **además** un código legible, único e indexado, que nunca es clave primaria.
Los formatos se fijan en español para mantener coherencia con el idioma del proyecto, resolviendo
la ambigüedad de los ejemplos iniciales que mezclaban abreviaturas en inglés:

| Entidad           | Columna  | Formato           |
| ----------------- | -------- | ----------------- |
| `Product`         | `code`   | `MP-ACE-001`      |
| `Warehouse`       | `code`   | `ALM-PRINCIPAL`   |
| `Lot`             | `code`   | `LOT-2026-000001` |
| `PurchaseOrder`   | `number` | `OC-2026-000001`  |
| `PurchaseReceipt` | `number` | `REC-2026-000001` |
| `ProductionOrder` | `number` | `OP-2026-000001`  |
| `SalesOrder`      | `number` | `OV-2026-000001`  |
| `Dispatch`        | `number` | `DES-2026-000001` |

### `DocumentSequence`

Una tabla auxiliar con unicidad sobre `(documentType, year)` y un contador. El año se determina
con la **zona empresarial `America/Managua`**, no con UTC: sin fijarla, dos usuarios operando
cerca de medianoche del 31 de diciembre obtendrían años distintos.

La justificación es la **variedad de formatos anuales**: administrar una secuencia de PostgreSQL
por cada combinación de tipo y año es más engorroso que una tabla pequeña. Una actualización de
fila participa además de la transacción del documento.

Reglas explícitas de la numeración:

- **Los huecos son válidos y esperados.** No se promete numeración consecutiva sin saltos, y no se
  diseña nada para evitarlos. Una versión anterior de este ADR presentaba «el rollback devuelve el
  número» como ventaja decisiva; era una promesa innecesaria que invita a intentar reciclar.
- **Un número publicado o cancelado jamás se recicla.** Un documento cancelado conserva el suyo.
- **El número no se muestra como definitivo hasta el commit.** Enseñarlo antes induce a apuntarlo
  y luego no encontrarlo.

## Consecuencias

- El coste frente a `BIGINT` es de 8 bytes adicionales por clave y por clave foránea. Para el
  volumen de este proyecto es irrelevante.
- Los identificadores son incómodos de escribir a mano al depurar con `psql`. Se compensa con las
  columnas `code` y `number`, únicas e indexadas, que son la vía natural de consulta humana.
- El cliente puede generar el identificador antes de insertar, lo que simplifica las pruebas y
  permite construir grafos de objetos relacionados sin ida y vuelta a la base de datos.
- La fila del contador por tipo y año es un punto de contención. Para el volumen del proyecto no
  representa un problema; si lo fuera, la alternativa sería numerar en un paso posterior al
  commit, aceptando más huecos.
- `DocumentSequence` es infraestructura, no dominio. Queda documentada aquí para que nadie la
  confunda con una entidad empresarial.
