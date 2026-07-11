import { useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Card, CardContent, Field, Input } from '../../components';
import { useLogin, useRegister } from './use-auth';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const register = useRegister();
  const active = mode === 'login' ? login : register;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    active.mutate({ email, password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 font-sans text-foreground">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-lg font-semibold tracking-tight">
          IntellectStream
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Pipeline Dashboard
        </p>
        <Card className="mt-6">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field
                label="Password"
                error={active.error?.message}
                hint={mode === 'register' ? 'At least 8 characters' : undefined}
              >
                <Input
                  type="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" isLoading={active.isPending} className="w-full">
                {mode === 'login' ? 'Log in' : 'Create account'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {mode === 'login' ? 'No account?' : 'Already registered?'}{' '}
              <button
                type="button"
                className="font-medium text-primary hover:text-primary-strong"
                onClick={() =>
                  setMode(mode === 'login' ? 'register' : 'login')
                }
              >
                {mode === 'login' ? 'Create one' : 'Log in'}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
