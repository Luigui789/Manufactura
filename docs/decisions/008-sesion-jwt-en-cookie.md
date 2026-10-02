# ADR 008 — Sesión JWT en cookie `HttpOnly` con versión de sesión

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Etapa:** 3 — Autenticación y RBAC
- **Diseño:** [`specs/2026-09-24-autenticacion-rbac-design.md`](../specs/2026-09-24-autenticacion-rbac-design.md),
  §3, §4 y §10

## Contexto

RNF-002 exige credenciales individuales y control por rol. La arquitectura aprobada propone JWT
(P-AUT-001) para autenticar las peticiones de una SPA React contra una API NestJS separada. Hay que
decidir dónde vive el token, qué contiene, cuánto dura y cómo se invalida, sin convertir un ERP
académico en una plataforma de identidad.

Dos hechos condicionan la decisión. Un token accesible desde JavaScript puede exfiltrarse con un
XSS. Y un JWT puramente sin estado no puede revocarse antes de expirar: ni el logout ni la
desactivación de un usuario surtirían efecto inmediato.

## Decisión

### Transporte

- Cookie `ecosoap_session` con `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` de 8 horas y
  `Secure` en producción. El token nunca viaja en el cuerpo de una respuesta ni es accesible desde
  JavaScript.
- CORS permite solo el origen de `FRONTEND_URL`, con credenciales; nunca `*`.

### Contenido y duración

- HS256 con `JWT_SECRET`, de al menos 32 caracteres y solo en `.env`; el algoritmo se fija también
  al verificar.
- Payload propio mínimo: `sub` (usuario) y `ver` (versión de sesión). La librería añade `iat` y
  `exp`.
- Duración de 8 horas, sin refresh tokens.

### Verificación y revocación

- Cada petición autenticada carga al usuario: `isActive`, `token_version` y el rol actual de la base
  mandan siempre. El rol nunca se lee del token.
- `users.token_version` sube en el logout, la desactivación, el cambio de la contraseña propia, el
  restablecimiento por ADMIN y el cambio de rol. Un token con otra versión se rechaza.
- El logout es global para el usuario: invalida todos sus tokens vigentes.

### Protección de origen

- La versión instalada, `@nestjs/core` 12.0.4, no incluye la protección CSRF ni las cookies nativas
  que NestJS añadió en la 12.1. No se actualiza el framework para obtenerlas.
- `CrossOriginProtectionGuard` aplica una protección de origen basada en `Origin` y Fetch Metadata
  (`Sec-Fetch-Site`), alineada con el enfoque que documenta NestJS 12.1 para
  `enableCsrfProtection()`, con `trustedOrigins = [FRONTEND_URL]`. No copia la implementación
  interna del framework: su comportamiento lo garantizan las pruebas del proyecto. Las cookies se
  leen con `cookie-parser`.

## Consecuencias

- Un XSS no puede robar la credencial, aunque sí actuar mientras la página esté abierta.
- Frontend y API deben desplegarse en el mismo sitio o detrás de un mismo proxy inverso.
- Desactivar a un usuario, cambiar su rol o cerrar sesión surte efecto en la siguiente petición.
- Cada petición autenticada cuesta una consulta por clave primaria.
- Cerrar sesión en un dispositivo cierra todas las del usuario. Cerrar por dispositivo exigiría un
  ADR que sustituya a este.
- Una actualización deliberada a NestJS 12.1 o superior, que no se hace en esta etapa, permitirá
  sustituir el guard por
  `app.enableCsrfProtection({ trustedOrigins: [FRONTEND_URL] })` y `cookie-parser` por las cookies
  nativas; las pruebas del guard comprobarán que el comportamiento no cambia.
- Rotar `JWT_SECRET` invalida todas las sesiones: es el procedimiento de emergencia.
