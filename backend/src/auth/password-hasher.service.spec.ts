import { PasswordHasherService } from './password-hasher.service.js';

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();
  const password = 'jabón de aceite reciclado 2026';

  it('produce Argon2id con los parámetros aprobados y sin la contraseña', async () => {
    const hash = await hasher.hash(password);
    // La librería escribe los parámetros en el orden m, p, t.
    expect(hash.startsWith('$argon2id$v=19$m=19456,p=1,t=2$')).toBe(true);
    expect(hash).not.toContain(password);
  });

  it('verifica la correcta y rechaza la incorrecta', async () => {
    const hash = await hasher.hash(password);
    expect(await hasher.verify(password, hash)).toBe(true);
    expect(await hasher.verify(`${password} `, hash)).toBe(false);
  });

  it('normaliza a NFC: «ó» compuesta y descompuesta producen el mismo resultado', async () => {
    const hash = await hasher.hash(password.normalize('NFC'));
    expect(await hasher.verify(password.normalize('NFD'), hash)).toBe(true);
  });

  it('un hash mal formado devuelve false sin lanzar', async () => {
    expect(await hasher.verify(password, 'no-es-un-hash')).toBe(false);
  });

  it('la verificación ficticia siempre devuelve false', async () => {
    expect(await hasher.verifyAgainstDummy(password)).toBe(false);
  });
});
