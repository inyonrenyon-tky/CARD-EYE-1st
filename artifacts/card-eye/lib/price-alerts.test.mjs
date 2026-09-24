import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePriceAlert, parsePriceAlerts } from './price-alerts.ts';

const now = new Date('2026-09-25T12:00:00.000Z');
const rule = {
  id: 'rule-1', savedCardId: 'saved-1', cardName: 'テストカード', cardNumber: '123/190',
  basis: 'SALE', direction: 'above', threshold: 10000, enabled: true,
  triggered: false, lastPrice: null, lastObservedAt: null, lastSource: null, triggeredAt: null,
};
const quote = (price, daysAgo = 1) => ({
  price, observedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), source: '確認済み成約',
});

test('reaching a target triggers once and rearms only after crossing back', () => {
  const first = evaluatePriceAlert(rule, quote(11000), now);
  assert.equal(first.newlyTriggered, true);
  assert.equal(first.status, '条件に到達');
  assert.equal(evaluatePriceAlert(first.rule, quote(12000), now).newlyTriggered, false);
  const rearmed = evaluatePriceAlert(first.rule, quote(9000), now);
  assert.equal(rearmed.rule.triggered, false);
  assert.equal(rearmed.rule.triggeredAt, null);
  assert.equal(evaluatePriceAlert(rearmed.rule, quote(10000), now).newlyTriggered, true);
});

test('below thresholds include equality, while prices above do not trigger', () => {
  const below = { ...rule, direction: 'below' };
  assert.equal(evaluatePriceAlert(below, quote(10001), now).newlyTriggered, false);
  assert.equal(evaluatePriceAlert(below, quote(10000), now).newlyTriggered, true);
});

test('missing, stale, or future observations never trigger', () => {
  assert.equal(evaluatePriceAlert(rule, null, now).newlyTriggered, false);
  assert.equal(evaluatePriceAlert(rule, quote(15000, 8), now).status, '観測が古いため保留');
  assert.equal(evaluatePriceAlert(rule, quote(15000, -1), now).newlyTriggered, false);
});

test('saved rule validation rejects malformed data rather than dropping it', () => {
  assert.deepEqual(parsePriceAlerts(null), []);
  assert.equal(parsePriceAlerts(JSON.stringify([rule]))[0].threshold, 10000);
  assert.throws(() => parsePriceAlerts(JSON.stringify([{ ...rule, threshold: -1 }])));
  assert.throws(() => parsePriceAlerts('{}'));
});