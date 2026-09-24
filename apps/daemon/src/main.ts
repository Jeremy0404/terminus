import { serve } from '@hono/node-server';
import { createHttpApp } from './adapters/http/app.js';

const LOOPBACK = '127.0.0.1';
const port = Number(process.env['TERMINUS_PORT'] ?? 4317);

serve({ fetch: createHttpApp(process.env['npm_package_version'] ?? '0.0.0').fetch, hostname: LOOPBACK, port }, (info) => {
  console.log(`terminus daemon listening on http://${LOOPBACK}:${info.port}`);
});
