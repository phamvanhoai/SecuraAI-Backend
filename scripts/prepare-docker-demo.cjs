// Generate ignored Docker env files without printing secrets or editing .env.
const fs = require('node:fs');
const dotenv = require('dotenv');
const values = dotenv.parse(fs.readFileSync('.env'));
const url = new URL(values.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '5433') {
  throw new Error('Select the existing local demo database on port 5433 before preparing Docker.');
}
const quote = (value) => JSON.stringify(value).replace(/\$/g, '$$$$');
fs.writeFileSync('.env.docker', `DEMO_DB_PASSWORD=${quote(decodeURIComponent(url.password))}\n`);
fs.writeFileSync(
  '.env.docker.runtime',
  Object.entries(values)
    .filter(([key]) => key !== 'DATABASE_URL')
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join('\n') + '\n',
);
console.log('Prepared ignored Docker runtime settings. Original .env was preserved.');
