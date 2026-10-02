import { Injectable } from '@nestjs/common';

import { currentRequestContext } from '../common/request-context/request-context.js';
import {
  ActorType,
  AuditAction,
  type AuditEntityType,
  type Prisma,
} from '../generated/prisma/client.js';

export type AuditActor =
  | { type: typeof ActorType.USER; userId: string }
  | { type: typeof ActorType.SYSTEM }
  | { type: typeof ActorType.ANONYMOUS };

export type AuditEvent = {
  actor: AuditActor;
  action: AuditAction;
  entity?: { type: AuditEntityType; id: string };
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
};

/** Lo mínimo que necesita para escribir: el cliente de Prisma o el de una transacción. */
type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Único punto de escritura de AuditLog desde los servicios de autenticación y
 * usuarios (ADR 005).
 *
 * Recibe el cliente de la transacción en curso: si la operación se revierte, su
 * auditoría también. Comprueba la semántica actor/entidad antes de insertar para
 * dar un error claro en lugar de una violación de CHECK, y toma requestId e IP del
 * contexto de la petición. Los snapshots deben venir ya filtrados por la lista
 * permitida (audit-snapshots.ts).
 */
@Injectable()
export class AuditService {
  async record(writer: AuditWriter, event: AuditEvent): Promise<void> {
    assertValidEvent(event);
    const context = currentRequestContext();

    await writer.auditLog.create({
      data: {
        actorType: event.actor.type,
        actorUserId: event.actor.type === ActorType.USER ? event.actor.userId : null,
        action: event.action,
        entityType: event.entity?.type ?? null,
        entityId: event.entity?.id ?? null,
        previousValues: event.previousValues as Prisma.InputJsonObject | undefined,
        newValues: event.newValues as Prisma.InputJsonObject | undefined,
        requestId: context?.requestId ?? null,
        ipAddress: context?.ipAddress ?? null,
      },
    });
  }
}

function assertValidEvent(event: AuditEvent): void {
  const { actor, action, entity } = event;
  if (action === AuditAction.LOGIN_FAILED) {
    if (actor.type !== ActorType.ANONYMOUS) {
      throw new Error('LOGIN_FAILED siempre tiene actor ANONYMOUS');
    }
    return;
  }
  if (actor.type === ActorType.ANONYMOUS) {
    throw new Error(`${action} no admite actor ANONYMOUS`);
  }
  if (!entity) {
    throw new Error(`${action} exige entidad`);
  }
  if (
    action === AuditAction.LOGIN &&
    (actor.type !== ActorType.USER || actor.userId !== entity.id)
  ) {
    throw new Error('LOGIN identifica al mismo usuario como actor y entidad');
  }
}
