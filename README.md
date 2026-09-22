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
  -d '{"customerId":"customer-1","drinkType":"BEER"}'
curl http://localhost:3000/status
```

`POST /order` immediately returns `200` with `duplicate: false` and a preparing order, or `429` when at capacity. `GET /status` returns `servedOrders` and `uniqueCustomers`; an order appears there only after preparation completes.

## Configuration and tests

`PREPARATION_SECONDS` defaults to `5` and accepts a positive number. `PORT` defaults to `3000` and accepts an integer from 1 to 65535.

```sh
PREPARATION_SECONDS=1 PORT=3001 npm start
npm test
```

## Assumptions

- The bartender operates in one of two exclusive modes: up to two beers at once, or one non-beer drink. Neither type starts while the other mode is active.
- Because the brief supplies no order ID, the pair `(customerId, drinkType)` identifies an order for the lifetime of the process. A retry during preparation or after service returns `200` with `duplicate: true` and the current order state. A customer cannot order the same type again until the process restarts. A rejected `429` request can be retried when capacity frees up.
- `uniqueCustomers` contains the customer IDs of served orders, in first-service order. State is lost when the process stops.
- `customerId` must be a non-empty string and `drinkType` must be `BEER` or `DRINK`. Invalid JSON or input returns `400`; an oversized body returns `413`; unknown paths return `404`; wrong methods on known paths return `405`.
- Every request is logged to the console as one JSON line with timestamp, method, URL and parsed payload. If JSON parsing fails, the raw body is logged instead. Bodies over 1 MiB are rejected to limit memory use.
