import { createServer as createHttpServer } from 'node:http';
import { createBartender } from './bartender.js';

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('Request body exceeds 1 MiB');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createServer({ preparationMs = 5000, log = console.log, now, schedule } = {}) {
  const bartender = createBartender({ preparationMs, now, schedule });

  return createHttpServer(async (request, response) => {
    let rawBody = '';
    let payload = null;
    let bodyError;

    try {
      rawBody = await readBody(request);
      if (rawBody) payload = JSON.parse(rawBody);
    } catch (error) {
      bodyError = error;
      payload = rawBody || null;
    }

    log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      payload,
    }));

    if (bodyError) {
      sendJson(response, bodyError.statusCode || 400, {
        error: bodyError.statusCode === 413 ? 'Request body exceeds 1 MiB' : 'Invalid JSON body',
      });
      return;
    }

    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/status') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
        return;
      }
      sendJson(response, 200, bartender.status());
      return;
    }

    if (path === '/order') {
      if (request.method !== 'POST') {
        sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)
        || typeof payload.customerId !== 'string' || !payload.customerId.trim()
        || !['BEER', 'DRINK'].includes(payload.drinkType)) {
        sendJson(response, 400, { error: 'Expected customerId as a non-empty string and drinkType as BEER or DRINK' });
        return;
      }

      const result = bartender.order(payload.customerId, payload.drinkType);
      if (!result.accepted) {
        sendJson(response, 429, { error: 'Bartender at capacity' });
        return;
      }
      sendJson(response, 200, { duplicate: result.duplicate, order: result.order });
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });
}
