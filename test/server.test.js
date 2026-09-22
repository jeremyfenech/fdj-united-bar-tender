import assert from 'node:assert/strict';
import net from 'node:net';
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

async function request(path, method = 'GET', body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
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

  timers.shift()();
  const body = JSON.stringify({ customerId: 'a', drinkType: 'BEER' });
  result = await request('/order', 'POST', body, { 'Idempotency-Key': 'attempt-1' });
  assert.equal(result.response.status, 200);
  assert.equal(result.json.duplicate, false);
  const firstId = result.json.order.id;
  result = await request('/order', 'POST', body, { 'Idempotency-Key': 'attempt-1' });
  assert.equal(result.json.duplicate, true);
  assert.equal(result.json.order.id, firstId);
  result = await request('/order', 'POST', JSON.stringify({ customerId: 'a', drinkType: 'DRINK' }), { 'Idempotency-Key': 'attempt-1' });
  assert.equal(result.response.status, 409);
  timers.shift()();
  result = await request('/order', 'POST', body, { 'Idempotency-Key': 'attempt-2' });
  assert.equal(result.response.status, 200);
  assert.equal(result.json.duplicate, false);
  assert.notEqual(result.json.order.id, firstId);
  result = await request('/order', 'POST', body, { 'Idempotency-Key': '' });
  assert.equal(result.response.status, 400);

  result = await request('/order', 'POST', 'x'.repeat(1024 * 1024 + 1));
  assert.equal(result.response.status, 413);
  assert.deepEqual(logs.at(-1).payload, { truncated: true, preview: 'x'.repeat(1024) });
});

test('malformed request target returns 400 without stopping the server', async () => {
  const reply = await new Promise((resolve, reject) => {
    const socket = net.connect(server.address().port, '127.0.0.1');
    let data = '';
    socket.on('connect', () => socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  assert.match(reply, /^HTTP\/1\.1 400 Bad Request/);
  assert.match(reply, /Invalid request URL/);
  assert.equal(logs.at(-1).url, 'http://[');
  const result = await request('/status');
  assert.equal(result.response.status, 200);
});
