# Bar Tender API

A dependency-free, single-process Node.js implementation of the FDJ United assignment.

## Run

Requires Node.js 20 or newer. From this `project/` directory:

```sh
npm start
```

The API listens on `http://localhost:3000`. To restart automatically after edits, use `npm run dev`. No installation step is needed because the project uses only Node.js built-in modules.

Try it from another terminal:

```sh
curl -i -X POST http://localhost:3000/order \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: attempt-123' \
  -d '{"customerId":"customer-1","drinkType":"BEER"}'
curl http://localhost:3000/status
```

`POST /order` immediately returns `200` with `duplicate: false` and a preparing order, or `429` when at capacity. `GET /status` returns `servedOrders` and `uniqueCustomers`; an order appears there only after preparation completes.
Each accepted order has a server-generated `id`, which stays the same on retries and appears in `/status` after service.

## Configuration and tests

`PREPARATION_SECONDS` defaults to `5` and accepts a positive number. `PORT` defaults to `3000` and accepts an integer from 1 to 65535.

```sh
PREPARATION_SECONDS=1 PORT=3001 npm start
npm test
```

## Assumptions

- The bartender operates in one of two exclusive modes: up to two beers at once, or one non-beer drink. Neither type starts while the other mode is active.
- For reliable retries, the client supplies an optional `Idempotency-Key` header (for example, a random UUID). Generate it once per intended order, reuse it for every retry, and use a new key for a genuinely new order. The key is retained for the lifetime of this in-memory process. A retry during preparation or after service returns `200` with `duplicate: true` and the current order state. Reusing a key with a different customer or drink returns `409`. A rejected `429` request does not reserve the key and can be retried when capacity frees up.
- The brief's two-field request still works without a header. Because it provides no order identity, the fallback treats `(customerId, drinkType)` as one order for the lifetime of the process. Thus, a customer can order the same drink again only by supplying a fresh `Idempotency-Key`. A server-generated ID alone would not protect a retry if the original response was lost.
- `uniqueCustomers` contains the customer IDs of served orders, in first-service order. State is lost when the process stops.
- `customerId` must be a non-empty string and `drinkType` must be `BEER` or `DRINK`. If supplied, `Idempotency-Key` must be non-empty and at most 255 characters. Invalid JSON or input returns `400`; an oversized body returns `413`; unknown paths return `404`; wrong methods on known paths return `405`.
- Every request is logged to the console as one JSON line with timestamp, method, URL, parsed payload and idempotency key when supplied. If JSON parsing fails, the raw body is logged instead. Bodies over 1 MiB are rejected to limit memory use; their audit entry includes a 1 KiB payload preview marked as truncated.
