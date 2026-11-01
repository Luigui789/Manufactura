import type { CookieOptions } from 'express';

/** Nombre de la cookie de sesión (ADR 008). */
export const SESSION_COOKIE = 'ecosoap_session';

/** Duración de la sesión: una jornada, sin renovación. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * Atributos aprobados: HttpOnly, SameSite=Strict, Path=/ y Secure en
 * producción. Sin Domain, para que la cookie quede ligada al host exacto.
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: isProduction,
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

/** Mismos atributos sin duración, para que el navegador borre la cookie correcta. */
export function clearSessionCookieOptions(isProduction: boolean): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(isProduction);
  return options;
}
