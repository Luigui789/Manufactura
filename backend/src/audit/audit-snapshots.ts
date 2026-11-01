import type { RoleCode } from '../generated/prisma/client.js';

/**
 * Lista PERMITIDA de campos auditables de User (audit.md §5).
 *
 * Lo que no figura aquí no puede llegar a un snapshot: passwordHash, la
 * contraseña temporal y tokenVersion quedan fuera aunque sean justamente lo que
 * cambió. El rol se registra como código, nunca como UUID.
 */
export const USER_AUDIT_FIELDS = [
  'email',
  'fullName',
  'role',
  'isActive',
  'mustChangePassword',
] as const;

export type UserAuditSnapshot = {
  email: string;
  fullName: string;
  role: RoleCode;
  isActive: boolean;
  mustChangePassword: boolean;
};

/** Copia solo los campos permitidos, ignorando cualquier otro que traiga la entrada. */
export function userSnapshot(source: UserAuditSnapshot): UserAuditSnapshot {
  const snapshot = {} as Record<string, unknown>;
  for (const field of USER_AUDIT_FIELDS) {
    snapshot[field] = source[field];
  }
  return snapshot as UserAuditSnapshot;
}

export type SnapshotDiff = {
  previousValues: Record<string, unknown> | undefined;
  newValues: Record<string, unknown> | undefined;
};

/**
 * Diferencia mínima entre dos estados de User: solo los campos permitidos que
 * cambiaron. Si nada cambió, ambos lados quedan sin valor.
 */
export function diffUserSnapshots(
  before: UserAuditSnapshot,
  after: UserAuditSnapshot,
): SnapshotDiff {
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const field of USER_AUDIT_FIELDS) {
    if (before[field] !== after[field]) {
      previousValues[field] = before[field];
      newValues[field] = after[field];
    }
  }
  const changed = Object.keys(newValues).length > 0;
  return {
    previousValues: changed ? previousValues : undefined,
    newValues: changed ? newValues : undefined,
  };
}
