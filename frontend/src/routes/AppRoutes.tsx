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

const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((module) => ({ default: module.UsersPage })),
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
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
