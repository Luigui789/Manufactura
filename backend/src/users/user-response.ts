import { ApiProperty } from '@nestjs/swagger';

import { RoleCode } from '../generated/prisma/client.js';

/**
 * Selección de Prisma para cualquier respuesta pública de usuario. No lee el
 * hash ni la versión de sesión: lo que no se consulta no puede filtrarse.
 */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { code: true } },
} as const;

export type UserPublicRecord = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { code: RoleCode };
};

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'maria.lopez@ecosoap.example' })
  email: string;

  @ApiProperty({ example: 'María López' })
  fullName: string;

  @ApiProperty({ enum: RoleCode, example: RoleCode.INVENTARIO })
  role: RoleCode;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ description: 'true mientras el usuario tenga una contraseña temporal' })
  mustChangePassword: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/** Única conversión de User a respuesta pública: nunca passwordHash, tokenVersion ni roleId. */
export function toUserResponse(user: UserPublicRecord): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.code,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
