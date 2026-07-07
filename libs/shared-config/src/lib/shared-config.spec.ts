import { z } from 'zod';
import { baseEnvSchema, createEnvValidator } from './shared-config';

describe('baseEnvSchema', () => {
  it('defaults NODE_ENV to development', () => {
    const parsed = baseEnvSchema.parse({});
    expect(parsed.NODE_ENV).toBe('development');
  });

  it('coerces PORT from string', () => {
    const parsed = baseEnvSchema.parse({ PORT: '3001' });
    expect(parsed.PORT).toBe(3001);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => baseEnvSchema.parse({ PORT: 'abc' })).toThrow();
  });
});

describe('createEnvValidator', () => {
  const schema = baseEnvSchema.extend({
    DATABASE_URL: z.string().min(1),
  });
  const validate = createEnvValidator(schema);

  it('returns typed config when valid', () => {
    const result = validate({ DATABASE_URL: 'postgresql://localhost/db' });
    expect(result.DATABASE_URL).toBe('postgresql://localhost/db');
    expect(result.NODE_ENV).toBe('development');
  });

  it('throws listing every missing variable', () => {
    expect(() => validate({})).toThrow(/DATABASE_URL/);
  });

  it('ignores unknown variables instead of failing', () => {
    expect(() =>
      validate({ DATABASE_URL: 'x', SOME_OTHER_VAR: 'y' }),
    ).not.toThrow();
  });
});
