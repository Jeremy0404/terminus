import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRunRequest } from '../../application/ports/agent-runner.js';
import { claudeArguments, claudeEnvironment, ClaudeCliRunner, GUARD_SCRIPT, repositorySkills, type AgentProfile } from './claude-cli-runner.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/tool-failure.jsonl', import.meta.url));

const request = (overrides: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
  runId: 'run-1',
  sessionId: '11111111-1111-4111-8111-111111111111',
  resume: false,
  cwd: tmpdir(),
  notesDir: '/home/me/.terminus/tasks/t1',
  prompt: 'Phase: execute',
  systemPromptAppend: 'context pack',
  skill: 'execute-tdd',
  model: null,
  maxTurns: 80,
  outputSchema: null,
  ...overrides,
});

const profile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  configDir: '/home/me/.terminus/agent-home',
  expected: { skills: ['spec', 'plan'], mcpServers: [], plugins: ['agents-md', 'telemetry'] },
  mcpConfig: null,
  ...overrides,
});

const settingsOf = (args: string[]): Record<string, unknown> => JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as Record<string, unknown>;

const INHERITED_BY_AGENT_RUNS = ['CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS', 'CLAUDE_CODE_DISABLE_AUTO_MEMORY'];
let saved: Record<string, string | undefined>;
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-claude-'));
  saved = Object.fromEntries(INHERITED_BY_AGENT_RUNS.map((name) => [name, process.env[name]]));
  for (const name of INHERITED_BY_AGENT_RUNS) delete process.env[name];
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value;
});

function fakeClaude(body: string): string {
  const path = join(root, 'claude');
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const all: AgentEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

describe('claudeArguments', () => {
  it('starts a new session with the notes folder, guard hooks, budget and context', () => {
    const args = claudeArguments(request(), null);
    expect(args.slice(0, 7)).toEqual(['-p', 'Phase: execute', '--output-format', 'stream-json', '--verbose', '--add-dir', '/home/me/.terminus/tasks/t1']);
    expect(args).toEqual(expect.arrayContaining(['--session-id', '11111111-1111-4111-8111-111111111111', '--permission-mode', 'bypassPermissions', '--max-turns', '80', '--append-system-prompt', 'context pack']));
    expect(args).not.toContain('--bare');
    expect(args).not.toContain('--strict-mcp-config');
    const settings = settingsOf(args) as { hooks: { PreToolUse: { hooks: { args: string[] }[] }[] } };
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.args).toEqual([GUARD_SCRIPT]);
  });

  it('resumes a session and passes the model and output schema when set', () => {
    const args = claudeArguments(request({ resume: true, model: 'opus', outputSchema: { type: 'object' } }), null);
    expect(args).toEqual(expect.arrayContaining(['--resume', '11111111-1111-4111-8111-111111111111', '--model', 'opus', '--json-schema', '{"type":"object"}']));
    expect(args).not.toContain('--session-id');
  });

  it('with a profile, ignores repository settings and unlisted MCP servers, and hides unexpected skills', () => {
    const args = claudeArguments(request(), profile({ mcpConfig: { graph: { command: 'graph-mcp' } } }), ['plan', 'plan-write']);
    expect(args).toEqual(expect.arrayContaining(['--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{"graph":{"command":"graph-mcp"}}}']));
    expect(settingsOf(args)['skillOverrides']).toEqual({ design: 'off', doctor: 'off', 'plan-write': 'off' });
  });
});

describe('claudeEnvironment', () => {
  it('isolates the configuration, turns off bundled skills and auto memory, and passes the token', () => {
    const env = claudeEnvironment(request({ cwd: '/wt' }), { binary: 'claude', oauthToken: 'tok', secretPaths: ['~/.ssh'], profile: profile() }, {});
    expect(env).toEqual({
      TERMINUS_WORKTREE: '/wt',
      TERMINUS_NOTES_DIR: '/home/me/.terminus/tasks/t1',
      TERMINUS_SECRET_PATHS: '~/.ssh',
      CLAUDE_CONFIG_DIR: '/home/me/.terminus/agent-home',
      CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_OAUTH_TOKEN: 'tok',
    });
  });

  it('leaves the user configuration alone without a profile', () => {
    const env = claudeEnvironment(request(), { binary: 'claude', oauthToken: null, secretPaths: [], profile: null }, {});
    expect(env['CLAUDE_CONFIG_DIR']).toBeUndefined();
    expect(env['CLAUDE_CODE_DISABLE_BUNDLED_SKILLS']).toBeUndefined();
  });
});

describe('repositorySkills', () => {
  it('lists the skill folders a repository ships in .claude/skills', () => {
    mkdirSync(join(root, '.claude', 'skills', 'plan-write'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'README.md'), '');
    expect(repositorySkills(root)).toEqual(['plan-write']);
    expect(repositorySkills(join(root, 'missing'))).toEqual([]);
  });
});

describe('ClaudeCliRunner', () => {
  it('streams the parsed events of the process with its environment', async () => {
    const binary = fakeClaude(`
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(join(root, 'env.json'))}, JSON.stringify({ cwd: process.cwd(), config: process.env.CLAUDE_CONFIG_DIR, token: process.env.CLAUDE_CODE_OAUTH_TOKEN }));
process.stdout.write(fs.readFileSync(${JSON.stringify(FIXTURE)}, 'utf8'));`);
    const runner = new ClaudeCliRunner({ binary, oauthToken: 'tok', secretPaths: [], profile: null });

    const events = await collect(runner.start(request({ cwd: root })).events);

    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'success' });
    expect(events[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Agent setup') });
    expect(JSON.parse(readFileSync(join(root, 'env.json'), 'utf8'))).toEqual({ cwd: root, token: 'tok' });
  });

  it('stops the process before its first action when the audit finds something unexpected', async () => {
    const binary = fakeClaude(`
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', skills: ['spec', 'brain-access'], mcp_servers: [], plugins: [] }) + '\\n');
setTimeout(() => process.stdout.write(JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf x' } }] } }) + '\\n'), 2000);
setInterval(() => {}, 1000);`);
    const started = Date.now();
    const events = await collect(new ClaudeCliRunner({ binary, oauthToken: null, secretPaths: [], profile: profile() }).start(request({ cwd: root })).events);

    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'isolation-breach', summary: expect.stringContaining('skill brain-access') });
    expect(events.some((event) => event.type === 'tool-call')).toBe(false);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('interrupts with SIGINT and reports the run as interrupted', async () => {
    const binary = fakeClaude(`
process.on('SIGINT', () => {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'stopped' }) + '\\n');
  process.exit(130);
});
process.stdout.write(JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'working' }] } }) + '\\n');
setInterval(() => {}, 1000);`);
    const run = new ClaudeCliRunner({ binary, oauthToken: null, secretPaths: [], profile: null }).start(request({ cwd: root }));
    const events: AgentEvent[] = [];
    for await (const event of run.events) {
      events.push(event);
      if (event.type === 'text') run.interrupt();
    }
    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'interrupted' });
  });

  it('reports why the process died when it never produced a result', async () => {
    const binary = fakeClaude(`process.stderr.write('Invalid API key · Please run /login'); process.exit(1);`);
    const events = await collect(new ClaudeCliRunner({ binary, oauthToken: null, secretPaths: [], profile: null }).start(request({ cwd: root })).events);
    expect(events).toEqual([{ type: 'text', text: 'claude exited with code 1: Invalid API key · Please run /login' }]);
  });
});
