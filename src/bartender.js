import { randomUUID } from 'node:crypto';

export function createBartender({ preparationMs, now = () => new Date(), schedule = setTimeout, createId = randomUUID }) {
  if (!Number.isFinite(preparationMs) || preparationMs <= 0) {
    throw new RangeError('preparationMs must be a positive number');
  }

  const orders = new Map();
  const servedOrders = [];
  let activeBeers = 0;
  let activeDrink = false;

  return {
    order(customerId, drinkType, idempotencyKey) {
      const key = idempotencyKey === undefined
        ? `legacy:${JSON.stringify([customerId, drinkType])}`
        : `request:${idempotencyKey}`;
      const existing = orders.get(key);
      if (existing) {
        if (existing.customerId !== customerId || existing.drinkType !== drinkType) {
          return { accepted: false, conflict: true };
        }
        return { accepted: true, duplicate: true, order: { ...existing } };
      }

      if (activeDrink || (drinkType === 'BEER' ? activeBeers >= 2 : activeBeers > 0)) {
        return { accepted: false };
      }

      const order = { id: createId(), customerId, drinkType, status: 'preparing', startedAt: now().toISOString() };
      orders.set(key, order);
      if (drinkType === 'BEER') activeBeers += 1;
      else activeDrink = true;

      schedule(() => {
        order.status = 'served';
        order.servedAt = now().toISOString();
        servedOrders.push({ ...order });
        if (drinkType === 'BEER') activeBeers -= 1;
        else activeDrink = false;
      }, preparationMs);

      return { accepted: true, duplicate: false, order: { ...order } };
    },

    status() {
      return {
        servedOrders: servedOrders.map((order) => ({ ...order })),
        uniqueCustomers: [...new Set(servedOrders.map((order) => order.customerId))],
      };
    },
  };
}
