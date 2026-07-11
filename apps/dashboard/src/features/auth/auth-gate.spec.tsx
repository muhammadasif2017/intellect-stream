import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthGate } from './auth-gate';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderGate() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthGate>
        <p>the app</p>
      </AuthGate>
    </QueryClientProvider>,
  );
}

describe('AuthGate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders children when the session is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { id: 'u1', email: 'dev@local' }),
      ),
    );
    renderGate();
    expect(await screen.findByText('the app')).toBeTruthy();
  });

  it('shows the login screen on 401 — anonymous is not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' })),
    );
    renderGate();
    expect(
      await screen.findByRole('button', { name: 'Log in' }),
    ).toBeTruthy();
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('logs in from the login screen and enters the app', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/api/auth/me')) {
        return Promise.resolve(jsonResponse(401, {}));
      }
      if (target.includes('/api/auth/login') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(200, { id: 'u1', email: 'dev@local' }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${target}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderGate();
    await userEvent.type(await screen.findByLabelText('Email'), 'dev@local.test');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('the app')).toBeTruthy();
  });

  it('shows the server message when login fails', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes('/api/auth/me')) {
        return Promise.resolve(jsonResponse(401, {}));
      }
      return Promise.resolve(
        jsonResponse(401, { message: 'Invalid credentials' }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderGate();
    await userEvent.type(await screen.findByLabelText('Email'), 'dev@local.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Invalid credentials')).toBeTruthy();
  });
});
