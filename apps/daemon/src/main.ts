import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createHttpApp } from './adapters/http/app.js';
import { FsPlaybookRegistry } from './adapters/fs-playbooks/fs-playbook-registry.js';

const LOOPBACK = '127.0.0.1';
const port = Number(process.env['TERMINUS_PORT'] ?? 4317);
const playbooksDir = process.env['TERMINUS_PLAYBOOKS_DIR'] ?? fileURLToPath(new URL('../../../playbooks', import.meta.url));

const playbooks = new FsPlaybookRegistry(playbooksDir);
console.log(`loaded playbooks: ${playbooks.lifecycles().map((lifecycle) => `${lifecycle.id}@${lifecycle.version}`).join(', ')}`);

serve({ fetch: createHttpApp(process.env['npm_package_version'] ?? '0.0.0').fetch, hostname: LOOPBACK, port }, (info) => {
  console.log(`terminus daemon listening on http://${LOOPBACK}:${info.port}`);
});
