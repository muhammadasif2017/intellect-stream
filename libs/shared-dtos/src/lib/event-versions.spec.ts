import {
  assertSupportedEventVersion,
  UnsupportedEventVersionError,
} from './event-versions';
import { MODERATION_COMPLETED_EVENT_TYPE, MODERATION_JOB_EVENT_TYPE } from './moderation';

describe('assertSupportedEventVersion', () => {
  it('accepts the current version of every known event type', () => {
    expect(() => assertSupportedEventVersion(MODERATION_JOB_EVENT_TYPE, 1)).not.toThrow();
    expect(() =>
      assertSupportedEventVersion(MODERATION_COMPLETED_EVENT_TYPE, 1),
    ).not.toThrow();
  });

  it('rejects a version from the future', () => {
    expect(() => assertSupportedEventVersion(MODERATION_JOB_EVENT_TYPE, 2)).toThrow(
      UnsupportedEventVersionError,
    );
  });

  it('rejects an eventType with no registered contract', () => {
    expect(() => assertSupportedEventVersion('unknown.event', 1)).toThrow(
      UnsupportedEventVersionError,
    );
  });

  it('carries eventType and eventVersion on the error for structured handling', () => {
    try {
      assertSupportedEventVersion(MODERATION_JOB_EVENT_TYPE, 99);
      fail('should have thrown');
    } catch (err) {
      const typed = err as UnsupportedEventVersionError;
      expect(typed).toBeInstanceOf(UnsupportedEventVersionError);
      expect(typed.eventType).toBe(MODERATION_JOB_EVENT_TYPE);
      expect(typed.eventVersion).toBe(99);
    }
  });
});
