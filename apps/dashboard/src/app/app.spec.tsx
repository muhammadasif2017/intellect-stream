import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('redirects the root route to /status', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Status' })).toBeTruthy();
  });

  it('renders a nav link for every surface', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const label of ['Status', 'Trigger', 'Logs', 'Trace', 'Analytics']) {
      expect(within(nav).getByRole('link', { name: label })).toBeTruthy();
    }
  });

  it.each([
    ['/trigger', 'Trigger'],
    ['/logs', 'Logs'],
    ['/trace', 'Trace'],
    ['/analytics', 'Analytics'],
  ])('renders the %s page', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
  });

  it('renders a not-found page for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeTruthy();
  });
});
