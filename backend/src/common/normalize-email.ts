/**
 * Forma canónica de un correo: sin espacios exteriores y en minúsculas.
 *
 * La base lo exige con CHECK (email = lower(btrim(email))), de modo que el
 * índice único de users.email ya no distingue mayúsculas. Lo usan los DTO, los
 * servicios y el comando admin:create, para que no existan dos normalizaciones.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
