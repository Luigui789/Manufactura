import { AuditService } from '../audit/audit.service.js';
import {
  ActorType,
  AuditAction,
  type AuditEntityType,
  type Prisma,
} from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

/** Diferencia semántica entre la base y el dataset oficial: nunca se corrige en silencio. */
export class DemoDatasetDriftError extends Error {
  readonly code = 'DEMO_DATASET_DRIFT';
  constructor(
    readonly entity: string,
    readonly detail: string,
  ) {
    super(`DEMO_DATASET_DRIFT: ${entity} — ${detail}`);
    this.name = 'DemoDatasetDriftError';
  }
}

export function drift(entity: string, detail: string): never {
  throw new DemoDatasetDriftError(entity, detail);
}

/** Compara campos esperados contra los existentes y falla con el primero distinto. */
export function assertSame(
  entity: string,
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(expected))
    if (String(actual[key]) !== String(value))
      drift(entity, `${key} es ${String(actual[key])}, se esperaba ${String(value)}`);
}

export type SeedStats = { created: Record<string, number> };

const audit = new AuditService();

/** Toda alta del dataset queda auditada como acción de sistema dentro de la transacción. */
export async function recordCreate(
  tx: Tx,
  stats: SeedStats,
  entity: AuditEntityType,
  id: string,
  newValues: Record<string, unknown>,
) {
  stats.created[entity] = (stats.created[entity] ?? 0) + 1;
  await audit.record(tx, {
    actor: { type: ActorType.SYSTEM },
    action: AuditAction.CREATE,
    entity: { type: entity, id },
    newValues: { ...newValues, source: 'ecosoap-demo-dataset-v1' },
  });
}
