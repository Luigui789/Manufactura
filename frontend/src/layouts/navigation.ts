import { ROLE_CODES, type RoleCode } from '@/features/auth/types';

export const navigation: {
  to: string;
  label: string;
  roles: readonly RoleCode[];
}[] = [
  { to: '/', label: 'Inicio', roles: ROLE_CODES },
  { to: '/production/boms', label: 'Fórmulas', roles: ROLE_CODES },
  { to: '/purchases/orders', label: 'Compras', roles: ROLE_CODES },
  { to: '/production/orders', label: 'Producción', roles: ROLE_CODES },
  { to: '/users', label: 'Usuarios', roles: ['ADMIN'] },
  {
    to: '/sales/customers',
    label: 'Clientes',
    roles: ['ADMIN', 'VENTAS'],
  },
  {
    to: '/purchases/suppliers',
    label: 'Proveedores',
    roles: ['ADMIN', 'COMPRAS'],
  },
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
  { to: '/inventory/stock', label: 'Existencias', roles: ROLE_CODES },
  { to: '/inventory/movements', label: 'Movimientos', roles: ROLE_CODES },
  { to: '/inventory/lots', label: 'Lotes', roles: ROLE_CODES },
];
