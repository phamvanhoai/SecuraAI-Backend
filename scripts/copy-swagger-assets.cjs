const { copyFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const swaggerDistDirectory = path.dirname(require.resolve('swagger-ui-dist/package.json'));
const outputDirectory = path.resolve(__dirname, '../public/swagger-ui');
const assets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
];

mkdirSync(outputDirectory, { recursive: true });

for (const asset of assets) {
  copyFileSync(path.join(swaggerDistDirectory, asset), path.join(outputDirectory, asset));
}

console.log(`Prepared ${assets.length} Swagger UI assets`);
