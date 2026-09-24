import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createHttpApp } from './adapters/http/app.js';
import { FsPlaybookRegistry } from './adapters/fs-playbooks/fs-playbook-registry.js';
import { openDatabase } from './adapters/sqlite/database.js';

const LOOPBACK = '127.0.0.1';
const port = Number(process.env['TERMINUS_PORT'] ?? 4317);
const home = process.env['TERMINUS_HOME'] ?? join(homedir(), '.terminus');
const playbooksDir = process.env['TERMINUS_PLAYBOOKS_DIR'] ?? fileURLToPath(new URL('../../../playbooks', import.meta.url));

mkdirSync(home, { recursive: true });
openDatabase(join(home, 'terminus.db'));
const playbooks = new FsPlaybookRegistry(playbooksDir);
console.log(`loaded playbooks: ${playbooks.lifecycles().map((lifecycle) => `${lifecycle.id}@${lifecycle.version}`).join(', ')}`);

serve({ fetch: createHttpApp(process.env['npm_package_version'] ?? '0.0.0').fetch, hostname: LOOPBACK, port }, (info) => {
  console.log(`terminus daemon listening on http://${LOOPBACK}:${info.port}`);
});
