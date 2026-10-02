import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Parámetros de Argon2id aprobados en el ADR 009: una de las configuraciones
 * publicadas por OWASP. No se usan los valores por defecto de la librería
 * (64 MiB, 3 iteraciones, paralelismo 4) porque multiplican la memoria de cada
 * verificación en la ruta que un atacante puede saturar.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Único punto del backend que llama a argon2.
 *
 * Normaliza a NFC antes de calcular y de verificar: una «ñ» o una «é» escritas
 * desde teclados distintos deben producir el mismo hash. Nunca recorta espacios,
 * porque forman parte de una frase de paso.
 */
@Injectable()
export class PasswordHasherService {
  private dummyHash: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    return argon2.hash(password.normalize('NFC'), ARGON2_OPTIONS);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password.normalize('NFC'));
    } catch {
      // Un hash mal formado no debe propagar detalles al cliente.
      return false;
    }
  }

  /**
   * Verifica contra un hash ficticio cuando el correo no existe, para que el
   * tiempo de respuesta no revele qué cuentas existen. Siempre devuelve false.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('base64url'));
    await this.verify(password, await this.dummyHash);
    return false;
  }
}
