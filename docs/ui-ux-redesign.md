# EcoSoap ERP — rediseño UI/UX

## Base y alcance

Base auditada: `7a956e9f467ed3857216f254ad5d80989949df1d`, último `origin/develop` al preparar `feature/ui-ux-redesign`. Worktree inicial limpio. Sin cambios de backend, Prisma, contratos, permisos ni reglas empresariales. No incluye Ventas/Despacho.

## Auditoría previa a la implementación

Se leyeron todas las rutas reales, sus formularios, diálogos y pruebas. Calidad y trazabilidad viven dentro del detalle de lote y de la orden completada; no tienen rutas independientes.

| Área                                     | Problemas observados                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell, navegación, Inicio y rutas        | Menú plano de 160 px, activo solo exacto, sin drawer móvil ni salto al contenido. Inicio sin accesos ni explicación del flujo. Ancho máximo insuficiente para tablas.  |
| Login y contraseña                       | Marca y formulario con jerarquía débil, reglas de contraseña sin asociación accesible, campos editables durante envío.                                                 |
| Usuarios                                 | Acciones propias deshabilitadas sin explicación, tabla sin nombre, paginación y avisos inconsistentes.                                                                 |
| Productos y almacenes                    | Encabezados repetidos, formularios largos sin secciones, calidad/lotes poco explicados, vacío sin orientación.                                                         |
| Proveedores y clientes                   | Patrones equivalentes duplicados; contacto opcional poco evidente; tablas demasiado anchas y confirmaciones genéricas. API solo paginada: no inventar búsqueda global. |
| Compra: lista, alta, detalle y recepción | Cards difíciles de comparar, acciones compiten, estado plano, recepción sin contexto ni feedback explícito. Pickers confunden resultados con selección.                |
| Existencias, movimientos, lotes y ajuste | Enums visibles, filtros por UUID, cantidades sin alineación, REC sin enlace, diálogos manuales sin foco/Escape, selectores truncados a primera página.                 |
| Fórmulas, versiones y componentes        | Alta inline mezclada con lista; producto elegido parece otro resultado; paginación de una sola página; edición y consulta sin separación, componentes en párrafos.     |
| Órdenes, ejecución y lotes de producción | Resumen plano, siguiente acción poco evidente, materiales y asignaciones mezclados, errores alejados y unidades técnicas.                                              |
| Calidad y trazabilidad                   | Confirmación genérica, rechazo sin ayuda anticipada; árbol multinivel aplanado en cards, sin relación visible entre consumos y orígenes.                               |
| Compartido                               | Sin PageHeader/estados/paginación comunes. Faltan ayudas asociadas, contraste/foco uniforme, targets y límites de altura en diálogos.                                  |

## Principios y patrones

Geist, superficies blancas, texto casi negro, bordes suaves y acción principal negra. Color semántico discreto acompañado de texto. Sidebar agrupada: General, Operaciones, Inventario, Maestros, Administración; visibilidad según RBAC existente. Subrutas conservan el módulo activo.

Patrones pequeños: encabezado y breadcrumbs, estado empresarial traducido, skeleton ligero, vacío orientado, panel de selección explícita, paginación del servidor y secciones de formulario. Las tablas conservan todas las columnas mediante scroll horizontal. Los diálogos usan Radix con foco atrapado, Escape y retorno al disparador.

## Invariantes de revisión

- Confirmar compra no afecta existencias; registrar recepción sí.
- START valida disponibilidad sin reservar; COMPLETE consume según plan y produce la cantidad real permitida.
- Ajustes exclusivamente ADJUSTMENT_IN / ADJUSTMENT_OUT; cantidades decimales como strings, sin Number para lógica.
- Tipos de producto, versiones históricas, `updatedAt`, invalidaciones Query y RBAC preservados.
- DATE usa `formatCalendarDate`; planificación e instantes conservan hora Managua y precisión contractual.
- Sin nuevos endpoints, estados, rutas públicas, dependencias ni métricas ficticias.

## Validación

Pendiente de completar tras implementación: suites frontend/backend/E2E, lint, formato, build, Docker y recorrido visual responsive (1440, 1280, 1024, 768 y 390 px). No declarar la rama lista sin registrar evidencia y pendientes reales.
