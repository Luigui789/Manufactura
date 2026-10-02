# ADR 010 — Autorización por políticas declarativas, denegada por defecto

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Etapa:** 3 — Autenticación y RBAC
- **Diseño:** [`specs/2026-09-24-autenticacion-rbac-design.md`](../specs/2026-09-24-autenticacion-rbac-design.md),
  §2 y §7

## Contexto

RNF-002 exige control por rol. Compras, Inventario, Producción y Ventas añadirán decenas de rutas en
las etapas siguientes. Un mecanismo por módulo multiplicaría el código de seguridad, y uno que
permita el acceso por omisión deja abierta cualquier ruta cuyo decorador se olvide.

## Decisión

- Tres políticas, exactamente una por ruta: `@Public()`, sin autenticación; `@Authenticated()`,
  cualquier usuario autenticado y activo; y `@Roles(...)`, autenticación y uno de los roles
  declarados.
- Una ruta sin política se deniega con `403` y deja un error en el log.
- Una sola clave de metadatos: dos políticas en el mismo destino fallan al cargar la aplicación, y
  la del método sustituye a la de la clase.
- Guards globales, en este orden: protección de origen, autenticación, cambio de contraseña
  pendiente y autorización. Los módulos solo declaran decoradores.
- El rol se toma del usuario que se carga de la base en cada petición; nunca del token ni del
  cliente.
- `@AllowPendingPasswordChange()` marca las únicas rutas usables con un cambio de contraseña
  pendiente.
- Un rol por usuario y sin tabla de permisos.
- Una prueba de arquitectura verifica que toda ruta declara exactamente una política.

## Consecuencias

- Olvidar un decorador cierra la ruta, y el fallo aparece en la primera prueba.
- Añadir un módulo no exige escribir código de seguridad nuevo.
- Ocultar opciones en el frontend no sustituye esta autorización.
- Permisos más finos que el rol exigirán un ADR nuevo.
