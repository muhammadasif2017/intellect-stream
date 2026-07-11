import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EVENT_VERSIONS,
  MODERATION_COMPLETED_EVENT_TYPE,
  MODERATION_JOB_EVENT_TYPE,
  ModerationCompletedPayload,
  ModerationJobPayload,
} from '../index';

// ADR-0012: contract compatibility guard.
//
// These fixtures are FROZEN copies of real v1 wire payloads. DO NOT EDIT
// them to make a failing test pass — a fixture failing validation means the
// current DTO class can no longer accept a message an old producer is still
// sending, i.e. the change you just made is breaking, not additive
// (decision 9). Either make the new field optional, or bump the event
// version in EVENT_VERSIONS and add a new fixture beside the old one.
//
// Additive-only means two properties, both tested below:
//  1. Backward: every historical payload shape still validates (no field
//     removed, renamed, retyped, or newly required).
//  2. Forward: a payload carrying fields this version doesn't know still
//     validates (a newer additive producer must not break an older consumer).

const FROZEN_V1_FIXTURES: Array<{
  eventType: string;
  eventVersion: number;
  description: string;
  payloadClass: new () => object;
  payload: Record<string, unknown>;
}> = [
  {
    eventType: MODERATION_JOB_EVENT_TYPE,
    eventVersion: 1,
    description: 'moderation.job v1 (milestone 3 original shape)',
    payloadClass: ModerationJobPayload,
    payload: {
      postId: 'cmcxk2f1x0000v8f4d2q9h7e3',
      content: 'This is a post awaiting moderation.',
    },
  },
  {
    eventType: MODERATION_COMPLETED_EVENT_TYPE,
    eventVersion: 1,
    description: 'moderation.completed v1 minimal (pre-decision-22, no authorId)',
    payloadClass: ModerationCompletedPayload,
    payload: {
      postId: 'cmcxk2f1x0000v8f4d2q9h7e3',
      verdict: 'approved',
      categories: [],
    },
  },
  {
    eventType: MODERATION_COMPLETED_EVENT_TYPE,
    eventVersion: 1,
    description: 'moderation.completed v1 with authorId (decision 22, Kafka leg)',
    payloadClass: ModerationCompletedPayload,
    payload: {
      postId: 'cmcxk2f1x0000v8f4d2q9h7e3',
      verdict: 'rejected',
      categories: ['hate-speech'],
      authorId: 'user-7f3a',
    },
  },
];

describe('contract compatibility (ADR-0012, decision 9: additive-only)', () => {
  describe.each(FROZEN_V1_FIXTURES)(
    '$description',
    ({ payloadClass, payload }) => {
      it('still validates against the current DTO class (backward compatibility)', async () => {
        const instance = plainToInstance(payloadClass, payload);
        const errors = await validate(instance);
        expect(errors).toEqual([]);
      });

      it('still validates with an unknown additive field present (forward compatibility)', async () => {
        const instance = plainToInstance(payloadClass, {
          ...payload,
          fieldFromTheFuture: 'added by a newer producer',
        });
        const errors = await validate(instance);
        expect(errors).toEqual([]);
      });
    },
  );

  it('covers every event type declared in EVENT_VERSIONS with at least one fixture', () => {
    const coveredTypes = new Set(FROZEN_V1_FIXTURES.map((f) => f.eventType));
    for (const eventType of Object.keys(EVENT_VERSIONS)) {
      expect(coveredTypes).toContain(eventType);
    }
  });

  it('has a fixture for the current version of every event type', () => {
    for (const [eventType, version] of Object.entries(EVENT_VERSIONS)) {
      const current = FROZEN_V1_FIXTURES.filter(
        (f) => f.eventType === eventType && f.eventVersion === version,
      );
      expect(current.length).toBeGreaterThan(0);
    }
  });
});
