import { Navigate, Route, Routes } from 'react-router-dom';

import { StatusPage } from '../features/status/status-page';
import { KitchenSink } from './kitchen-sink';
import { Layout } from './layout';
import { PagePlaceholder } from './page-placeholder';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/status" replace />} />
        <Route path="/status" element={<StatusPage />} />
        <Route
          path="/trigger"
          element={
            <PagePlaceholder
              title="Trigger"
              description="Log in and send a test post through the real gateway path."
              milestone="M3"
            />
          }
        />
        <Route
          path="/logs"
          element={
            <PagePlaceholder
              title="Logs"
              description="Structured logs across all services — filter or stream live."
              milestone="M4"
            />
          }
        />
        <Route
          path="/trace"
          element={
            <PagePlaceholder
              title="Trace"
              description="Follow one correlation ID through every pipeline stage."
              milestone="M5"
            />
          }
        />
        <Route
          path="/analytics"
          element={
            <PagePlaceholder
              title="Analytics"
              description="Throughput, moderation verdicts, and stage latency."
              milestone="M6"
            />
          }
        />
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
