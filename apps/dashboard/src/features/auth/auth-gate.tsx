import type { ReactElement, ReactNode } from 'react';

import { ErrorState, Spinner } from '../../components';
import { LoginScreen } from './login-screen';
import { useMe } from './use-auth';

/* Everything behind one gate: the whole dashboard is session-scoped (the
 * /dev endpoints require it), so auth is an app boundary, not a per-page
 * concern. Three states: checking (spinner), anonymous (login screen),
 * gateway-unreachable (error — distinct from "not logged in"). */
export function AuthGate({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const { data: user, isPending, isError, error, refetch } = useMe();

  if (isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Spinner label="Checking session" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <ErrorState
            title="Could not reach the gateway"
            detail={error.message}
            onRetry={() => refetch()}
          />
        </div>
      </main>
    );
  }

  if (!user) return <LoginScreen />;

  return children as ReactElement;
}
