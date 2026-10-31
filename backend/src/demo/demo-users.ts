import { AuditEntityType } from '../generated/prisma/client.js';
import { DEMO_USERS } from './demo-data.js';
import { assertSame, drift, recordCreate, type SeedStats, type Tx } from './demo-context.js';

/**
 * Crea las cinco cuentas demo con el hash recibido (PasswordHasherService). Una cuenta ya
 * existente se conserva: no se cambia su contraseña ni se reactiva en silencio.
 */
export async function ensureDemoUsers(tx: Tx, stats: SeedStats, passwordHash: string) {
  const roles = await tx.role.findMany();
  const roleId = new Map(roles.map((role) => [role.code, role.id]));
  const users = new Map<string, string>();
  for (const spec of DEMO_USERS) {
    const id = roleId.get(spec.role);
    if (!id) drift('Role ' + spec.role, 'falta el rol; ejecuta el seed Foundation');
    const existing = await tx.user.findUnique({
      where: { email: spec.email },
      include: { role: true },
    });
    if (existing) {
      // Dataset oficial: correo, rol, nombre, estado y mustChangePassword deben coincidir.
      // La contraseña de una cuenta existente se conserva: no se compara ni se sobrescribe.
      assertSame(
        'User ' + spec.email,
        {
          role: existing.role.code,
          fullName: existing.fullName,
          isActive: existing.isActive,
          mustChangePassword: existing.mustChangePassword,
        },
        { role: spec.role, fullName: spec.fullName, isActive: true, mustChangePassword: false },
      );
      users.set(spec.email, existing.id);
      continue;
    }
    // Cuentas exclusivamente locales de demostración: no exigen cambio de contraseña.
    const user = await tx.user.create({
      data: {
        email: spec.email,
        fullName: spec.fullName,
        passwordHash,
        roleId: id,
        mustChangePassword: false,
      },
    });
    await recordCreate(tx, stats, AuditEntityType.USER, user.id, {
      email: spec.email,
      fullName: spec.fullName,
      role: spec.role,
      isActive: true,
      mustChangePassword: false,
    });
    users.set(spec.email, user.id);
  }
  return users;
}
