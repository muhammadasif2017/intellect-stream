import { Navigate, Route, Routes } from 'react-router-dom';

import { AnalyticsPage } from '../features/analytics/analytics-page';
import { AuthGate } from '../features/auth/auth-gate';
import { LogsPage } from '../features/logs/logs-page';
import { StatusPage } from '../features/status/status-page';
import { TracePage } from '../features/trace/trace-page';
import { TriggerPage } from '../features/trigger/trigger-page';
import { KitchenSink } from './kitchen-sink';
import { Layout } from './layout';
import { PagePlaceholder } from './page-placeholder';

export function App() {
  return (
    <AuthGate>
      <AppRoutes />
    </AuthGate>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/status" replace />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/trigger" element={<TriggerPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/trace" element={<TracePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/kitchen-sink" element={<KitchenSink />} />
        <Route
          path="*"
          element={
            <PagePlaceholder
              title="Not found"
              description="No route matches this URL."
              milestone="— check the navigation"
            />
          }
        />
      </Route>
    </Routes>
  );
}
export default App;
