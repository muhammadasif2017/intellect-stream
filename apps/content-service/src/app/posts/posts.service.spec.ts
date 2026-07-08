import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const prismaMock = {
  post: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  outboxMessage: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};
prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));

const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
  code: 'P2025',
  clientVersion: '7.8.0',
});

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [PostsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(PostsService);
  });

  it('create() writes the post and an outbox row in the same transaction', async () => {
    const dto = { authorId: 'u1', content: 'hi' };
    prismaMock.post.create.mockResolvedValue({ id: 'p1', ...dto });
    const result = await service.create(dto);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.post.create).toHaveBeenCalledWith({ data: dto });
    expect(prismaMock.outboxMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'moderation.job',
        source: 'content-service',
        payload: { postId: 'p1', content: 'hi' },
        correlationId: expect.any(String),
      }),
    });
    expect(result).toEqual({ id: 'p1', ...dto });
  });

  it('findAll() passes skip/take through to prisma', async () => {
    prismaMock.post.findMany.mockResolvedValue([]);
    await service.findAll({ skip: 10, take: 5 });
    expect(prismaMock.post.findMany).toHaveBeenCalledWith({ skip: 10, take: 5 });
  });

  it('findOne() returns null when prisma finds nothing (no throw)', async () => {
    prismaMock.post.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).resolves.toBeNull();
  });

  it('update() returns the updated row on success', async () => {
    const updated = { id: 'p1', content: 'new' };
    prismaMock.post.update.mockResolvedValue(updated);
    await expect(service.update('p1', { content: 'new' })).resolves.toEqual(updated);
  });

  it('update() maps Prisma P2025 to NotFoundException', async () => {
    prismaMock.post.update.mockRejectedValue(notFoundError);
    await expect(service.update('missing', { content: 'new' })).rejects.toThrow(NotFoundException);
  });

  it('remove() maps Prisma P2025 to NotFoundException', async () => {
    prismaMock.post.delete.mockRejectedValue(notFoundError);
    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });

  it('update() rethrows non-P2025 errors unchanged', async () => {
    const other = new Error('connection lost');
    prismaMock.post.update.mockRejectedValue(other);
    await expect(service.update('p1', { content: 'x' })).rejects.toThrow('connection lost');
  });
});
