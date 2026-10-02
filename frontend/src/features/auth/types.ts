export const ROLE_CODES = ['ADMIN', 'COMPRAS', 'PRODUCCION', 'INVENTARIO', 'VENTAS'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: 'Administración',
  COMPRAS: 'Compras',
  PRODUCCION: 'Producción',
  INVENTARIO: 'Inventario',
  VENTAS: 'Ventas',
};
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleCode;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
