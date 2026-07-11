import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  hashSync: jest.fn(() => 'dummy-hash'),
}));

const prismaMock = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

const notFoundError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: '7.8.0',
});

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(AuthService);
  });

  describe('register', () => {
    it('hashes the password and creates the user, returning no passwordHash', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      prismaMock.user.create.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: 'hashed-pw',
      });

      const result = await service.register({ email: 'alice@example.com', password: 'plaintext' });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 12);
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: { email: 'alice@example.com', passwordHash: 'hashed-pw' },
      });
      expect(result).toEqual({ email: 'alice@example.com' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('swallows a duplicate email (P2002) and returns the same shape as a fresh registration (no enumeration)', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      prismaMock.user.create.mockRejectedValue(notFoundError);

      const result = await service.register({ email: 'alice@example.com', password: 'plaintext' });

      expect(result).toEqual({ email: 'alice@example.com' });
    });

    it('rethrows non-P2002 errors unchanged', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      prismaMock.user.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.register({ email: 'alice@example.com', password: 'plaintext' }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('validateCredentials', () => {
    it('returns the safe user when the password matches', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: 'hashed-pw',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateCredentials({
        email: 'alice@example.com',
        password: 'plaintext',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith('plaintext', 'hashed-pw');
      expect(result).toEqual({ id: 'u1', email: 'alice@example.com' });
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: 'hashed-pw',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateCredentials({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('still runs bcrypt.compare against a dummy hash for an unknown email (timing-safe, no enumeration)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateCredentials({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bcrypt.compare).toHaveBeenCalledWith('whatever', 'dummy-hash');
    });
  });

  describe('findById', () => {
    it('returns the safe user when found', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: 'hashed-pw',
      });

      const result = await service.findById('u1');
      expect(result).toEqual({ id: 'u1', email: 'alice@example.com' });
    });

    it('returns null when not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('missing')).resolves.toBeNull();
    });
  });
});
