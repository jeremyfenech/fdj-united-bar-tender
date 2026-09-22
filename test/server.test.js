import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from '../src/server.js';

let server;
let baseUrl;
const logs = [];
const timers = [];

before(async () => {
  server = createServer({
    preparationMs: 5000,
    schedule: (callback) => timers.push(callback),
    log: (line) => logs.push(JSON.parse(line)),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body,
  });
  return { response, json: await response.json() };
}

test('HTTP endpoints respond immediately, validate input, and audit every request', async () => {
  let result = await request('/status');
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.json, { servedOrders: [], uniqueCustomers: [] });

  result = await request('/order', 'POST', JSON.stringify({ customerId: 'a', drinkType: 'BEER' }));
  assert.equal(result.response.status, 200);
  assert.equal(result.json.order.status, 'preparing');
  assert.equal(timers.length, 1);

  result = await request('/order', 'POST', JSON.stringify({ customerId: 'a', drinkType: 'BEER' }));
  assert.equal(result.response.status, 200);
  assert.equal(result.json.duplicate, true);
  assert.equal(timers.length, 1);

  await request('/order', 'POST', JSON.stringify({ customerId: 'b', drinkType: 'BEER' }));
  result = await request('/order', 'POST', JSON.stringify({ customerId: 'c', drinkType: 'BEER' }));
  assert.equal(result.response.status, 429);

  result = await request('/order', 'POST', '{bad json');
  assert.equal(result.response.status, 400);
  result = await request('/order', 'POST', JSON.stringify({ customerId: '', drinkType: 'WINE' }));
  assert.equal(result.response.status, 400);
  result = await request('/order');
  assert.equal(result.response.status, 405);
  assert.equal(result.response.headers.get('allow'), 'POST');
  result = await request('/missing');
  assert.equal(result.response.status, 404);

  assert.equal(logs.length, 9);
  assert.equal(logs[5].payload, '{bad json');
  assert.ok(logs.every((line) => line.timestamp && line.method && line.url && 'payload' in line));

  timers.shift()();
  result = await request('/status');
  assert.equal(result.json.servedOrders.length, 1);
  assert.deepEqual(result.json.uniqueCustomers, ['a']);
});
