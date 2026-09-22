import { createServer } from './server.js';

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
const server = createServer({ preparationMs: preparationSeconds * 1000 });
server.listen(port, () => {
  console.log(`Bar Tender API listening at http://localhost:${port}`);
});
