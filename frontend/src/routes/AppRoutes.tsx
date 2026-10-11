import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import {
  RequireAuth,
  RequirePasswordCurrent,
  RequireRole,
} from '@/features/auth/components/RouteGuards';
import { AppLayout } from '@/layouts/AppLayout';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import CustomersPage from '@/features/sales/pages/CustomersPage';
import SuppliersPage from '@/features/purchases/pages/SuppliersPage';
const BomsPage = lazy(() =>
  import('@/features/production/pages/BomsPage').then((module) => ({ default: module.BomsPage })),
);
const BomDetailPage = lazy(() =>
  import('@/features/production/pages/BomDetailPage').then((module) => ({
    default: module.BomDetailPage,
  })),
);

const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((module) => ({
    default: module.UsersPage,
  })),
);

const OrdersPage = lazy(() =>
  import('@/features/production/pages/OrdersPage').then((module) => ({
    default: module.OrdersPage,
  })),
);
const NewOrderPage = lazy(() =>
  import('@/features/production/pages/NewOrderPage').then((module) => ({
    default: module.NewOrderPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('@/features/production/pages/OrderDetailPage').then((module) => ({
    default: module.OrderDetailPage,
  })),
);

const WarehousesPage = lazy(() =>
  import('@/features/inventory/pages/WarehousesPage').then((module) => ({
    default: module.WarehousesPage,
  })),
);

const ProductsPage = lazy(() =>
  import('@/features/inventory/pages/ProductsPage').then((module) => ({
    default: module.ProductsPage,
  })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/account/password" element={<ChangePasswordPage />} />

        <Route element={<RequirePasswordCurrent />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />

            <Route element={<RequireRole roles={['ADMIN']} />}>
              <Route
                path="/users"
                element={
                  <Suspense fallback={<p role="status">Cargando usuarios…</p>}>
                    <UsersPage />
                  </Suspense>
                }
              />
            </Route>
            <Route element={<RequireRole roles={['ADMIN', 'VENTAS']} />}>
              <Route path="/sales/customers" element={<CustomersPage />} />
            </Route>
            <Route element={<RequireRole roles={['ADMIN', 'COMPRAS']} />}>
              <Route path="/purchases/suppliers" element={<SuppliersPage />} />
            </Route>

            <Route
              path="/inventory/products"
              element={
                <Suspense fallback={<p role="status">Cargando productos…</p>}>
                  <ProductsPage />
                </Suspense>
              }
            />

            <Route
              path="/inventory/warehouses"
              element={
                <Suspense fallback={<p role="status">Cargando almacenes…</p>}>
                  <WarehousesPage />
                </Suspense>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
            <Route
              path="/production/orders"
              element={
                <Suspense fallback={<p role="status">Cargando producción…</p>}>
                  <OrdersPage />
                </Suspense>
              }
            />
            <Route element={<RequireRole roles={['ADMIN', 'PRODUCCION']} />}>
              <Route
                path="/production/orders/new"
                element={
                  <Suspense fallback={<p role="status">Cargando formulario…</p>}>
                    <NewOrderPage />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/production/orders/:id"
              element={
                <Suspense fallback={<p role="status">Cargando orden…</p>}>
                  <OrderDetailPage />
                </Suspense>
              }
            />
            <Route
              path="/production/boms"
              element={
                <Suspense fallback={<p role="status">Cargando fórmulas…</p>}>
                  <BomsPage />
                </Suspense>
              }
            />
            <Route
              path="/production/boms/:id"
              element={
                <Suspense fallback={<p role="status">Cargando fórmula…</p>}>
                  <BomDetailPage />
                </Suspense>
              }
            />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
