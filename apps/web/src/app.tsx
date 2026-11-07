import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { Layout } from './components/Layout.tsx';
import { RequireAuth } from './components/RequireAuth.tsx';
import { setUnauthorizedHandler } from './lib/api-client.ts';
import { routes, publicRoutes } from './routes.tsx';

function UnauthorizedRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const path = window.location.pathname;
      if (!publicRoutes.some((r) => r.path === path)) void navigate('/login', { replace: true });
    });
  }, [navigate]);
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      {publicRoutes.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <UnauthorizedRedirect />
      <AppRoutes />
    </BrowserRouter>
  );
}
