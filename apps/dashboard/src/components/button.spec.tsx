import { render, screen } from '@testing-library/react';

import { Button } from './button';

describe('Button', () => {
  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('applies the variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button').className).toContain('bg-red-600');
  });

  it('disables the button and shows a spinner while loading', () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('stays disabled when disabled explicitly', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
