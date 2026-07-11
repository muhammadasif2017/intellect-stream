import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InternalAuthGuard } from './internal-auth.guard';

const jwtMock = { verify: jest.fn() };
const configMock = { getOrThrow: jest.fn().mockReturnValue('test-secret') };

function contextWithAuthHeader(authorization: string | undefined): ExecutionContext {
  const request: { headers: Record<string, string | undefined>; userId?: string } = {
    headers: { authorization },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new InternalAuthGuard(
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
    );
  });

  it('throws UnauthorizedException when there is no Authorization header', () => {
    expect(() => guard.canActivate(contextWithAuthHeader(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the header is not a Bearer token', () => {
    expect(() => guard.canActivate(contextWithAuthHeader('Basic abc123'))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token fails verification', () => {
    jwtMock.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    expect(() => guard.canActivate(contextWithAuthHeader('Bearer bad-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('sets request.userId and allows the request when the token verifies', () => {
    jwtMock.verify.mockReturnValue({ userId: 'u1' });
    const context = contextWithAuthHeader('Bearer good-token');

    expect(guard.canActivate(context)).toBe(true);
    expect(jwtMock.verify).toHaveBeenCalledWith('good-token', {
      secret: 'test-secret',
      audience: 'internal-api',
    });
    expect(context.switchToHttp().getRequest().userId).toBe('u1');
  });
});
