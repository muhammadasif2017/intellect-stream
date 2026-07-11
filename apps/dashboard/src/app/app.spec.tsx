import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import App from './app';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(baseElement).toBeTruthy();
  });

  it('should render the dashboard title', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    expect(
      screen.getByRole('heading', { name: /IntellectStream Dashboard/i }),
    ).toBeTruthy();
  });
});
