import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { GhReleaseTarget } from '../github/gh-release-target.js';

const TEMPLATES = fileURLToPath(new URL('../../../../../playbooks/app-deploy/skills/deploy-pipeline/templates', import.meta.url));
const BLOCK_MARKER = /^\s*(?:#|<!--)\s*(>>>|<<<)\s*([a-z][a-z0-9-]*)\s*(?:-->)?\s*$/;
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

type Datastore = 'none' | 'postgres' | 'data-volume';
type Runtime = 'node' | 'busybox';

interface Shape {
  readonly datastore: Datastore;
  readonly runtime: Runtime;
  readonly migrate: boolean;
}

interface TemplateFile {
  readonly template: string;
  readonly output: string;
  readonly when?: (shape: Shape) => boolean;
}

const FILES: readonly TemplateFile[] = [
  { template: 'docker-compose.prod.yml', output: 'deploy/docker-compose.prod.yml' },
  { template: 'env.example', output: 'deploy/.env.example' },
  { template: 'rollback.sh', output: 'deploy/rollback.sh' },
  { template: 'prune-images.sh', output: 'deploy/prune-images.sh' },
  { template: 'migrate.sh', output: 'deploy/migrate.sh', when: (shape) => shape.migrate },
  { template: 'backup.sh', output: 'deploy/backup.sh', when: (shape) => shape.datastore !== 'none' },
  { template: 'backup-freshness-check.sh', output: 'deploy/backup-freshness-check.sh', when: (shape) => shape.datastore !== 'none' },
  { template: 'deploy-README.md', output: 'deploy/README.md' },
  { template: 'release-please.yml', output: '.github/workflows/release-please.yml' },
  { template: 'release-please-config.json', output: 'release-please-config.json' },
  { template: 'release-please-manifest.json', output: '.release-please-manifest.json' },
  { template: 'release.yml', output: '.github/workflows/release.yml' },
  { template: 'rollback.yml', output: '.github/workflows/rollback.yml' },
];

const VALUES: Readonly<Record<string, string>> = {
  SLUG: 'shelf',
  SLUG_UNDERSCORE: 'shelf',
  IMAGE: 'ghcr.io/someone/shelf',
  DOMAIN: 'shelf.example.com',
  INTERNAL_PORT: '3000',
  HEALTH_PATH: '/api/health',
  DATA_DIR: '/data',
  DATA_FILE: 'shelf.db',
  MIGRATE_COMMAND: 'node dist/migrate.js',
  RELEASE_TYPE: 'node',
  VERSION: '0.1.0',
};

const SHAPES: readonly Shape[] = (['none', 'postgres', 'data-volume'] as const).flatMap((datastore) =>
  (['node', 'busybox'] as const).flatMap((runtime) =>
    (datastore === 'none' ? [false] : [false, true]).map((migrate) => ({ datastore, runtime, migrate })),
  ),
);

function blocksOf(shape: Shape): Set<string> {
  const blocks = new Set<string>([shape.runtime]);
  if (shape.datastore !== 'none') blocks.add(shape.datastore);
  if (shape.migrate) blocks.add('migrate');
  return blocks;
}

function render(template: string, blocks: ReadonlySet<string>): string {
  const kept: string[] = [];
  let open: string | null = null;
  for (const line of template.split('\n')) {
    const marker = BLOCK_MARKER.exec(line);
    if (!marker) {
      if (open === null || blocks.has(open)) kept.push(line);
      continue;
    }
    const [, edge, name = ''] = marker;
    if (edge === '>>>') {
      if (open !== null) throw new Error(`Block ${name} opens inside block ${open}`);
      open = name;
    } else {
      if (open !== name) throw new Error(`Block ${name} closes while ${String(open)} is open`);
      open = null;
    }
  }
  if (open !== null) throw new Error(`Block ${open} never closes`);
  return kept.join('\n').replace(PLACEHOLDER, (_match, key: string) => {
    const value = VALUES[key];
    if (value === undefined) throw new Error(`No value for placeholder ${key}`);
    return value;
  });
}

function readTemplate(name: string): string {
  return readFileSync(join(TEMPLATES, name), 'utf8');
}

let dirs: string[] = [];
afterEach(() => {
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  dirs = [];
});

function renderInto(shape: Shape): { dir: string; files: Map<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), 'terminus-deploy-'));
  dirs.push(dir);
  const files = new Map<string, string>();
  for (const file of FILES) {
    if (file.when && !file.when(shape)) continue;
    const content = render(readTemplate(file.template), blocksOf(shape));
    const path = join(dir, file.output);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    if (path.endsWith('.sh')) chmodSync(path, 0o755);
    files.set(file.output, content);
  }
  return { dir, files };
}

const label = (shape: Shape): string => `${shape.datastore}, ${shape.runtime}${shape.migrate ? ', migrate' : ''}`;

interface ComposeService {
  mem_limit?: string;
  ports?: string[];
  volumes?: string[];
  depends_on?: Record<string, unknown>;
}

describe('app-deploy templates', () => {
  it('ships no template the rendering rules leave untested', () => {
    expect(readdirSync(TEMPLATES).sort()).toEqual(FILES.map((file) => file.template).sort());
  });

  describe.each(SHAPES.map((shape) => [label(shape), shape] as const))('rendered for %s', (_label, shape) => {
    it('leaves no placeholder and no block marker behind', () => {
      const { files } = renderInto(shape);
      for (const [name, content] of files) {
        expect(content, name).not.toMatch(/\{\{[A-Z][A-Z0-9_]*\}\}/);
        expect(content.split('\n').filter((line) => BLOCK_MARKER.test(line)), name).toEqual([]);
      }
    });

    it('renders a Compose file pinned to the slug, memory-bounded and bound to the loopback', () => {
      const compose = parse(renderInto(shape).files.get('deploy/docker-compose.prod.yml') ?? '') as { name: string; services: Record<string, ComposeService>; volumes?: Record<string, unknown> };

      expect(compose.name).toBe('shelf');
      for (const [name, service] of Object.entries(compose.services)) {
        expect(service.mem_limit, name).toMatch(/^\d+[mg]$/);
        for (const port of service.ports ?? []) expect(port, name).toMatch(/^127\.0\.0\.1:/);
      }
      expect(compose.services['app']?.ports).toEqual(['127.0.0.1:${APP_PORT:-3000}:3000']);
      expect(Object.keys(compose.services).sort()).toEqual(shape.datastore === 'postgres' ? ['app', 'postgres'] : ['app']);
      expect(compose.services['app']?.volumes).toEqual(shape.datastore === 'data-volume' ? ['shelf-data:/data'] : undefined);
      expect(Object.keys(compose.volumes ?? {})).toEqual(shape.datastore === 'none' ? [] : [shape.datastore === 'postgres' ? 'shelf-pg' : 'shelf-data']);
    });

    it('renders shell scripts that parse and stop on the first error', () => {
      const { dir, files } = renderInto(shape);
      const scripts = [...files.keys()].filter((name) => name.endsWith('.sh'));
      expect(scripts.length).toBeGreaterThanOrEqual(2);
      for (const script of scripts) {
        const syntax = spawnSync('bash', ['-n', join(dir, script)], { encoding: 'utf8' });
        expect(syntax.status, `${script}: ${syntax.stderr}`).toBe(0);
        expect(files.get(script), script).toContain('set -euo pipefail');
      }
    });

    it('renders a release workflow Terminus reads as deploying on release', () => {
      const { dir, files } = renderInto(shape);
      const release = parse(files.get('.github/workflows/release.yml') ?? '') as { jobs: Record<string, { steps: { name?: string; run?: string }[] }> };

      expect(Object.keys(release.jobs)).toEqual(['build', 'sign', 'deploy', 'verify-deploy']);
      const migrates = release.jobs['deploy']?.steps.some((step) => step.name === 'Run pending database migrations');
      expect(migrates).toBe(shape.migrate);
      expect(new GhReleaseTarget('false').state(dir)?.deploysOnRelease).toBe(true);
    });

    it('renders valid release-please and rollback workflows', () => {
      const { files } = renderInto(shape);

      expect(files.get('.github/workflows/release-please.yml')).toContain('secrets.RELEASE_PLEASE_TOKEN');
      expect(parse(files.get('.github/workflows/release-please.yml') ?? '')).toHaveProperty('jobs');
      const rollback = parse(files.get('.github/workflows/rollback.yml') ?? '') as { on: { workflow_dispatch: { inputs: Record<string, unknown> } } };
      expect(Object.keys(rollback.on.workflow_dispatch.inputs)).toEqual(['version']);
      expect(JSON.parse(files.get('release-please-config.json') ?? '')).toMatchObject({ 'release-type': 'node', packages: { '.': {} } });
      expect(JSON.parse(files.get('.release-please-manifest.json') ?? '')).toEqual({ '.': '0.1.0' });
    });

    it('names no address other than the loopback', () => {
      const { files } = renderInto(shape);
      for (const [name, content] of files) {
        expect((content.match(IPV4) ?? []).filter((address) => address !== '127.0.0.1'), name).toEqual([]);
      }
    });
  });

  it('keeps every raw template free of any address other than the loopback', () => {
    for (const name of readdirSync(TEMPLATES)) {
      expect((readTemplate(name).match(IPV4) ?? []).filter((address) => address !== '127.0.0.1'), name).toEqual([]);
    }
  });

  describe('rollback.sh', () => {
    const STUB_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
case "$*" in
  *" config") printf 'name: %s\\nservices: {}\\n' "$STUB_PROJECT" ;;
  *" ps -q app") printf '%s\\n' "\${STUB_APP_ID:-}" ;;
  "inspect "*) printf '%s\\n' "\${STUB_PROXY_NETWORKS:-{\\}}" ;;
esac
`;
    const STUB_CURL = '#!/usr/bin/env bash\necho "curl $*" >> "$STUB_LOG"\n';

    function rollback(env: Record<string, string>): { status: number | null; log: string[]; envFile: string } {
      const { dir } = renderInto({ datastore: 'postgres', runtime: 'node', migrate: false });
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'docker'), STUB_DOCKER, { mode: 0o755 });
      writeFileSync(join(bin, 'curl'), STUB_CURL, { mode: 0o755 });
      const example = readFileSync(join(dir, 'deploy/.env.example'), 'utf8');
      writeFileSync(join(dir, 'deploy/.env'), example.replace(/^PROXY_CONTAINER=.*$/m, 'PROXY_CONTAINER=proxy'));
      const log = join(dir, 'calls.log');
      writeFileSync(log, '');
      const result = spawnSync('bash', [join(dir, 'deploy/rollback.sh'), '1.2.0'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, STUB_LOG: log, STUB_PROJECT: 'shelf', ROLLBACK_POLL_INTERVAL_SECONDS: '0', ...env },
      });
      return { status: result.status, log: readFileSync(log, 'utf8').trim().split('\n'), envFile: readFileSync(join(dir, 'deploy/.env'), 'utf8') };
    }

    const upCalls = (log: string[]): string[] => log.filter((line) => / up -d/.test(line)).map((line) => line.slice(line.indexOf(' up -d') + 1));

    it('brings the whole stack up and joins the proxy when nothing runs yet', () => {
      const { status, log, envFile } = rollback({});

      expect(status).toBe(0);
      expect(upCalls(log)).toEqual(['up -d']);
      expect(log).toContain('docker network connect shelf_default proxy');
      expect(envFile).toMatch(/^RELEASE_VERSION=1\.2\.0$/m);
    });

    it('restarts only the app once it runs, and leaves an attached proxy alone', () => {
      const { status, log } = rollback({ STUB_APP_ID: 'abc123', STUB_PROXY_NETWORKS: '{"shelf_default":{}}' });

      expect(status).toBe(0);
      expect(upCalls(log)).toEqual(['up -d --no-deps app']);
      expect(log.filter((line) => line.startsWith('docker network connect'))).toEqual([]);
    });

    it('stops before touching anything when Compose resolves another project', () => {
      const { status, log, envFile } = rollback({ STUB_PROJECT: 'deploy' });

      expect(status).not.toBe(0);
      expect(upCalls(log)).toEqual([]);
      expect(log.filter((line) => / pull/.test(line))).toEqual([]);
      expect(envFile).toMatch(/^RELEASE_VERSION=$/m);
    });
  });
});
