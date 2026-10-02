import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/access-policy.js';
import { snapshotOf } from '../auth/auth.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { AuditService, type AuditActor } from '../audit/audit.service.js';
import { diffUserSnapshots, userSnapshot } from '../audit/audit-snapshots.js';
import type { Paginated } from '../common/pagination/pagination.js';
import {
  ActorType,
  AuditAction,
  AuditEntityType,
  Prisma,
  RoleCode,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangeRoleDto, CreateUserDto, ResetPasswordDto } from './dto/users.dto.js';
import {
  toUserResponse,
  USER_PUBLIC_SELECT,
  type UserPublicRecord,
  type UserResponseDto,
} from './user-response.js';

type Tx = Prisma.TransactionClient;

export type InitialAdminInput = { email: string; fullName: string; password: string };

/** El comando admin:create se niega a actuar; el mensaje es apto para mostrarse. */
export class BootstrapRefusedError extends Error {}

const LAST_ADMIN_MESSAGE = 'Debe existir al menos un administrador activo';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly audit: AuditService,
  ) {}

  async list(page: number, limit: number): Promise<Paginated<UserResponseDto>> {
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: USER_PUBLIC_SELECT,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);
    return { data: users.map(toUserResponse), meta: { page, limit, total } };
  }

  async get(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_PUBLIC_SELECT });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return toUserResponse(user);
  }

  /** Alta por ADMIN con contraseña temporal: el usuario queda obligado a cambiarla. */
  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<UserResponseDto> {
    const passwordHash = await this.hasher.hash(dto.temporaryPassword);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.role === RoleCode.ADMIN) {
          await lockAdminRole(tx);
        }
        const created = await this.insertUser(tx, {
          email: dto.email,
          fullName: dto.fullName,
          role: dto.role,
          passwordHash,
          mustChangePassword: true,
        });
        await this.recordCreate(tx, { type: ActorType.USER, userId: actor.id }, created);
        return toUserResponse(created);
      });
    } catch (error) {
      throw translateUniqueEmail(error);
    }
  }

  async enable(actor: AuthenticatedUser, id: string): Promise<UserResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      if (before.isActive) {
        throw new ConflictException('El usuario ya está activo');
      }
      if (before.role.code === RoleCode.ADMIN) {
        await lockAdminRole(tx);
      }
      const after = await tx.user.update({
        where: { id },
        data: { isActive: true },
        select: USER_PUBLIC_SELECT,
      });
      await this.recordChange(tx, actor, AuditAction.ENABLE, before, after);
      return toUserResponse(after);
    });
  }

  async disable(actor: AuthenticatedUser, id: string): Promise<UserResponseDto> {
    assertNotSelf(actor, id, 'No puedes desactivar tu propia cuenta');
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      if (!before.isActive) {
        throw new ConflictException('El usuario ya está inactivo');
      }
      if (before.role.code === RoleCode.ADMIN) {
        await lockAdminRole(tx);
        await assertNotLastActiveAdmin(tx);
      }
      const after = await tx.user.update({
        where: { id },
        data: { isActive: false, tokenVersion: { increment: 1 } },
        select: USER_PUBLIC_SELECT,
      });
      await this.recordChange(tx, actor, AuditAction.DISABLE, before, after);
      return toUserResponse(after);
    });
  }

  async changeRole(
    actor: AuthenticatedUser,
    id: string,
    dto: ChangeRoleDto,
  ): Promise<UserResponseDto> {
    assertNotSelf(actor, id, 'No puedes cambiar tu propio rol');
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      if (before.role.code === dto.role) {
        throw new ConflictException('El usuario ya tiene ese rol');
      }
      const wasAdmin = before.role.code === RoleCode.ADMIN;
      if (wasAdmin || dto.role === RoleCode.ADMIN) {
        await lockAdminRole(tx);
        if (wasAdmin && before.isActive) {
          await assertNotLastActiveAdmin(tx);
        }
      }
      const after = await tx.user.update({
        where: { id },
        data: {
          role: { connect: { code: dto.role } },
          tokenVersion: { increment: 1 },
        },
        select: USER_PUBLIC_SELECT,
      });
      await this.recordChange(tx, actor, AuditAction.CHANGE_ROLE, before, after);
      return toUserResponse(after);
    });
  }

  /** Deja una contraseña temporal, obliga a cambiarla e invalida las sesiones del usuario. */
  async resetPassword(
    actor: AuthenticatedUser,
    id: string,
    dto: ResetPasswordDto,
  ): Promise<UserResponseDto> {
    // Un ADMIN cambia su contraseña con change-password, aportando la actual.
    assertNotSelf(actor, id, 'Para cambiar tu propia contraseña usa el cambio de contraseña');
    const passwordHash = await this.hasher.hash(dto.temporaryPassword);
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      const after = await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } },
        select: USER_PUBLIC_SELECT,
      });
      await this.recordChange(tx, actor, AuditAction.RESET_PASSWORD, before, after);
      return toUserResponse(after);
    });
  }

  /**
   * Alta del primer administrador, solo como bootstrap (ADR 009). Falla si ya
   * existe algún ADMIN activo o si el correo existe; nunca modifica un usuario.
   */
  async createInitialAdmin(input: InitialAdminInput): Promise<UserResponseDto> {
    const passwordHash = await this.hasher.hash(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockAdminRole(tx);
        const activeAdmins = await countActiveAdmins(tx);
        if (activeAdmins > 0) {
          throw new BootstrapRefusedError(
            'Ya existe un administrador activo. admin:create solo crea el primero; los demás ' +
              'administradores se crean desde el ERP por un ADMIN autenticado.',
          );
        }
        const existing = await tx.user.findUnique({ where: { email: input.email } });
        if (existing) {
          throw new BootstrapRefusedError('El usuario ya existe; no se modifica.');
        }
        const created = await this.insertUser(tx, {
          email: input.email,
          fullName: input.fullName,
          role: RoleCode.ADMIN,
          passwordHash,
          mustChangePassword: false,
        });
        await this.recordCreate(tx, { type: ActorType.SYSTEM }, created);
        return toUserResponse(created);
      });
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        throw new BootstrapRefusedError('El usuario ya existe; no se modifica.');
      }
      throw error;
    }
  }

  private insertUser(
    tx: Tx,
    data: {
      email: string;
      fullName: string;
      role: RoleCode;
      passwordHash: string;
      mustChangePassword: boolean;
    },
  ): Promise<UserPublicRecord> {
    return tx.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
        role: { connect: { code: data.role } },
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  private recordCreate(tx: Tx, actor: AuditActor, created: UserPublicRecord): Promise<void> {
    return this.audit.record(tx, {
      actor,
      action: AuditAction.CREATE,
      entity: { type: AuditEntityType.USER, id: created.id },
      newValues: userSnapshot(snapshotOf(created)),
    });
  }

  private recordChange(
    tx: Tx,
    actor: AuthenticatedUser,
    action: AuditAction,
    before: UserPublicRecord,
    after: UserPublicRecord,
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: { type: ActorType.USER, userId: actor.id },
      action,
      entity: { type: AuditEntityType.USER, id: after.id },
      ...diffUserSnapshots(snapshotOf(before), snapshotOf(after)),
    });
  }
}

/*
 * Protocolo del último ADMIN (spec §9). Se usa solo cuando la operación puede
 * alterar el conjunto de ADMIN activos. El orden es siempre: fila del objetivo
 * y después fila del rol ADMIN; quien tiene el candado del rol nunca espera por
 * otra fila de usuario, así que no hay interbloqueos.
 *
 * Depende de READ COMMITTED (nivel por defecto): cada sentencia toma una
 * instantánea nueva y el conteo posterior al candado ve lo que confirmó la
 * operación anterior. No elevar el aislamiento sin revisar el protocolo: en
 * REPEATABLE READ el conteo quedaría desactualizado (write skew).
 *
 * Los candados son FOR NO KEY UPDATE, no FOR UPDATE: el INSERT en audit_logs
 * comprueba su clave foránea hacia el usuario actor con FOR KEY SHARE, que
 * FOR UPDATE bloquearía. Con dos administradores actuando uno sobre el otro, eso
 * producía un interbloqueo (lo detectó la prueba U9). FOR NO KEY UPDATE sigue
 * serializando estas operaciones entre sí porque ninguna modifica claves.
 */
async function lockAdminRole(tx: Tx): Promise<void> {
  await tx.$queryRaw`SELECT id FROM roles WHERE code = 'ADMIN'::"RoleCode" FOR NO KEY UPDATE`;
}

/** Bloquea la fila del objetivo y devuelve su estado vigente; 404 si no existe. */
async function lockUser(tx: Tx, id: string): Promise<UserPublicRecord> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
  if (locked.length === 0) {
    throw new NotFoundException('Usuario no encontrado');
  }
  return tx.user.findUniqueOrThrow({ where: { id }, select: USER_PUBLIC_SELECT });
}

function countActiveAdmins(tx: Tx): Promise<number> {
  return tx.user.count({ where: { isActive: true, role: { code: RoleCode.ADMIN } } });
}

async function assertNotLastActiveAdmin(tx: Tx): Promise<void> {
  if ((await countActiveAdmins(tx)) <= 1) {
    throw new ConflictException(LAST_ADMIN_MESSAGE);
  }
}

function assertNotSelf(actor: AuthenticatedUser, id: string, message: string): void {
  if (actor.id === id) {
    throw new ForbiddenException(message);
  }
}

function isUniqueEmailViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function translateUniqueEmail(error: unknown): unknown {
  return isUniqueEmailViolation(error)
    ? new ConflictException('Ya existe un usuario con ese correo')
    : error;
}
