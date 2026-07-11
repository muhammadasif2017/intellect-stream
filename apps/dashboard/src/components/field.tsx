import { cloneElement, useId } from 'react';
import type { ReactElement } from 'react';

import { cn } from '../lib/cn';

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /* The single form control this field labels (Input, Select, textarea …). */
  children: ReactElement<{
    id?: string;
    invalid?: boolean;
    'aria-describedby'?: string;
  }>;
};

/* Owns the accessibility wiring a labeled control needs: htmlFor/id pairing,
 * error/hint linked via aria-describedby, invalid flag pushed down. Callers
 * write <Field label="Title"><Input …/></Field> and can't forget the wiring. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        invalid: error ? true : children.props.invalid,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={cn(
            'mt-1.5 text-sm',
            error ? 'text-status-failed' : 'text-muted-foreground',
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
