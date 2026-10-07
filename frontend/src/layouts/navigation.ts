import { ROLE_CODES, type RoleCode } from '@/features/auth/types';

export const navigation: {
  to: string;
  label: string;
  roles: readonly RoleCode[];
}[] = [
  { to: '/', label: 'Inicio', roles: ROLE_CODES },
  { to: '/users', label: 'Usuarios', roles: ['ADMIN'] },
  {
    to: '/inventory/products',
    label: 'Productos',
    roles: ROLE_CODES,
  },
  {
    to: '/inventory/warehouses',
    label: 'Almacenes',
    roles: ROLE_CODES,
  },
];
