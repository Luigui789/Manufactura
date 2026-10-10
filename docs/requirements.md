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

| ID         | Requisito                                                                                                                                                                                 | Origen    | Estado        | Implementación                                                                                                                                                                                                                          | Evidencia                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| RF-COM-001 | Gestionar proveedores: registrar, consultar, actualizar y deshabilitar; con identificador, razón social/nombre, teléfono, correo, dirección y estado.                                     | `OFICIAL` | `Integrated`  | API y frontend de proveedores en Compras: crear, listar paginado, consultar, editar y activar/desactivar; código único, contacto opcional, permisos y auditoría transaccional. Integrado en `develop` mediante PR #8 (merge `ab8a5a8`). | Entrega 1 §4.1; `suppliers.e2e-spec.ts`: 30 pruebas; `SuppliersPage.test.tsx` y `schemas.test.ts`: 17 pruebas. Aprobadas en `feature/suppliers`. |
| RF-COM-002 | Gestionar órdenes de compra de un proveedor con productos/materiales, cantidades, precios unitarios, fecha de emisión y estado.                                                           | `OFICIAL` | `Pending`     | Sin módulo Compras.                                                                                                                                                                                                                     | Entrega 1 §4.1.                                                                                                                                  |
| RF-COM-003 | Registrar la recepción total o parcial de una orden y generar los movimientos de entrada de inventario.                                                                                   | `OFICIAL` | `Pending`     | Foundation aporta el ledger, pero no existe recepción ni módulo Compras.                                                                                                                                                                | Entrega 1 §4.1; pruebas de Foundation solo cubren ajustes.                                                                                       |
| RF-INV-001 | Gestionar productos y materias primas con código, nombre, categoría, unidad, tipo y estado.                                                                                               | `OFICIAL` | `Integrated`  | API y frontend de productos: gestión, filtros, normalización de código, historial, permisos y auditoría. Integrado en `develop` mediante PR #6 (merge `332e499`).                                                                       | Entrega 1 §4.2; e2e de productos (25), historial (7), filtros (23); pantalla (18) y filtros frontend compartidos (20). Evidencia del 2026-10-09. |
| RF-INV-002 | Mantener existencias desde entradas y salidas de compras, producción, ventas y ajustes autorizados; cada movimiento registra producto, cantidad, tipo, fecha, usuario y operación origen. | `OFICIAL` | `In Progress` | `InventoryMovement`, `StockBalance` y ajustes Foundation; faltan los flujos de dominio y API.                                                                                                                                           | Entrega 1 §4.2; `foundation.e2e-spec.ts` no cubre Compras/Producción/Ventas.                                                                     |
| RF-INV-003 | Identificar por código único los lotes de producción y consultar su producto, orden, materias primas consumidas y controles de calidad.                                                   | `OFICIAL` | `In Progress` | `Lot` y su integridad con movimiento existen; faltan Producción, consultas y calidad.                                                                                                                                                   | Entrega 1 §4.2; Foundation valida solo la base técnica.                                                                                          |
| RF-PRO-001 | Definir una BOM por producto manufacturado, con componentes, cantidades y unidades.                                                                                                       | `OFICIAL` | `Pending`     | Sin módulo Producción.                                                                                                                                                                                                                  | Entrega 1 §4.3.                                                                                                                                  |
| RF-PRO-002 | Crear, consultar y actualizar órdenes de producción con producto, cantidad, fecha de creación, estado y BOM asociada.                                                                     | `OFICIAL` | `Pending`     | Sin módulo Producción.                                                                                                                                                                                                                  | Entrega 1 §4.3.                                                                                                                                  |
| RF-PRO-003 | Antes de ejecutar, comprobar disponibilidad; al finalizar, consumir materiales, generar lote e incrementar el terminado mediante movimientos de inventario.                               | `OFICIAL` | `Pending`     | Foundation soporta movimientos/lotes, no la ejecución de producción.                                                                                                                                                                    | Entrega 1 §4.3.                                                                                                                                  |
| RF-PRO-004 | Registrar controles básicos de calidad por lote: resultado, observaciones, fecha, responsable y no conformidades.                                                                         | `OFICIAL` | `Pending`     | Sin módulo de calidad ni API.                                                                                                                                                                                                           | Entrega 1 §4.3.                                                                                                                                  |
| RF-VEN-001 | Gestionar clientes: registrar, consultar, actualizar y deshabilitar, con nombre, contacto, dirección y estado.                                                                            | `OFICIAL` | `Verified`    | API y frontend de clientes en Ventas: crear, listar paginado, consultar, editar y activar/desactivar; código único, contacto opcional, permisos y auditoría transaccional. Integración en `develop` pendiente.                          | Entrega 1 §4.4; `customers.e2e-spec.ts`: 30 pruebas; `CustomersPage.test.tsx` y `schemas.test.ts`: 17 pruebas. Aprobadas en `feature/customers`. |
| RF-VEN-002 | Gestionar órdenes de venta con cliente, productos, cantidades, precios, fecha y estado; comprobar disponibilidad antes de confirmar.                                                      | `OFICIAL` | `Pending`     | Sin módulo Ventas.                                                                                                                                                                                                                      | Entrega 1 §4.4.                                                                                                                                  |
| RF-VEN-003 | Registrar el despacho de una orden confirmada y generar la salida automática del inventario de terminado.                                                                                 | `OFICIAL` | `Pending`     | Foundation aporta el ledger, pero no existe despacho ni módulo Ventas.                                                                                                                                                                  | Entrega 1 §4.4.                                                                                                                                  |

### Correcciones de identificador respecto al catálogo anterior

- La antigua descripción de `RF-COM-003` (“confirmar una orden”) no es el RF-COM-003 oficial. El ID oficial corresponde a **recepción de compras**.
- `RF-INV-002` no es solo una consulta de saldo: es el control integrado de existencias y movimientos. `RF-INV-003` es gestión y trazabilidad de lotes, no el ledger genérico.
- `RF-PRO-002`, `RF-PRO-003` y `RF-PRO-004` oficiales son, respectivamente, órdenes de producción, ejecución integrada y calidad por lote. El cálculo de materiales y las precondiciones son desgloses derivados.
- `RF-VEN-003` oficial es el despacho. La consulta informativa y la no-reserva no son el requisito oficial con ese ID.

## Requisitos no funcionales oficiales

| ID      | Requisito                                                                                                                                                                          | Origen    | Estado        | Implementación                                                                                                                                                                                                                                                 | Evidencia                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| RNF-001 | Interfaz clara, consistente y fácil de aprender en menús, formularios, tablas, botones y confirmaciones.                                                                           | `OFICIAL` | `In Progress` | Login, layout por rol, usuarios, productos, almacenes y proveedores integrados; clientes verificados. Resto de interfaces de negocio pendiente.                                                                                                                | Frontend y navegador de Etapa 3; PR #3. Primera oleada: 16 pruebas de productos y 17 de almacenes. |
| RNF-002 | Credenciales individuales, control por rol y permisos; contraseñas nunca en texto plano.                                                                                           | `OFICIAL` | `Integrated`  | Auth/RBAC backend y frontend, Argon2id y credenciales individuales.                                                                                                                                                                                            | 35 unitarias, 51 e2e y 29 frontend; navegador; Etapa 3.                                            |
| RNF-003 | Operaciones habituales en menos de 3 s en condiciones normales; paginación, filtros y consultas optimizadas para grandes volúmenes.                                                | `OFICIAL` | `In Progress` | Paginación y filtros de productos/almacenes implementados y probados. Pendientes las mediciones de latencia y rendimiento con grandes volúmenes.                                                                                                               | Entrega 1 §4.6; pruebas de filtros backend y frontend. No acreditan el objetivo de menos de 3 s.   |
| RNF-004 | Integridad transaccional: una operación de existencias no deja movimientos parciales si falla.                                                                                     | `OFICIAL` | `In Progress` | Protocolo transaccional de ajustes Foundation; faltan compras, producción y ventas.                                                                                                                                                                            | Entrega 1 §4.6; Foundation e2e.                                                                    |
| RNF-005 | Arquitectura modular para Compras, Inventario, Producción y Ventas, bajo acoplamiento y reglas compartidas centralizadas mediante API definida.                                    | `OFICIAL` | `In Progress` | Monolito modular con Inventario (`ProductsModule`, `WarehousesModule`), Compras (`SuppliersModule`) y Ventas (`CustomersModule`). Los flujos transaccionales de Compras, Producción y Ventas siguen pendientes.                                                | Entrega 1 §4.6; `architecture.md`; módulos y API de productos y almacenes en la rama de trabajo.   |
| RNF-006 | Disponibilidad mínima de 95 % durante la evaluación y horario operativo del proyecto.                                                                                              | `OFICIAL` | `Pending`     | Health check no demuestra disponibilidad medida.                                                                                                                                                                                                               | Entrega 1 §4.6.                                                                                    |
| RNF-007 | Trazar operaciones de inventario, producción, compras y ventas con usuario, fecha/hora, tipo y entidad; reconstruir el flujo, incluidos insumos, lote y movimientos de producción. | `OFICIAL` | `In Progress` | `AuditLog`/ledger Foundation y auditoría de productos, almacenes, proveedores y clientes con actor, entidad, fecha/hora, acción, requestId y valores anteriores/nuevos; reversión transaccional probada. Trazabilidad de los flujos transaccionales pendiente. | Entrega 1 §4.6; Foundation e2e y e2e de productos, almacenes, proveedores y clientes.              |
| RNF-008 | Compatibilidad con Chrome, Firefox y Edge recientes; diseño adaptable para escritorio, portátil y tableta.                                                                         | `OFICIAL` | `Pending`     | Interfaces de autenticación, usuarios, productos, almacenes, proveedores y clientes disponibles. Pendiente validación multiexplorador y en los dispositivos requeridos.                                                                                        | Entrega 1 §4.6.                                                                                    |
| RNF-009 | Respaldos de base de datos al menos semanales y recuperables.                                                                                                                      | `OFICIAL` | `Pending`     | No hay mecanismo de respaldo/restauración.                                                                                                                                                                                                                     | Entrega 1 §4.6.                                                                                    |
| RNF-010 | Soportar al menos 20 usuarios concurrentes sin degradar significativamente RNF-003; arquitectura ampliable.                                                                        | `OFICIAL` | `In Progress` | Se probó concurrencia de Foundation, no 20 usuarios ni el SLO de 3 s.                                                                                                                                                                                          | Entrega 1 §4.6; Foundation e2e.                                                                    |

## Reglas derivadas

| ID        | Requisito                                                             | Origen     | Estado        | Implementación                                                                                                                                                 | Evidencia                                                         |
| --------- | --------------------------------------------------------------------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| D-COM-001 | Ciclo `DRAFT → CONFIRMED` antes de recibir una compra.                | `DERIVADO` | `Pending`     | Diseño futuro de Compras.                                                                                                                                      | Desglosa RF-COM-003; el estado exacto no está en la Entrega.      |
| D-COM-002 | Crear una orden no altera existencias.                                | `DERIVADO` | `Pending`     | Diseño futuro de Compras.                                                                                                                                      | RF-COM-003 sitúa la entrada al registrar la recepción.            |
| D-INV-001 | Consulta de saldo por producto y almacén.                             | `DERIVADO` | `Pending`     | `StockBalance` Foundation, sin API.                                                                                                                            | RF-INV-002 exige mantener existencias actualizadas.               |
| D-INV-002 | Ledger tipificado e inmutable e historial consultable de movimientos. | `DERIVADO` | `In Progress` | `InventoryMovement` Foundation.                                                                                                                                | Campos mínimos de RF-INV-002 y RNF-004.                           |
| D-INV-003 | Ajuste manual autorizado con motivo tipificado obligatorio.           | `DERIVADO` | `In Progress` | `AdjustmentReason` y `apply-adjustment`.                                                                                                                       | RF-INV-002 menciona ajustes autorizados.                          |
| D-INV-004 | Impedir saldo negativo.                                               | `DERIVADO` | `In Progress` | Validación y bloqueo en Foundation.                                                                                                                            | Mantiene existencias reales y consistentes de RF-INV-002/RNF-004. |
| D-PRO-001 | Calcular materiales requeridos desde la BOM y cantidad de la orden.   | `DERIVADO` | `Pending`     | Diseño futuro de Producción.                                                                                                                                   | RF-PRO-001 y RF-PRO-003.                                          |
| D-PRO-002 | Ejecutar el consumo y la entrada de terminado atómicamente.           | `DERIVADO` | `Pending`     | Protocolo Foundation reutilizable.                                                                                                                             | RF-PRO-003 y RNF-004.                                             |
| D-PRO-003 | Reconstruir la cadena lote → materias primas consumidas.              | `DERIVADO` | `Pending`     | Relaciones futuras de Producción.                                                                                                                              | RF-INV-003 y RNF-007.                                             |
| D-PRO-004 | Rechazar ejecución sin insumos sin dejar cambios de inventario.       | `DERIVADO` | `Pending`     | Diseño futuro de Producción.                                                                                                                                   | RF-PRO-003 y RNF-004.                                             |
| D-VEN-001 | Comprobar disponibilidad al confirmar una venta.                      | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                                                                                                                                       | Desglosa RF-VEN-002.                                              |
| D-VEN-002 | El despacho genera el movimiento de salida de terminado.              | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                                                                                                                                       | Desglosa RF-VEN-003.                                              |
| D-VEN-003 | Crear una orden no altera existencias; el cambio ocurre al despachar. | `DERIVADO` | `Pending`     | Diseño futuro de Ventas.                                                                                                                                       | Comentario de RF-VEN-003.                                         |
| D-AUD-001 | `AuditLog` append-only para que la traza no pueda ser alterada.       | `DERIVADO` | `In Progress` | Disparadores Foundation.                                                                                                                                       | RNF-007.                                                          |
| D-AUD-002 | Rechazar `UPDATE` y `DELETE` sobre auditoría mediante base de datos.  | `DERIVADO` | `Verified`    | Disparadores Foundation.                                                                                                                                       | Pruebas append-only de Foundation.                                |
| D-AUD-003 | Lista permitida para sanitizar secretos si se guardan snapshots.      | `DERIVADO` | `In Progress` | Snapshots USER sanitizados y comprobados; productos, almacenes, proveedores y clientes usan listas explícitas de campos permitidos. Otros dominios pendientes. | RNF-002 y RNF-007; snapshots unitarios y e2e de secretos.         |
| D-AUT-001 | Hash seguro de contraseñas y autorización validada en backend.        | `DERIVADO` | `Integrated`  | Argon2id, guards globales y políticas denegadas por omisión.                                                                                                   | RNF-002; unitarias y e2e de Auth/RBAC.                            |
| D-SYS-001 | Health check para diagnosticar la disponibilidad.                     | `DERIVADO` | `Verified`    | `HealthModule`.                                                                                                                                                | Apoya RNF-006; no acredita 95 % de disponibilidad.                |

## Requisitos y decisiones propuestas por el equipo

| ID        | Requisito                                                                                        | Origen      | Estado        | Implementación                                                                                                              | Evidencia                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P-SYS-001 | Entorno reproducible con Docker y pnpm.                                                          | `PROPUESTO` | `Verified`    | Workspace y Compose.                                                                                                        | Decisión de ingeniería; no aparece en Entrega 1.                                                |
| P-SYS-002 | Documentar la API mediante Swagger/OpenAPI.                                                      | `PROPUESTO` | `Verified`    | Swagger en backend.                                                                                                         | Decisión de ingeniería; no aparece en Entrega 1.                                                |
| P-AUT-001 | Emitir JWT para la autenticación.                                                                | `PROPUESTO` | `Integrated`  | JWT HS256 en cookie HttpOnly, versión de sesión y revocación.                                                               | Auth e2e; RNF-002 exige autenticación, no JWT.                                                  |
| P-INV-001 | Permitir trazabilidad opcional por producto (`isLotTracked`) y bloquear su cambio con histórico. | `PROPUESTO` | `In Progress` | Foundation y ADR 007.                                                                                                       | La Entrega exige lotes de producción, no esta configuración general.                            |
| P-PRO-001 | Versionar una BOM ya usada en vez de modificarla.                                                | `PROPUESTO` | `Pending`     | Diseño futuro.                                                                                                              | La Entrega no exige versionado.                                                                 |
| P-PRO-002 | Estados exactos de lote `QUARANTINED`, `RELEASED` y `REJECTED`.                                  | `PROPUESTO` | `In Progress` | Enum Foundation.                                                                                                            | La Entrega pide resultado/no conformidad, no esos estados ni nombres.                           |
| P-PRO-003 | Bloquear consumo y despacho de lote en cuarentena o rechazado.                                   | `PROPUESTO` | `Pending`     | Política de calidad futura.                                                                                                 | Protección válida, no obligación expresa de Entrega 1.                                          |
| P-PRO-004 | Configurar por producto `requiresQualityInspection`.                                             | `PROPUESTO` | `In Progress` | Campo Foundation.                                                                                                           | La Entrega pide control por lote, no una bandera por producto.                                  |
| P-PRO-005 | Planificar una orden con `plannedDate` separado de su fecha de creación.                         | `PROPUESTO` | `Pending`     | Campo previsto en migración de Producción.                                                                                  | RF-PRO-002 exige fecha de creación, no fecha planificada.                                       |
| P-VEN-001 | Comprobación de venta informativa y sin reserva.                                                 | `PROPUESTO` | `Pending`     | Diseño futuro de Ventas.                                                                                                    | RF-VEN-002 exige comprobar disponibilidad, no define reservas.                                  |
| P-AUD-001 | Correlacionar eventos con `requestId`.                                                           | `PROPUESTO` | `In Progress` | Contexto de petición y X-Request-Id en Auth/Users, productos, almacenes, proveedores y clientes; otros dominios pendientes. | Auth/Users y catálogos e2e; RNF-007 no exige correlación.                                       |
| P-AUD-002 | Snapshots `previous`/`new` de cambios.                                                           | `PROPUESTO` | `In Progress` | Snapshots y diferencias permitidas en Auth/Users, productos, almacenes, proveedores y clientes; otros dominios pendientes.  | Snapshots unitarios y auditoría e2e de usuarios y de los cuatro catálogos; decisión del equipo. |
| P-AUD-003 | Eventos y actores específicos `LOGIN_FAILED`, `USER`/`SYSTEM`/`ANONYMOUS`.                       | `PROPUESTO` | `In Progress` | LOGIN/LOGIN_FAILED/LOGOUT y cambios USER/SYSTEM; dominios pendientes.                                                       | Auth, usuarios y bootstrap e2e; decisión del equipo.                                            |
| P-AUD-004 | Restringir la consulta global de auditoría únicamente a `ADMIN`.                                 | `PROPUESTO` | `Pending`     | Diseño de autorización futura.                                                                                              | RNF-002 exige control por roles, no este permiso concreto.                                      |
| P-DOC-001 | No reciclar números de documentos publicados o cancelados.                                       | `PROPUESTO` | `Pending`     | `DocumentSequence` Foundation.                                                                                              | La Entrega menciona números de órdenes, no esta política.                                       |

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
después sin que una nueva ejecución del seed lo sobrescriba. Las correcciones de `schema.prisma`,
la migración inicial, el seed y las pruebas corresponden al cierre histórico de Foundation, antes
de compartir su migración. En esa etapa se verificó la migración desde una base vacía en PostgreSQL
18.6 y se cerraron las dos brechas del modelo.

En aquel momento, el flujo de gestión de productos RF-INV-001 seguía pendiente. Actualmente está
implementado y verificado en `feature/products-warehouses`, con API, frontend, permisos y auditoría;
su integración en `develop` permanece pendiente. La migración Foundation compartida debe mantenerse
sin modificaciones durante esta feature.

En particular, `QUARANTINED`/`RELEASED`/`REJECTED`, el bloqueo de consumo o despacho y `requiresQualityInspection` se conservan como decisiones técnicas seguras, pero se mantienen marcadas como `PROPUESTO`; no son requisitos oficiales.

## Proveedores (`feature/suppliers`)

La rama `feature/suppliers` implementa `RF-COM-001` como datos maestros de Compras.

- Atributos de la Entrega 1: identificador (`code`, único y en mayúsculas), razón social (`name`),
  teléfono, correo, dirección y estado. Se añade `taxId` (RUC) previsto en `database.md` §10.
- Teléfono, correo, dirección y RUC son opcionales, como en el modelo conceptual. La primera
  versión del PR exigía el correo como identidad única; la revisión del 2026-10-08 lo corrigió
  para seguir la especificación.
- Consulta para todos los roles autenticados; gestión solo para `ADMIN` y `COMPRAS`.
- Desactivación lógica sin `DELETE`, auditoría transaccional y bloqueo de fila.

Evidencia del 2026-10-08: 30 pruebas e2e de proveedores y 17 de frontend aprobadas, junto con
las suites completas, lint, formato y build. No acredita órdenes de compra ni recepciones
(`RF-COM-002` y `RF-COM-003`), que siguen pendientes. El estado `Verified` no implica integración.

## Clientes (`feature/customers`)

La rama `feature/customers` implementa `RF-VEN-001` como datos maestros de Ventas, dentro de la
primera oleada junto con productos, almacenes y proveedores.

- Atributos de la Entrega 1: nombre (`name`, razón social), contacto (`email` y `phone`),
  dirección y estado. Se añaden `code` (identificador único en mayúsculas) y `taxId` (RUC), según
  el modelo `Customer` de `database.md` §10. Los datos de contacto son opcionales.
- Consulta para todos los roles autenticados, para que otros módulos puedan seleccionar un
  cliente; gestión solo para `ADMIN` y `VENTAS`.
- Desactivación lógica sin `DELETE`, auditoría transaccional y bloqueo de fila.

Evidencia del 2026-10-08: 30 pruebas e2e de clientes y 17 de frontend aprobadas, junto con las
suites completas, lint, formato y build. No acredita órdenes de venta ni despachos (`RF-VEN-002` y
`RF-VEN-003`), que siguen pendientes. El estado `Verified` no implica integración.

## Primera oleada: productos y almacenes

La rama `feature/products-warehouses` implementa la gestión de datos maestros
de Inventario.

### Alcance verificado

- Productos: código, nombre, categoría, unidad, tipo y estado; creación,
  listado, detalle, edición y activación/desactivación.
- Tipos de producto: materia prima, producto intermedio y producto terminado;
  se conserva también el tipo consumible del modelo existente.
- Almacenes: código, nombre, ubicación y estado; creación, consulta, edición
  y activación/desactivación.
- Consulta para todos los roles autenticados y modificación únicamente para
  ADMIN e INVENTARIO, con autorización validada en backend.
- Validaciones, paginación, estados de carga, errores y confirmaciones en
  las interfaces.
- Filtros por estado, tipo y búsqueda en Productos; por estado y búsqueda en Almacenes.
  El total se calcula con los filtros; la interfaz reinicia la página al cambiarlos.
- Códigos de producto normalizados a mayúsculas al crear y editar.
- Protección de unidad y tipo cuando hay movimientos, incluso con saldo actual cero.
- Desactivación rechazada con `409` si hay cualquier saldo distinto de cero.
- PATCH de edición limitado a los campos modificados y guardado deshabilitado sin cambios.
- Pruebas de concurrencia para altas y cambios de estado de ambos catálogos.
- Desactivación lógica, conservando los registros y sus relaciones.
- Auditoría de creación, cambios de datos y estado dentro de la misma
  transacción que modifica el recurso. Se usan las acciones CREATE, UPDATE,
  ENABLE y DISABLE con las entidades PRODUCT y WAREHOUSE.

### Evidencia automatizada

Como evidencia histórica, el 2026-10-07 se reportaron 105 pruebas e2e del backend en
9 archivos y 62 del frontend en 4 archivos. Entre ellas había 25 e2e de productos,
29 de almacenes, 16 pruebas de la pantalla de Productos y 17 de Almacenes.

Después de las correcciones del PR #6, los resultados locales reportados el 2026-10-09
para el código del commit `34e3eb2` son:

- Backend unitario: 72 pruebas aprobadas en 5 archivos.
- Suite completa e2e del backend: 165 pruebas aprobadas en 14 archivos, ejecutadas
  contra `ecosoap_inventory_test`.
- Suite completa del frontend: 86 pruebas aprobadas en 5 archivos.
- `pnpm lint` y `pnpm build`: aprobados para esa versión de código.
- `pnpm format:check`: aprobado también después de copiar las actualizaciones de
  documentación; toda edición posterior se comprueba de nuevo antes del commit.
- Total: 323 pruebas aprobadas.

Cobertura específica incluida en esos totales:

- Productos: 25 e2e de API, validación, normalización del código, permisos y auditoría.
- Almacenes: 29 e2e de API, validación, permisos y auditoría.
- Historial de productos: 7 e2e de protección de unidad y tipo, con y sin saldo actual.
- Reglas de existencias: 6 e2e de desactivación e historial.
- Concurrencia: 6 e2e de altas y cambios de estado en ambos catálogos.
- Filtros backend: 23 e2e de Productos y 18 de Almacenes, con valores inválidos y total filtrado.
- Pantallas: 18 pruebas de Productos y 19 de Almacenes, incluido el PATCH parcial.
- Filtros frontend: 20 pruebas de parámetros, cambios de página, combinación y limpieza.

Los subconjuntos están incluidos en los totales de cada suite; no se suman nuevamente.
Las pruebas del frontend simulan HTTP y ejercitan las páginas, formularios, hooks y caché
reales. Los e2e del backend comprueban los endpoints con autenticación, permisos,
persistencia y auditoría, incluida la reversión cuando falla el registro de auditoría.

Los filtros y la paginación contribuyen a RNF-003, pero estas pruebas no acreditan
el objetivo de respuesta en menos de 3 segundos ni el rendimiento con grandes volúmenes.
Esas mediciones siguen pendientes.

La API está documentada en `docs/api.md`, sección 9, y mediante los decoradores Swagger
de los controladores y DTO. La actualización de la evidencia local no implica que los
checks remotos hayan pasado ni que la feature esté integrada.

### Evidencia manual del 2026-10-09

El responsable confirmó el funcionamiento de los filtros de ambas pantallas: estado,
búsqueda, combinación y limpieza, además de tipo en Productos. También confirmó el
PATCH contra la API real: editar solo el nombre de un producto envía únicamente `name`,
y editar solo la ubicación de un almacén envía únicamente `location`.

Las capturas de Swagger muestran `page`, `limit`, `isActive`, `type` y `search` para
Productos; `page`, `limit`, `isActive` y `search` para Almacenes. Esta evidencia acredita
la visualización de los parámetros; los endpoints y sus reglas se ejercitan en los e2e.

### Límites y cierre pendiente

Esta evidencia verifica RF-INV-001 y la administración de almacenes.
No acredita los flujos de movimientos, ajustes manuales de stock, compras,
producción, BOM, ventas ni despachos, que permanecen fuera del alcance de
esta rama. La infraestructura histórica de Foundation no supone que esos
flujos estén implementados.

Proveedores y clientes corresponden a las otras features de la primera oleada:
`feature/suppliers` y `feature/customers`.

El avance y las comprobaciones se registran en `docs/progress.md`. El
[PR #6](https://github.com/Luigui789/Manufactura/pull/6) está integrado en `develop`
(merge `332e499`), después de aprobación y CI. La
[CI posterior al merge](https://github.com/Luigui789/Manufactura/actions/runs/38015405667)
aprobó 331 pruebas, incluidos ocho casos nuevos de concurrencia entre catálogos y ajustes.
