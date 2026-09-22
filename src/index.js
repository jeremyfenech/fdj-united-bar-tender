import { createServer } from './server.js';
import { MAX_PREPARATION_MS } from './bartender.js';

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return number;
}

const port = positiveNumber(process.env.PORT ?? '3000', 'PORT');
if (!Number.isInteger(port) || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const preparationSeconds = positiveNumber(process.env.PREPARATION_SECONDS ?? '5', 'PREPARATION_SECONDS');
const preparationMs = preparationSeconds * 1000;
if (!Number.isInteger(preparationMs) || preparationMs > MAX_PREPARATION_MS) {
  throw new Error(`PREPARATION_SECONDS must represent a whole number of milliseconds from 1 to ${MAX_PREPARATION_MS}`);
}
const server = createServer({ preparationMs });
server.listen(port, () => {
  console.log(`Bar Tender API listening at http://localhost:${port}`);
});
