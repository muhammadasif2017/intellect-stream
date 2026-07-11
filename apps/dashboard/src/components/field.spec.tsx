import { render, screen } from '@testing-library/react';

import { Field } from './field';
import { Input } from './input';
import { Select } from './select';

describe('Field', () => {
  it('associates the label with the control', () => {
    render(
      <Field label="Post title">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Post title')).toBeTruthy();
  });

  it('links the error message and marks the control invalid', () => {
    render(
      <Field label="Post title" error="Title is required">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Post title');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Title is required',
    );
  });

  it('shows a hint when there is no error', () => {
    render(
      <Field label="Body" hint="Markdown supported">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Markdown supported')).toBeTruthy();
  });

  it('wires a Select the same way as an Input', () => {
    render(
      <Field label="Service">
        <Select>
          <option value="gateway">gateway</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText('Service').tagName).toBe('SELECT');
  });
});
