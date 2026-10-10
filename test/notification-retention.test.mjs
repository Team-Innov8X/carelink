import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationCutoff } from '../lib/notification-retention.ts';

test('notification cutoff uses configured retention and defaults invalid values to one day', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  assert.equal(notificationCutoff(now, 24).toISOString(), '2026-10-09T12:00:00.000Z');
  assert.equal(notificationCutoff(now, 48).toISOString(), '2026-10-08T12:00:00.000Z');
  assert.equal(notificationCutoff(now, 0).toISOString(), '2026-10-09T12:00:00.000Z');
});
