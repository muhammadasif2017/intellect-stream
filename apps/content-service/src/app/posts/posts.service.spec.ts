import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PostsService } from './posts.service';

const prismaMock = {
  post: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  outboxMessage: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};
prismaMock.$transaction.mockImplementation((cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock));

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [PostsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(PostsService);
  });

  it('create() writes the post (authorId from the caller, not the dto) and an outbox row in the same transaction', async () => {
    const dto = { content: 'hi' };
    const expected = { id: 'p1', authorId: 'u1', content: 'hi' };
    prismaMock.post.create.mockResolvedValue(expected);
    const result = await service.create('u1', dto);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.post.create).toHaveBeenCalledWith({
      data: { content: 'hi', authorId: 'u1' },
    });
    expect(prismaMock.outboxMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'moderation.job',
        source: 'content-service',
        payload: { postId: 'p1', content: 'hi' },
        correlationId: expect.any(String),
      }),
    });
    expect(result).toEqual(expected);
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

  it('update() scopes the write to id + authorId and returns the updated row on success', async () => {
    const updated = { id: 'p1', authorId: 'u1', content: 'new' };
    prismaMock.post.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.post.findUnique.mockResolvedValue(updated);

    await expect(service.update('p1', 'u1', { content: 'new' })).resolves.toEqual(updated);
    expect(prismaMock.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', authorId: 'u1' },
      data: { content: 'new' },
    });
  });

  it('update() throws NotFoundException when the post does not exist or is not owned by the caller', async () => {
    prismaMock.post.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.update('p1', 'someone-else', { content: 'new' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('remove() scopes the delete to id + authorId', async () => {
    prismaMock.post.deleteMany.mockResolvedValue({ count: 1 });
    await service.remove('p1', 'u1');
    expect(prismaMock.post.deleteMany).toHaveBeenCalledWith({ where: { id: 'p1', authorId: 'u1' } });
  });

  it('remove() throws NotFoundException when the post does not exist or is not owned by the caller', async () => {
    prismaMock.post.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('p1', 'someone-else')).rejects.toThrow(NotFoundException);
  });
});
