import { normalizeEmail } from '../common/normalize-email.js';
import { RoleCode } from '../generated/prisma/client.js';
import { diffUserSnapshots, userSnapshot, type UserAuditSnapshot } from './audit-snapshots.js';

const base: UserAuditSnapshot = {
  email: 'ana@example.test',
  fullName: 'Ana',
  role: RoleCode.VENTAS,
  isActive: true,
  mustChangePassword: false,
};

describe('Snapshots de auditoría de User', () => {
  it('solo copia la lista permitida aunque la entrada traiga secretos', () => {
    const tainted = {
      ...base,
      passwordHash: '$argon2id$secreto',
      tokenVersion: 3,
      temporaryPassword: 'temporal',
    } as UserAuditSnapshot;
    const snapshot = userSnapshot(tainted);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['email', 'fullName', 'isActive', 'mustChangePassword', 'role'].sort(),
    );
    expect(JSON.stringify(snapshot)).not.toContain('secreto');
  });

  it('la diferencia contiene solo los campos que cambiaron', () => {
    expect(diffUserSnapshots(base, { ...base, role: RoleCode.INVENTARIO })).toEqual({
      previousValues: { role: RoleCode.VENTAS },
      newValues: { role: RoleCode.INVENTARIO },
    });
  });

  it('sin cambios no hay snapshot', () => {
    expect(diffUserSnapshots(base, { ...base })).toEqual({
      previousValues: undefined,
      newValues: undefined,
    });
  });
});

describe('normalizeEmail', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizeEmail('  Maria.Lopez@EcoSoap.Example ')).toBe('maria.lopez@ecosoap.example');
  });
});
