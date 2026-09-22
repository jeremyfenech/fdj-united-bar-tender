import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBartender } from '../src/bartender.js';

function setup() {
  const timers = [];
  let seconds = 0;
  let nextId = 1;
  const bartender = createBartender({
    preparationMs: 5000,
    now: () => new Date(seconds * 1000),
    createId: () => `order-${nextId++}`,
    schedule: (callback, delay) => {
      timers.push({ callback, delay });
    },
  });
  return { bartender, timers, advance: () => { seconds += 5; timers.shift().callback(); } };
}

test('two beers start together; a third starts after capacity is released', () => {
  const { bartender, timers, advance } = setup();
  assert.equal(bartender.order('a', 'BEER').accepted, true);
  assert.equal(bartender.order('b', 'BEER').accepted, true);
  assert.equal(bartender.order('c', 'BEER').accepted, false);
  assert.deepEqual(timers.map((timer) => timer.delay), [5000, 5000]);
  assert.deepEqual(bartender.status(), { servedOrders: [], uniqueCustomers: [] });

  advance();
  assert.equal(bartender.order('c', 'BEER').accepted, true);
  assert.equal(bartender.status().servedOrders.length, 1);
  assert.deepEqual(bartender.status().uniqueCustomers, ['a']);
});

test('a non-beer drink has exclusive capacity', () => {
  const { bartender, advance } = setup();
  assert.equal(bartender.order('a', 'DRINK').accepted, true);
  assert.equal(bartender.order('b', 'BEER').accepted, false);
  assert.equal(bartender.order('c', 'DRINK').accepted, false);
  advance();
  assert.equal(bartender.order('b', 'BEER').accepted, true);
  assert.equal(bartender.order('c', 'DRINK').accepted, false);
});

test('duplicate retries do not start another timer or serving', () => {
  const { bartender, timers, advance } = setup();
  assert.equal(bartender.order('a', 'BEER').duplicate, false);
  assert.deepEqual(bartender.order('a', 'BEER'), {
    accepted: true,
    duplicate: true,
    order: { id: 'order-1', customerId: 'a', drinkType: 'BEER', status: 'preparing', startedAt: '1970-01-01T00:00:00.000Z' },
  });
  assert.equal(timers.length, 1);
  advance();
  assert.equal(bartender.order('a', 'BEER').order.status, 'served');
  assert.equal(timers.length, 0);
  assert.equal(bartender.status().servedOrders.length, 1);
});

test('unique customers are counted from served orders', () => {
  const { bartender, advance } = setup();
  bartender.order('a', 'BEER');
  bartender.order('b', 'BEER');
  advance();
  advance();
  bartender.order('a', 'DRINK');
  advance();
  assert.deepEqual(bartender.status().uniqueCustomers, ['a', 'b']);
  assert.equal(bartender.status().servedOrders.length, 3);
});

test('a fresh idempotency key permits a new order of the same drink', () => {
  const { bartender, timers, advance } = setup();
  assert.equal(bartender.order('a', 'BEER', 'attempt-1').duplicate, false);
  const retry = bartender.order('a', 'BEER', 'attempt-1');
  assert.equal(retry.duplicate, true);
  assert.equal(retry.order.id, 'order-1');
  assert.equal(timers.length, 1);
  advance();

  const nextOrder = bartender.order('a', 'BEER', 'attempt-2');
  assert.equal(nextOrder.duplicate, false);
  assert.equal(nextOrder.order.id, 'order-2');
  assert.equal(timers.length, 1);
  advance();
  assert.equal(bartender.status().servedOrders.length, 2);
  assert.deepEqual(bartender.status().uniqueCustomers, ['a']);
});

test('reusing an idempotency key for a different payload is rejected', () => {
  const { bartender, timers } = setup();
  bartender.order('a', 'BEER', 'attempt-1');
  assert.deepEqual(bartender.order('a', 'DRINK', 'attempt-1'), { accepted: false, conflict: true });
  assert.deepEqual(bartender.order('b', 'BEER', 'attempt-1'), { accepted: false, conflict: true });
  assert.equal(timers.length, 1);
});
