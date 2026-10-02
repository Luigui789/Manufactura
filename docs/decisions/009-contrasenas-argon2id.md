# ADR 009 — Argon2id, política por longitud y contraseñas temporales de un solo uso

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Etapa:** 3 — Autenticación y RBAC
- **Diseño:** [`specs/2026-09-24-autenticacion-rbac-design.md`](../specs/2026-09-24-autenticacion-rbac-design.md),
  §5, §6 y §12

## Contexto

RNF-002 prohíbe guardar contraseñas en texto plano. Hay que elegir un algoritmo mantenido, que
funcione en Windows con pnpm 10 y Node 22, y una política que el equipo pueda defender.

Además, en este ERP el administrador crea las cuentas. Sin una medida adicional conocería la
contraseña de cada usuario, y un `AuditLog` que atribuye una acción a X no probaría que X actuó.

## Decisión

### Algoritmo

- Argon2id con la librería `argon2` 0.45.1: 19 MiB de memoria, 2 iteraciones y paralelismo 1, una
  de las configuraciones publicadas por OWASP. El hash se guarda como cadena PHC con sus
  parámetros.
- Normalización NFC antes de calcular y de verificar; nunca se recortan espacios.
- Un único servicio, `PasswordHasherService`, llama a la librería.
- Si la librería no funciona en el entorno del equipo, el trabajo se detiene y se reporta. No hay
  cambio automático a otro algoritmo.

Se descartan bcrypt y bcryptjs, que truncan a 72 bytes; scrypt de `node:crypto`, que obligaría a
definir un formato de almacenamiento propio; y Argon2 de `node:crypto`, que no existe en Node 22.

### Política

- De 15 a 128 caracteres, sin reglas de composición, con espacios y acentos permitidos y sin
  caducidad periódica.
- Alineada parcialmente con NIST SP 800-63B-4. **No se afirma cumplimiento:** no se compara con
  listas de contraseñas comunes o comprometidas.
- El backend la aplica; el frontend la repite para ayudar al usuario.

### Contraseñas temporales

- El alta y el restablecimiento por ADMIN dejan una contraseña temporal y
  `users.must_change_password = true`; el restablecimiento también incrementa `token_version`.
- Mientras el cambio está pendiente, el backend solo permite `me`, `change-password` y `logout`.
- El cambio propio exige la contraseña actual, rechaza una nueva igual y deja
  `must_change_password = false`.
- El primer ADMIN, creado por comando con una contraseña que elige quien lo ejecuta, no queda
  obligado a cambiarla. El comando solo sirve como bootstrap: falla si ya existe un ADMIN activo o
  el correo, y nunca modifica un usuario existente.

## Consecuencias

- Resistencia a ataques con GPU a cambio de unos 19 MiB por verificación; el límite de intentos
  acota la carga.
- Dependencia nativa con binario precompilado: su instalación se comprueba en Windows antes de
  usarla.
- Una contraseña temporal no puede convertirse en permanente, y el administrador no conserva
  credenciales ajenas utilizables.
- Queda pendiente la comparación con contraseñas comprometidas.
- Subir los parámetros más adelante no exige migración: basta recalcular el hash en el siguiente
  login.
