import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModerationCompletedPayload, ModerationJobPayload } from './moderation';

describe('ModerationJobPayload', () => {
  it('passes validation with a postId and content', async () => {
    const dto = plainToInstance(ModerationJobPayload, { postId: 'p1', content: 'hello' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails validation when postId is missing', async () => {
    const dto = plainToInstance(ModerationJobPayload, { content: 'hello' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'postId')).toBe(true);
  });
});

describe('ModerationCompletedPayload', () => {
  it('passes validation with a valid verdict', async () => {
    const dto = plainToInstance(ModerationCompletedPayload, {
      postId: 'p1',
      verdict: 'approved',
      categories: [],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails validation when verdict is not approved/rejected', async () => {
    const dto = plainToInstance(ModerationCompletedPayload, {
      postId: 'p1',
      verdict: 'maybe',
      categories: [],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'verdict')).toBe(true);
  });
});
