import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { TriggerPage } from './trigger-page';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TriggerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TriggerPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it(
    'fires a post and lists its correlation id with a trace link',
    { timeout: 15_000 },
    async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({ id: 'p1', content: 'hi', status: 'pending' }),
            {
              status: 201,
              headers: {
                'Content-Type': 'application/json',
                'x-correlation-id': 'corr-123',
              },
            },
          ),
        ),
      );

      renderPage();
      await userEvent.type(screen.getByLabelText('Content'), 'hi');
      await userEvent.click(screen.getByRole('button', { name: 'Fire post' }));

      expect(await screen.findByText('corr-123')).toBeTruthy();
      const traceLink = screen.getByRole('link', { name: 'Trace' });
      expect(traceLink.getAttribute('href')).toBe(
        '/trace?correlationId=corr-123',
      );
      /* Form resets so the next test post starts clean. */
      expect(
        (screen.getByLabelText('Content') as HTMLTextAreaElement).value,
      ).toBe('');
    },
  );

  it('shows the gateway error in the form field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText('Content'), 'spam');
    await userEvent.click(screen.getByRole('button', { name: 'Fire post' }));

    expect(await screen.findByText('Too many requests')).toBeTruthy();
  });

  it('starts with an empty history state', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPage();
    expect(screen.getByText('Nothing fired yet')).toBeTruthy();
  });
});
