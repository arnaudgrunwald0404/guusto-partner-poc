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
import { AdminPage } from './pages/AdminPage';
import { StorybookPage } from './pages/StorybookPage';
import { SSOTestPage } from './pages/SSOTestPage';
import { FrontlinePage } from './pages/FrontlinePage';
import { RecognitionDetailPage } from './pages/RecognitionDetailPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages — no auth, no CC chrome */}
        <Route path="/storybook" element={<StorybookPage />} />
        <Route path="/r/:id" element={<FrontlinePage />} />

        {/* All main pages share the CC layout shell */}
        <Route path="/" element={<CCLayout><DashboardPage /></CCLayout>} />
        <Route path="/employees" element={<CCLayout><EmployeesListPage /></CCLayout>} />
        <Route path="/employee/:id" element={<CCLayout><EmployeeProfilePage /></CCLayout>} />
        <Route path="/manager" element={<CCLayout><ManagerDashboardPage /></CCLayout>} />
        <Route path="/admin/rr" element={<CCLayout><AdminPage /></CCLayout>} />
        <Route path="/recognition/:id" element={<CCLayout><RecognitionDetailPage /></CCLayout>} />
        <Route path="/sso-test" element={<SSOTestPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
