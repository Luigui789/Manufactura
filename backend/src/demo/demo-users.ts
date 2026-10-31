import { AuditEntityType } from '../generated/prisma/client.js';
import { DEMO_USERS } from './demo-data.js';
import { recordCreate, drift, type SeedStats, type Tx } from './demo-context.js';

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
      if (existing.role.code !== spec.role)
        drift('User ' + spec.email, `rol ${existing.role.code}, se esperaba ${spec.role}`);
      if (!existing.isActive) drift('User ' + spec.email, 'la cuenta está inactiva');
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
