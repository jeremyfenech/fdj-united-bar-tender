export function createBartender({ preparationMs, now = () => new Date(), schedule = setTimeout }) {
  if (!Number.isFinite(preparationMs) || preparationMs <= 0) {
    throw new RangeError('preparationMs must be a positive number');
  }

  const orders = new Map();
  const servedOrders = [];
  let activeBeers = 0;
  let activeDrink = false;

  return {
    order(customerId, drinkType) {
      const key = JSON.stringify([customerId, drinkType]);
      const existing = orders.get(key);
      if (existing) {
        return { accepted: true, duplicate: true, order: { ...existing } };
      }

      if (activeDrink || (drinkType === 'BEER' ? activeBeers >= 2 : activeBeers > 0)) {
        return { accepted: false };
      }

      const order = { customerId, drinkType, status: 'preparing', startedAt: now().toISOString() };
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
