import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { ClaudeCliRunner } from './adapters/claude-cli/claude-cli-runner.js';
import { FsPlaybookRegistry } from './adapters/fs-playbooks/fs-playbook-registry.js';
import { GitWorkspace } from './adapters/git/git-workspace.js';
import { GhCodeHost, GhIssueTracker } from './adapters/github/gh-code-host.js';
import { DemoAgentRunner } from './adapters/in-memory/demo-agent-runner.js';
import { FsRepoScanner } from './adapters/repo-scanner/fs-repo-scanner.js';
import { JsonlTranscriptStore } from './adapters/jsonl-transcripts/jsonl-transcript-store.js';
import { ShellCheckRunner } from './adapters/shell-checks/shell-check-runner.js';
import { openDatabase } from './adapters/sqlite/database.js';
import {
  SqliteAppRepository,
  SqliteDecisionRepository,
  SqliteEpicRepository,
  SqliteRunRepository,
  SqliteTaskRepository,
} from './adapters/sqlite/sqlite-repositories.js';
import { RandomIds, SystemClock } from './adapters/system/node-system.js';
import type { AgentRunner } from './application/ports/agent-runner.js';
import { compose } from './compose.js';

const LOOPBACK = '127.0.0.1';
const SCHEDULER_INTERVAL_MS = 2_000;
const CHECK_TIMEOUT_MS = 15 * 60_000;

const env = process.env;
const port = Number(env['TERMINUS_PORT'] ?? 4317);
const home = env['TERMINUS_HOME'] ?? join(homedir(), '.terminus');
const playbooksDir = env['TERMINUS_PLAYBOOKS_DIR'] ?? fileURLToPath(new URL('../../../playbooks', import.meta.url));

const SECRET_PATHS = ['~/.ssh', '~/.aws', '~/.gnupg', '~/.config/gh', join(home, '.env')];

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}

function syncAgentSkills(agentHome: string): void {
  const target = join(agentHome, 'skills');
  mkdirSync(target, { recursive: true });
  for (const lifecycle of readdirSync(playbooksDir)) {
    const skills = join(playbooksDir, lifecycle, 'skills');
    if (existsSync(skills)) cpSync(skills, target, { recursive: true });
  }
}

function agentRunner(kind: string | undefined): AgentRunner {
  if (kind === 'demo') return new DemoAgentRunner();
  const secrets = readEnvFile(join(home, '.env'));
  const token = env['CLAUDE_CODE_OAUTH_TOKEN'] ?? secrets['CLAUDE_CODE_OAUTH_TOKEN'] ?? null;
  const isolated = env['TERMINUS_AGENT_ISOLATION'] !== 'off';
  if (isolated && !token) {
    throw new Error(
      `No subscription token for isolated agent runs. Run \`claude setup-token\` and add CLAUDE_CODE_OAUTH_TOKEN=... to ${join(home, '.env')} (mode 600), ` +
        'or start with TERMINUS_AGENT=demo, or TERMINUS_AGENT_ISOLATION=off to use your own Claude Code configuration.',
    );
  }
  const agentHome = join(home, 'agent-home');
  if (isolated) syncAgentSkills(agentHome);
  return new ClaudeCliRunner({ binary: env['TERMINUS_CLAUDE_BIN'] ?? 'claude', configDir: isolated ? agentHome : null, oauthToken: token, secretPaths: SECRET_PATHS });
}

mkdirSync(home, { recursive: true });
const db = openDatabase(join(home, 'terminus.db'));
const playbooks = new FsPlaybookRegistry(playbooksDir);
console.log(`loaded playbooks: ${playbooks.lifecycles().map((lifecycle) => `${lifecycle.id}@${lifecycle.version}`).join(', ')}`);

const { http, scheduler } = compose(
  {
    apps: new SqliteAppRepository(db),
    epics: new SqliteEpicRepository(db),
    tasks: new SqliteTaskRepository(db),
    runs: new SqliteRunRepository(db),
    decisions: new SqliteDecisionRepository(db),
    transcripts: new JsonlTranscriptStore(join(home, 'runs')),
    workspace: new GitWorkspace(join(home, 'worktrees')),
    agent: agentRunner(env['TERMINUS_AGENT']),
    checks: new ShellCheckRunner(CHECK_TIMEOUT_MS),
    codeHost: new GhCodeHost(),
    scanner: new FsRepoScanner(),
    issues: new GhIssueTracker(),
    playbooks,
    clock: new SystemClock(),
    ids: new RandomIds(),
  },
  {
    version: env['npm_package_version'] ?? '0.0.0',
    baseRef: 'main',
    concurrency: Number(env['TERMINUS_CONCURRENCY'] ?? 2),
    budget: { maxTokens: 400_000, maxTurns: 80 },
    systemPromptAppend: '',
  },
);

setInterval(() => scheduler.tick(), SCHEDULER_INTERVAL_MS).unref();
serve({ fetch: http.fetch, hostname: LOOPBACK, port }, (info) => {
  console.log(`terminus daemon listening on http://${LOOPBACK}:${info.port}`);
});
