# Requisitos y trazabilidad de alcance — EcoSoap ERP

## Fuente de verdad y criterio de clasificación

El cotejo académico se realizó contra la [Entrega 1 oficial — _Entrega1_ERP_EcoSoap v2_](https://docs.google.com/document/d/16vj0X6WtFVxBORmMUt8JIwS22EO9F8d6tCvqZx7cKa8/edit?usp=drivesdk), secciones 2, 4 y 5.

| Origen      | Criterio                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| `OFICIAL`   | El requisito o alcance aparece expresamente en la Entrega 1.                                                   |
| `DERIVADO`  | Regla técnica necesaria para implementar correctamente un requisito oficial; la columna Evidencia indica cuál. |
| `PROPUESTO` | Mejora o decisión del equipo que no consta expresamente en la Entrega 1.                                       |

`Origen` no equivale al campo **Estado** de la ficha académica. La Entrega marca sus diez RNF como “Propuesto”; no obstante, son `OFICIAL` para esta matriz porque están escritos explícitamente en la Entrega 1. Los IDs que el equipo había creado para desglosar una ficha oficial no adquieren carácter oficial por llevar el prefijo `RF-`.

## Estados de implementación

| Estado        | Significado                                                                |
| ------------- | -------------------------------------------------------------------------- |
| `Pending`     | Aún no se implementó el requisito o flujo.                                 |
| `In Progress` | Existe una parte de código o fundación técnica, pero no el flujo completo. |
| `Implemented` | El código del alcance está completo y compila.                             |
| `Verified`    | Hay evidencia de prueba, API o interfaz del flujo completo.                |
| `Integrated`  | Fue fusionado en `develop` mediante un PR revisado.                        |

Una tabla, una migración o una prueba de Foundation **no** verifican por sí solas un flujo empresarial completo.

## Matriz de requisitos funcionales oficiales

| ID         | Requisito                                                                                                                                                                                 | Origen    | Estado        | Implementación                                                                                             | Evidencia                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RF-COM-001 | Gestionar proveedores: registrar, consultar, actualizar y deshabilitar; con identificador, razón social/nombre, teléfono, correo, dirección y estado.                                     | `OFICIAL` | `Pending`     | Sin módulo Compras.                                                                                        | Entrega 1 §4.1.                                                              |
| RF-COM-002 | Gestionar órdenes de compra de un proveedor con productos/materiales, cantidades, precios unitarios, fecha de emisión y estado.                                                           | `OFICIAL` | `Pending`     | Sin módulo Compras.                                                                                        | Entrega 1 §4.1.                                                              |
| RF-COM-003 | Registrar la recepción total o parcial de una orden y generar los movimientos de entrada de inventario.                                                                                   | `OFICIAL` | `Pending`     | Foundation aporta el ledger, pero no existe recepción ni módulo Compras.                                   | Entrega 1 §4.1; pruebas de Foundation solo cubren ajustes.                   |
| RF-INV-001 | Gestionar productos y materias primas con código, nombre, categoría, unidad, tipo y estado.                                                                                               | `OFICIAL` | `Pending`     | Foundation modela los seis atributos, con `category` flexible separada del enum `type`; faltan CRUD y API. | Entrega 1 §4.2; migración y pruebas Foundation.                              |
| RF-INV-002 | Mantener existencias desde entradas y salidas de compras, producción, ventas y ajustes autorizados; cada movimiento registra producto, cantidad, tipo, fecha, usuario y operación origen. | `OFICIAL` | `In Progress` | `InventoryMovement`, `StockBalance` y ajustes Foundation; faltan los flujos de dominio y API.              | Entrega 1 §4.2; `foundation.e2e-spec.ts` no cubre Compras/Producción/Ventas. |
| RF-INV-003 | Identificar por código único los lotes de producción y consultar su producto, orden, materias primas consumidas y controles de calidad.                                                   | `OFICIAL` | `In Progress` | `Lot` y su integridad con movimiento existen; faltan Producción, consultas y calidad.                      | Entrega 1 §4.2; Foundation valida solo la base técnica.                      |
| RF-PRO-001 | Definir una BOM por producto manufacturado, con componentes, cantidades y unidades.                                                                                                       | `OFICIAL` | `Pending`     | Sin módulo Producción.                                                                                     | Entrega 1 §4.3.                                                              |
| RF-PRO-002 | Crear, consultar y actualizar órdenes de producción con producto, cantidad, fecha de creación, estado y BOM asociada.                                                                     | `OFICIAL` | `Pending`     | Sin módulo Producción.                                                                                     | Entrega 1 §4.3.                                                              |
| RF-PRO-003 | Antes de ejecutar, comprobar disponibilidad; al finalizar, consumir materiales, generar lote e incrementar el terminado mediante movimientos de inventario.                               | `OFICIAL` | `Pending`     | Foundation soporta movimientos/lotes, no la ejecución de producción.                                       | Entrega 1 §4.3.                                                              |
| RF-PRO-004 | Registrar controles básicos de calidad por lote: resultado, observaciones, fecha, responsable y no conformidades.                                                                         | `OFICIAL` | `Pending`     | Sin módulo de calidad ni API.                                                                              | Entrega 1 §4.3.                                                              |
| RF-VEN-001 | Gestionar clientes: registrar, consultar, actualizar y deshabilitar, con nombre, contacto, dirección y estado.                                                                            | `OFICIAL` | `Pending`     | Sin módulo Ventas.                                                                                         | Entrega 1 §4.4.                                                              |
| RF-VEN-002 | Gestionar órdenes de venta con cliente, productos, cantidades, precios, fecha y estado; comprobar disponibilidad antes de confirmar.                                                      | `OFICIAL` | `Pending`     | Sin módulo Ventas.                                                                                         | Entrega 1 §4.4.                                                              |
| RF-VEN-003 | Registrar el despacho de una orden confirmada y generar la salida automática del inventario de terminado.                                                                                 | `OFICIAL` | `Pending`     | Foundation aporta el ledger, pero no existe despacho ni módulo Ventas.                                     | Entrega 1 §4.4.                                                              |

### Correcciones de identificador respecto al catálogo anterior

- La antigua descripción de `RF-COM-003` (“confirmar una orden”) no es el RF-COM-003 oficial. El ID oficial corresponde a **recepción de compras**.
- `RF-INV-002` no es solo una consulta de saldo: es el control integrado de existencias y movimientos. `RF-INV-003` es gestión y trazabilidad de lotes, no el ledger genérico.
- `RF-PRO-002`, `RF-PRO-003` y `RF-PRO-004` oficiales son, respectivamente, órdenes de producción, ejecución integrada y calidad por lote. El cálculo de materiales y las precondiciones son desgloses derivados.
- `RF-VEN-003` oficial es el despacho. La consulta informativa y la no-reserva no son el requisito oficial con ese ID.

## Requisitos no funcionales oficiales

| ID      | Requisito                                                                                                                                                                          | Origen    | Estado        | Implementación                                                                      | Evidencia                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| RNF-001 | Interfaz clara, consistente y fácil de aprender en menús, formularios, tablas, botones y confirmaciones.                                                                           | `OFICIAL` | `Pending`     | Solo existe pantalla temporal.                                                      | Entrega 1 §4.6.                    |
| RNF-002 | Credenciales individuales, control por rol y permisos; contraseñas nunca en texto plano.                                                                                           | `OFICIAL` | `In Progress` | `Role`/`User` existen; faltan autenticación, hashing y autorización.                | Entrega 1 §4.6.                    |
| RNF-003 | Operaciones habituales en menos de 3 s en condiciones normales; paginación, filtros y consultas optimizadas para grandes volúmenes.                                                | `OFICIAL` | `Pending`     | No hay medición de rendimiento del sistema completo.                                | Entrega 1 §4.6.                    |
| RNF-004 | Integridad transaccional: una operación de existencias no deja movimientos parciales si falla.                                                                                     | `OFICIAL` | `In Progress` | Protocolo transaccional de ajustes Foundation; faltan compras, producción y ventas. | Entrega 1 §4.6; Foundation e2e.    |
| RNF-005 | Arquitectura modular para Compras, Inventario, Producción y Ventas, bajo acoplamiento y reglas compartidas centralizadas mediante API definida.                                    | `OFICIAL` | `In Progress` | Monolito modular y base de API; módulos de dominio pendientes.                      | Entrega 1 §4.6; `architecture.md`. |
| RNF-006 | Disponibilidad mínima de 95 % durante la evaluación y horario operativo del proyecto.                                                                                              | `OFICIAL` | `Pending`     | Health check no demuestra disponibilidad medida.                                    | Entrega 1 §4.6.                    |
| RNF-007 | Trazar operaciones de inventario, producción, compras y ventas con usuario, fecha/hora, tipo y entidad; reconstruir el flujo, incluidos insumos, lote y movimientos de producción. | `OFICIAL` | `In Progress` | `AuditLog`/ledger Foundation; falta cobertura de todos los dominios.                | Entrega 1 §4.6; Foundation e2e.    |
| RNF-008 | Compatibilidad con Chrome, Firefox y Edge recientes; diseño adaptable para escritorio, portátil y tableta.                                                                         | `OFICIAL` | `Pending`     | Sin validación multiexplorador ni interfaz ERP.                                     | Entrega 1 §4.6.                    |
| RNF-009 | Respaldos de base de datos al menos semanales y recuperables.                                                                                                                      | `OFICIAL` | `Pending`     | No hay mecanismo de respaldo/restauración.                                          | Entrega 1 §4.6.                    |
| RNF-010 | Soportar al menos 20 usuarios concurrentes sin degradar significativamente RNF-003; arquitectura ampliable.                                                                        | `OFICIAL` | `In Progress` | Se probó concurrencia de Foundation, no 20 usuarios ni el SLO de 3 s.               | Entrega 1 §4.6; Foundation e2e.    |

## Reglas derivadas

| ID        | Requisito                                                             | Origen     | Estado        | Implementación                                      | Evidencia                                                         |
| --------- | --------------------------------------------------------------------- | ---------- | ------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| D-COM-001 | Ciclo `DRAFT → CONFIRMED` antes de recibir una compra.                | `DERIVADO` | `Pending`     | Diseño futuro de Compras.                           | Desglosa RF-COM-003; el estado exacto no está en la Entrega.      |
| D-COM-002 | Crear una orden no altera existencias.                                | `DERIVADO` | `Pending`     | Diseño futuro de Compras.                           | RF-COM-003 sitúa la entrada al registrar la recepción.            |
| D-INV-001 | Consulta de saldo por producto y almacén.                             | `DERIVADO` | `Pending`     | `StockBalance` Foundation, sin API.                 | RF-INV-002 exige mantener existencias actualizadas.               |
| D-INV-002 | Ledger tipificado e inmutable e historial consultable de movimientos. | `DERIVADO` | `In Progress` | `InventoryMovement` Foundation.                     | Campos mínimos de RF-INV-002 y RNF-004.                           |
| D-INV-003 | Ajuste manual autorizado con motivo tipificado obligatorio.           | `DERIVADO` | `In Progress` | `AdjustmentReason` y `apply-adjustment`.            | RF-INV-002 menciona ajustes autorizados.                          |
| D-INV-004 | Impedir saldo negativo.                                               | `DERIVADO` | `In Progress` | Validación y bloqueo en Foundation.                 | Mantiene existencias reales y consistentes de RF-INV-002/RNF-004. |
| D-PRO-001 | Calcular materiales requeridos desde la BOM y cantidad de la orden.   | `DERIVADO` | `Pending`     | Diseño futuro de Producción.                        | RF-PRO-001 y RF-PRO-003.                                          |
| D-PRO-002 | Ejecutar el consumo y la entrada de terminado atómicamente.           | `DERIVADO` | `Pending`     | Protocolo Foundation reutilizable.                  | RF-PRO-003 y RNF-004.                                             |
| D-PRO-003 | Reconstruir la cadena lote → materias primas consumidas.              | `DERIVADO` | `Pending`     | Relaciones futuras de Producción.                   | RF-INV-003 y RNF-007.                                             |
| D-PRO-004 | Rechazar ejecución sin insumos sin dejar cambios de inventario.       | `DERIVADO` | `Pending`     | Diseño futuro de Producción.                        | RF-PRO-003 y RNF-004.                                             |
| D-VEN-001 | Comprobar disponibilidad al confirmar una venta.                      | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                            | Desglosa RF-VEN-002.                                              |
| D-VEN-002 | El despacho genera el movimiento de salida de terminado.              | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                            | Desglosa RF-VEN-003.                                              |
| D-VEN-003 | Crear una orden no altera existencias; el cambio ocurre al despachar. | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                            | Comentario de RF-VEN-003.                                         |
| D-AUD-001 | `AuditLog` append-only para que la traza no pueda ser alterada.       | `DERIVADO` | `In Progress` | Disparadores Foundation.                            | RNF-007.                                                          |
| D-AUD-002 | Rechazar `UPDATE` y `DELETE` sobre auditoría mediante base de datos.  | `DERIVADO` | `Verified`    | Disparadores Foundation.                            | Pruebas append-only de Foundation.                                |
| D-AUD-003 | Lista permitida para sanitizar secretos si se guardan snapshots.      | `DERIVADO` | `In Progress` | Diseño de auditoría; cobertura de flujos pendiente. | RNF-002 y RNF-007.                                                |
| D-AUT-001 | Hash seguro de contraseñas y autorización validada en backend.        | `DERIVADO` | `Pending`     | Sin módulo Auth.                                    | RNF-002.                                                          |
| D-SYS-001 | Health check para diagnosticar la disponibilidad.                     | `DERIVADO` | `Verified`    | `HealthModule`.                                     | Apoya RNF-006; no acredita 95 % de disponibilidad.                |

## Requisitos y decisiones propuestas por el equipo

| ID        | Requisito                                                                                        | Origen      | Estado        | Implementación                             | Evidencia                                                             |
| --------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| P-SYS-001 | Entorno reproducible con Docker y pnpm.                                                          | `PROPUESTO` | `Verified`    | Workspace y Compose.                       | Decisión de ingeniería; no aparece en Entrega 1.                      |
| P-SYS-002 | Documentar la API mediante Swagger/OpenAPI.                                                      | `PROPUESTO` | `Verified`    | Swagger en backend.                        | Decisión de ingeniería; no aparece en Entrega 1.                      |
| P-AUT-001 | Emitir JWT para la autenticación.                                                                | `PROPUESTO` | `Pending`     | Sin Auth.                                  | RNF-002 exige autenticación, no JWT.                                  |
| P-INV-001 | Permitir trazabilidad opcional por producto (`isLotTracked`) y bloquear su cambio con histórico. | `PROPUESTO` | `In Progress` | Foundation y ADR 007.                      | La Entrega exige lotes de producción, no esta configuración general.  |
| P-PRO-001 | Versionar una BOM ya usada en vez de modificarla.                                                | `PROPUESTO` | `Pending`     | Diseño futuro.                             | La Entrega no exige versionado.                                       |
| P-PRO-002 | Estados exactos de lote `QUARANTINED`, `RELEASED` y `REJECTED`.                                  | `PROPUESTO` | `In Progress` | Enum Foundation.                           | La Entrega pide resultado/no conformidad, no esos estados ni nombres. |
| P-PRO-003 | Bloquear consumo y despacho de lote en cuarentena o rechazado.                                   | `PROPUESTO` | `Pending`     | Política de calidad futura.                | Protección válida, no obligación expresa de Entrega 1.                |
| P-PRO-004 | Configurar por producto `requiresQualityInspection`.                                             | `PROPUESTO` | `In Progress` | Campo Foundation.                          | La Entrega pide control por lote, no una bandera por producto.        |
| P-PRO-005 | Planificar una orden con `plannedDate` separado de su fecha de creación.                         | `PROPUESTO` | `Pending`     | Campo previsto en migración de Producción. | RF-PRO-002 exige fecha de creación, no fecha planificada.             |
| P-VEN-001 | Comprobación de venta informativa y sin reserva.                                                 | `PROPUESTO` | `Pending`     | Diseño futuro de Ventas.                   | RF-VEN-002 exige comprobar disponibilidad, no define reservas.        |
| P-AUD-001 | Correlacionar eventos con `requestId`.                                                           | `PROPUESTO` | `In Progress` | Columna Foundation.                        | RNF-007 no exige correlación de petición.                             |
| P-AUD-002 | Snapshots `previous`/`new` de cambios.                                                           | `PROPUESTO` | `In Progress` | Modelo Foundation.                         | RNF-007 no exige snapshots.                                           |
| P-AUD-003 | Eventos y actores específicos `LOGIN_FAILED`, `USER`/`SYSTEM`/`ANONYMOUS`.                       | `PROPUESTO` | `In Progress` | Enums y restricciones Foundation.          | RNF-007 exige responsable, no este modelo de eventos.                 |
| P-AUD-004 | Restringir la consulta global de auditoría únicamente a `ADMIN`.                                 | `PROPUESTO` | `Pending`     | Diseño de autorización futura.             | RNF-002 exige control por roles, no este permiso concreto.            |
| P-DOC-001 | No reciclar números de documentos publicados o cancelados.                                       | `PROPUESTO` | `Pending`     | `DocumentSequence` Foundation.             | La Entrega menciona números de órdenes, no esta política.             |

## Lotes, calidad y modelo Foundation

La Entrega exige explícitamente trazabilidad del **lote de producción**, la relación con orden de producción, materias primas consumidas y producto obtenido (`RF-INV-003`); también exige controles de calidad por lote, con resultado, observaciones, fecha, responsable y no conformidades (`RF-PRO-004`). Esto respalda la trazabilidad de materias primas y producto terminado a través del lote, pero no exige que la materia prima tenga por sí sola una entidad de lote ni impone una política de liberación.

`Role`, `User`, `Lot`, `InventoryMovement`, `StockBalance`, `AuditLog` y `DocumentSequence` son compatibles como fundación o infraestructura. `StockBalance` responde de forma `DERIVADO` al control de existencias; `AuditLog` respalda RNF-007; y `DocumentSequence` da soporte a los números humanos (la política de no reciclarlos sigue siendo `PROPUESTO`). Las entidades de dominio posteriores —proveedores, clientes, órdenes, BOM, rutas, controles de calidad y las relaciones completas de producción/ventas— no requieren estar en Foundation.

### Correcciones de Foundation cerradas antes del PR

La Entrega distingue explícitamente **categoría** y **tipo de producto** (`RF-INV-001`), pero
no define un catálogo cerrado. `Product.category` es texto obligatorio de hasta 100 caracteres;
`Product.type` conserva `ProductType` como enum estructural. No se añadió entidad ni enum de
categorías.

La Entrega también pide ID, nombre y ubicación para cada almacén. `Warehouse.location` es texto
obligatorio de hasta 255 caracteres; no se introdujeron coordenadas ni una dirección estructurada.
El seed asigna `Planta principal - Managua` como valor inicial de desarrollo y permite actualizarlo
después sin que una nueva ejecución del seed lo sobrescriba. `schema.prisma`, la migración inicial,
el seed y las pruebas se corrigieron en esta rama; la migración se verificó nuevamente desde una
base vacía en PostgreSQL 18.6. Esto cierra las dos brechas del modelo, mientras que el flujo de
gestión de productos RF-INV-001 permanece `Pending` hasta implementar CRUD y API.

En particular, `QUARANTINED`/`RELEASED`/`REJECTED`, el bloqueo de consumo o despacho y `requiresQualityInspection` se conservan como decisiones técnicas seguras, pero se mantienen marcadas como `PROPUESTO`; no son requisitos oficiales.
