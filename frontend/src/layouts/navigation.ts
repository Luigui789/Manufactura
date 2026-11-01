import { ROLE_CODES, type RoleCode } from '@/features/auth/types';
import {
  Home,
  ShoppingCart,
  Store,
  Factory,
  ClipboardCheck,
  Boxes,
  PackageOpen,
  Warehouse,
  UserCog,
  Leaf,
  type LucideIcon,
} from 'lucide-react';

export type NavigationItem = {
  to: string;
  /** Short visible label. Inside a module it is read together with the module name. */
  label: string;
  roles: readonly RoleCode[];
  group: string;
  /** Module that groups the item in the sidebar (Compras, Producción…). */
  module?: string;
  icon: LucideIcon;
};

export const navigationGroups = [
  'General',
  'Operaciones',
  'Análisis',
  'Maestros',
  'Administración',
] as const;

export const navigationModules: Record<string, LucideIcon> = {
  Compras: ShoppingCart,
  Ventas: Store,
  Producción: Factory,
  Calidad: ClipboardCheck,
  Inventario: Boxes,
};

const operation = (
  module: keyof typeof navigationModules,
  to: string,
  label: string,
  roles: readonly RoleCode[] = ROLE_CODES,
): NavigationItem => ({
  to,
  label,
  roles,
  group: 'Operaciones',
  module,
  icon: navigationModules[module],
});

// Presentation only: routes, role visibility and RouteGuards are unchanged.
export const navigation: NavigationItem[] = [
  { to: '/', label: 'Inicio', roles: ROLE_CODES, group: 'General', icon: Home },
  operation('Compras', '/purchases/dashboard', 'Resumen'),
  operation('Compras', '/purchases/orders', 'Órdenes'),
  operation('Compras', '/purchases/suppliers', 'Proveedores', ['ADMIN', 'COMPRAS']),
  operation('Ventas', '/sales/dashboard', 'Resumen'),
  operation('Ventas', '/sales/orders', 'Órdenes'),
  operation('Ventas', '/sales/customers', 'Clientes', ['ADMIN', 'VENTAS']),
  operation('Producción', '/production/dashboard', 'Resumen'),
  operation('Producción', '/production/orders', 'Órdenes'),
  operation('Producción', '/production/boms', 'Fórmulas'),
  operation('Producción', '/production/routes', 'Rutas'),
  operation('Producción', '/production/structure', 'Estructura'),
  operation('Calidad', '/quality/dashboard', 'Resumen'),
  operation('Inventario', '/inventory/dashboard', 'Resumen'),
  operation('Inventario', '/inventory/stock', 'Existencias'),
  operation('Inventario', '/inventory/movements', 'Movimientos'),
  operation('Inventario', '/inventory/lots', 'Lotes'),
  {
    to: '/sustainability',
    label: 'Sostenibilidad',
    roles: ROLE_CODES,
    group: 'Análisis',
    icon: Leaf,
  },
  {
    to: '/inventory/products',
    label: 'Productos',
    roles: ROLE_CODES,
    group: 'Maestros',
    icon: PackageOpen,
  },
  {
    to: '/inventory/warehouses',
    label: 'Almacenes',
    roles: ROLE_CODES,
    group: 'Maestros',
    icon: Warehouse,
  },
  { to: '/users', label: 'Usuarios', roles: ['ADMIN'], group: 'Administración', icon: UserCog },
];

const matches = (item: NavigationItem, pathname: string) =>
  item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`);

/** Most specific navigation entry for the current path (deep links included). */
export function activeNavigation(pathname: string) {
  return navigation
    .filter((item) => matches(item, pathname))
    .sort((a, b) => b.to.length - a.to.length)[0];
}
