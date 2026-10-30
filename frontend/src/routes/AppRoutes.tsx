import { LoadingState } from '@/components/erp';
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
const SalesOrdersPage = lazy(() =>
  import('@/features/sales/orders/pages/SalesOrdersPage').then((m) => ({
    default: m.SalesOrdersPage,
  })),
);
const NewSaleOrderPage = lazy(() =>
  import('@/features/sales/orders/pages/NewSaleOrderPage').then((m) => ({
    default: m.NewSaleOrderPage,
  })),
);
const SaleOrderDetailPage = lazy(() =>
  import('@/features/sales/orders/pages/SaleOrderDetailPage').then((m) => ({
    default: m.SaleOrderDetailPage,
  })),
);
const PurchaseOrdersPage = lazy(() =>
  import('@/features/purchases/pages/PurchaseOrdersPage').then((m) => ({
    default: m.PurchaseOrdersPage,
  })),
);
const NewPurchaseOrderPage = lazy(() =>
  import('@/features/purchases/pages/NewPurchaseOrderPage').then((m) => ({
    default: m.NewPurchaseOrderPage,
  })),
);
const PurchaseOrderDetailPage = lazy(() =>
  import('@/features/purchases/pages/PurchaseOrderDetailPage').then((m) => ({
    default: m.PurchaseOrderDetailPage,
  })),
);
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
const IiotDashboardPage = lazy(() =>
  import('@/features/iiot/pages/IiotDashboardPage').then((module) => ({
    default: module.IiotDashboardPage,
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

const StockPage = lazy(() =>
  import('@/features/inventory/pages/StockPage').then((m) => ({ default: m.StockPage })),
);
const MovementsPage = lazy(() =>
  import('@/features/inventory/pages/MovementsPage').then((m) => ({ default: m.MovementsPage })),
);
const LotsPage = lazy(() =>
  import('@/features/inventory/pages/LotsPage').then((m) => ({ default: m.LotsPage })),
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
                  <Suspense fallback={<LoadingState label="Cargando usuarios…" />}>
                    <UsersPage />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/sales/orders"
              element={
                <Suspense fallback={<LoadingState label="Cargando órdenes de venta…" />}>
                  <SalesOrdersPage />
                </Suspense>
              }
            />
            <Route
              path="/sales/orders/:id"
              element={
                <Suspense fallback={<LoadingState label="Cargando orden de venta…" />}>
                  <SaleOrderDetailPage />
                </Suspense>
              }
            />
            <Route element={<RequireRole roles={['ADMIN', 'VENTAS']} />}>
              <Route
                path="/sales/orders/new"
                element={
                  <Suspense fallback={<LoadingState label="Cargando formulario…" />}>
                    <NewSaleOrderPage />
                  </Suspense>
                }
              />
              <Route path="/sales/customers" element={<CustomersPage />} />
            </Route>
            <Route element={<RequireRole roles={['ADMIN', 'COMPRAS']} />}>
              <Route
                path="/purchases/orders/new"
                element={
                  <Suspense fallback={<LoadingState label="Cargando formulario…" />}>
                    <NewPurchaseOrderPage />
                  </Suspense>
                }
              />
              <Route path="/purchases/suppliers" element={<SuppliersPage />} />
            </Route>

            <Route
              path="/inventory/products"
              element={
                <Suspense fallback={<LoadingState label="Cargando productos…" />}>
                  <ProductsPage />
                </Suspense>
              }
            />

            <Route
              path="/inventory/warehouses"
              element={
                <Suspense fallback={<LoadingState label="Cargando almacenes…" />}>
                  <WarehousesPage />
                </Suspense>
              }
            />

            <Route
              path="/inventory/stock"
              element={
                <Suspense fallback={<LoadingState label="Cargando existencias…" />}>
                  <StockPage />
                </Suspense>
              }
            />
            <Route
              path="/inventory/movements"
              element={
                <Suspense fallback={<LoadingState label="Cargando movimientos…" />}>
                  <MovementsPage />
                </Suspense>
              }
            />
            <Route
              path="/inventory/lots"
              element={
                <Suspense fallback={<LoadingState label="Cargando lotes…" />}>
                  <LotsPage />
                </Suspense>
              }
            />
            <Route
              path="/purchases/orders"
              element={
                <Suspense fallback={<LoadingState label="Cargando compras…" />}>
                  <PurchaseOrdersPage />
                </Suspense>
              }
            />
            <Route
              path="/purchases/orders/:id"
              element={
                <Suspense fallback={<LoadingState label="Cargando orden…" />}>
                  <PurchaseOrderDetailPage />
                </Suspense>
              }
            />
            <Route
              path="/production/orders"
              element={
                <Suspense fallback={<LoadingState label="Cargando producción…" />}>
                  <OrdersPage />
                </Suspense>
              }
            />
            <Route element={<RequireRole roles={['ADMIN', 'PRODUCCION']} />}>
              <Route
                path="/production/orders/new"
                element={
                  <Suspense fallback={<LoadingState label="Cargando formulario…" />}>
                    <NewOrderPage />
                  </Suspense>
                }
              />
            </Route>
            <Route
              path="/production/orders/:id"
              element={
                <Suspense fallback={<LoadingState label="Cargando orden…" />}>
                  <OrderDetailPage />
                </Suspense>
              }
            />
            <Route
              path="/production/orders/:id/iiot"
              element={
                <Suspense fallback={<LoadingState label="Cargando monitoreo IIoT…" />}>
                  <IiotDashboardPage />
                </Suspense>
              }
            />
            <Route
              path="/production/boms"
              element={
                <Suspense fallback={<LoadingState label="Cargando fórmulas…" />}>
                  <BomsPage />
                </Suspense>
              }
            />
            <Route
              path="/production/boms/:id"
              element={
                <Suspense fallback={<LoadingState label="Cargando fórmula…" />}>
                  <BomDetailPage />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
