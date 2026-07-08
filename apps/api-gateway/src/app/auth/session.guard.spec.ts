import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';

function contextWithSession(session: Record<string, unknown> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session }),
    }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard', () => {
  const guard = new SessionGuard();

  it('allows the request when session.userId is present', () => {
    expect(guard.canActivate(contextWithSession({ userId: 'u1' }))).toBe(true);
  });

  it('throws UnauthorizedException when there is no session', () => {
    expect(() => guard.canActivate(contextWithSession(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when session.userId is missing', () => {
    expect(() => guard.canActivate(contextWithSession({}))).toThrow(UnauthorizedException);
  });
});
