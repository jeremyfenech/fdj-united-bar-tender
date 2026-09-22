import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBartender } from '../src/bartender.js';

function setup() {
  const timers = [];
  let seconds = 0;
  const bartender = createBartender({
    preparationMs: 5000,
    now: () => new Date(seconds * 1000),
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
    order: { customerId: 'a', drinkType: 'BEER', status: 'preparing', startedAt: '1970-01-01T00:00:00.000Z' },
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
