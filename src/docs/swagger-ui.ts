import { readFileSync } from 'node:fs';

export const swaggerUiAssets = {
  stylesheet: readFileSync(require.resolve('swagger-ui-dist/swagger-ui.css'), 'utf8'),
  bundle: readFileSync(require.resolve('swagger-ui-dist/swagger-ui-bundle.js'), 'utf8'),
  standalonePreset: readFileSync(
    require.resolve('swagger-ui-dist/swagger-ui-standalone-preset.js'),
    'utf8',
  ),
};

export const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SecuraAI API Documentation</title>
    <link rel="stylesheet" href="/swagger-ui/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/swagger-ui/swagger-ui-bundle.js"></script>
    <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
    <script>
      window.addEventListener('load', () => {
        window.ui = SwaggerUIBundle({
          url: '/docs/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        });
      });
    </script>
  </body>
</html>`;
