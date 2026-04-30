/**
 * App.tsx — Root router.
 *
 * Routes:
 *   /                     Dashboard (admin home)
 *   /employees            Employee list
 *   /employee/:id         Employee profile (with live RecognitionBanner)
 *   /manager              Manager team dashboard (CC component library)
 *   /storybook            Component storybook (dev reference)
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CCLayout } from './components/CCLayout/CCLayout';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesListPage } from './pages/EmployeesListPage';
import { EmployeeProfilePage } from './pages/EmployeeProfilePage';
import { ManagerDashboardPage } from './pages/ManagerDashboardPage';
import { StorybookPage } from './pages/StorybookPage';
import { SSOTestPage } from './pages/SSOTestPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Storybook lives outside the CC chrome */}
        <Route path="/storybook" element={<StorybookPage />} />

        {/* All main pages share the CC layout shell */}
        <Route path="/" element={<CCLayout><DashboardPage /></CCLayout>} />
        <Route path="/employees" element={<CCLayout><EmployeesListPage /></CCLayout>} />
        <Route path="/employee/:id" element={<CCLayout><EmployeeProfilePage /></CCLayout>} />
        <Route path="/manager" element={<CCLayout><ManagerDashboardPage /></CCLayout>} />
        <Route path="/sso-test" element={<SSOTestPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
