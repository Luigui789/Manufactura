import { Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuditService } from '../audit/audit.service.js';
import { diffUserSnapshots, type UserAuditSnapshot } from '../audit/audit-snapshots.js';
import { normalizeEmail } from '../common/normalize-email.js';
import { ActorType, AuditAction, AuditEntityType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  toUserResponse,
  USER_PUBLIC_SELECT,
  type UserResponseDto,
} from '../users/user-response.js';
import type { AuthenticatedUser } from './access-policy.js';
import type { ChangePasswordDto, LoginDto } from './dto/auth.dto.js';
import type { JwtPayload } from './guards/jwt-auth.guard.js';
import { PasswordHasherService } from './password-hasher.service.js';

export type SessionResult = { user: UserResponseDto; token: string };

const INVALID_CREDENTIALS = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasherService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Siempre ejecuta exactamente una verificación Argon2id —ficticia si el correo
   * no existe, real aunque la cuenta esté inactiva— y responde lo mismo en todo
   * fallo, para no revelar qué cuentas existen ni su estado.
   */
  async login(dto: LoginDto): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
      select: { ...USER_PUBLIC_SELECT, passwordHash: true, tokenVersion: true },
    });

    if (!user) {
      await this.hasher.verifyAgainstDummy(dto.password);
      // El correo escrito no se guarda: podría contener una contraseña pegada por error.
      await this.audit.record(this.prisma, {
        actor: { type: ActorType.ANONYMOUS },
        action: AuditAction.LOGIN_FAILED,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = await this.hasher.verify(dto.password, user.passwordHash);
    if (!passwordMatches || !user.isActive) {
      // LOGIN_FAILED va fuera de transacción: debe persistir porque el intento fracasó.
      await this.audit.record(this.prisma, {
        actor: { type: ActorType.ANONYMOUS },
        action: AuditAction.LOGIN_FAILED,
        entity: { type: AuditEntityType.USER, id: user.id },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // La fila LOGIN se escribe antes de emitir el token: sin auditoría no hay sesión.
    await this.audit.record(this.prisma, {
      actor: { type: ActorType.USER, userId: user.id },
      action: AuditAction.LOGIN,
      entity: { type: AuditEntityType.USER, id: user.id },
    });

    return {
      user: toUserResponse(user),
      token: await this.signSession(user.id, user.tokenVersion),
    };
  }

  async me(actor: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: USER_PUBLIC_SELECT,
    });
    return toUserResponse(user);
  }

  /** Logout global: invalida todos los tokens vigentes del usuario (ADR 008). */
  async logout(actor: AuthenticatedUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.id },
        data: { tokenVersion: { increment: 1 } },
      });
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.LOGOUT,
        entity: { type: AuditEntityType.USER, id: actor.id },
      });
    });
  }

  /**
   * Cambia la contraseña propia: exige la actual, rechaza una nueva igual, deja
   * mustChangePassword en false e invalida las demás sesiones. La sesión actual
   * recibe un token nuevo con la versión incrementada.
   */
  async changePassword(actor: AuthenticatedUser, dto: ChangePasswordDto): Promise<SessionResult> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!(await this.hasher.verify(dto.currentPassword, current.passwordHash))) {
      throw new UnprocessableEntityException('La contraseña actual no es correcta');
    }
    if (dto.newPassword === dto.currentPassword.normalize('NFC')) {
      throw new UnprocessableEntityException('La nueva contraseña debe ser distinta de la actual');
    }
    const passwordHash = await this.hasher.hash(dto.newPassword);

    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: USER_PUBLIC_SELECT,
      });
      const after = await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
        select: { ...USER_PUBLIC_SELECT, tokenVersion: true },
      });
      await this.audit.record(tx, {
        actor: { type: ActorType.USER, userId: actor.id },
        action: AuditAction.CHANGE_PASSWORD,
        entity: { type: AuditEntityType.USER, id: actor.id },
        ...diffUserSnapshots(snapshotOf(before), snapshotOf(after)),
      });
      return after;
    });

    return {
      user: toUserResponse(updated),
      token: await this.signSession(updated.id, updated.tokenVersion),
    };
  }

  private signSession(userId: string, tokenVersion: number): Promise<string> {
    const payload: JwtPayload = { sub: userId, ver: tokenVersion };
    return this.jwt.signAsync(payload);
  }
}

export function snapshotOf(user: {
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  role: { code: UserAuditSnapshot['role'] };
}): UserAuditSnapshot {
  return {
    email: user.email,
    fullName: user.fullName,
    role: user.role.code,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}
