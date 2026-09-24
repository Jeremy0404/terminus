import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRunRequest } from '../../application/ports/agent-runner.js';
import { claudeArguments, ClaudeCliRunner, GUARD_SCRIPT } from './claude-cli-runner.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/tool-failure.jsonl', import.meta.url));

const request = (overrides: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
  runId: 'run-1',
  sessionId: '11111111-1111-4111-8111-111111111111',
  resume: false,
  cwd: tmpdir(),
  prompt: 'Phase: execute',
  systemPromptAppend: 'context pack',
  skill: 'execute-tdd',
  model: null,
  maxTurns: 80,
  outputSchema: null,
  ...overrides,
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-claude-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

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
  it('starts a new session with the guard hooks, budget and context', () => {
    const args = claudeArguments(request());
    expect(args.slice(0, 5)).toEqual(['-p', 'Phase: execute', '--output-format', 'stream-json', '--verbose']);
    expect(args).toEqual(expect.arrayContaining(['--session-id', '11111111-1111-4111-8111-111111111111', '--permission-mode', 'bypassPermissions', '--max-turns', '80', '--append-system-prompt', 'context pack']));
    expect(args).not.toContain('--bare');
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as { hooks: { PreToolUse: { hooks: { args: string[] }[] }[] } };
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.args).toEqual([GUARD_SCRIPT]);
  });

  it('resumes a session and passes the model and output schema when set', () => {
    const args = claudeArguments(request({ resume: true, model: 'opus', outputSchema: { type: 'object' } }));
    expect(args).toEqual(expect.arrayContaining(['--resume', '11111111-1111-4111-8111-111111111111', '--model', 'opus', '--json-schema', '{"type":"object"}']));
    expect(args).not.toContain('--session-id');
  });
});

describe('ClaudeCliRunner', () => {
  it('streams the parsed events of the process, isolated and authenticated through its environment', async () => {
    const binary = fakeClaude(`
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(join(root, 'env.json'))}, JSON.stringify({ cwd: process.cwd(), config: process.env.CLAUDE_CONFIG_DIR, token: process.env.CLAUDE_CODE_OAUTH_TOKEN, worktree: process.env.TERMINUS_WORKTREE, secrets: process.env.TERMINUS_SECRET_PATHS }));
process.stdout.write(fs.readFileSync(${JSON.stringify(FIXTURE)}, 'utf8'));`);
    const runner = new ClaudeCliRunner({ binary, configDir: '/home/me/.terminus/agent-home', oauthToken: 'tok', secretPaths: ['~/.ssh'] });

    const events = await collect(runner.start(request({ cwd: root })).events);

    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'success' });
    expect(events.some((event) => event.type === 'tool-failure')).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'env.json'), 'utf8'))).toEqual({ cwd: root, config: '/home/me/.terminus/agent-home', token: 'tok', worktree: root, secrets: '~/.ssh' });
  });

  it('interrupts with SIGINT and reports the run as interrupted', async () => {
    const binary = fakeClaude(`
process.on('SIGINT', () => {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'stopped' }) + '\\n');
  process.exit(130);
});
process.stdout.write(JSON.stringify({ type: 'assistant', message: { id: 'm1', content: [{ type: 'text', text: 'working' }] } }) + '\\n');
setInterval(() => {}, 1000);`);
    const run = new ClaudeCliRunner({ binary, configDir: null, oauthToken: null, secretPaths: [] }).start(request({ cwd: root }));
    const events: AgentEvent[] = [];
    for await (const event of run.events) {
      events.push(event);
      if (event.type === 'text') run.interrupt();
    }
    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'interrupted' });
  });

  it('reports why the process died when it never produced a result', async () => {
    const binary = fakeClaude(`process.stderr.write('Invalid API key · Please run /login'); process.exit(1);`);
    const events = await collect(new ClaudeCliRunner({ binary, configDir: null, oauthToken: null, secretPaths: [] }).start(request({ cwd: root })).events);
    expect(events).toEqual([{ type: 'text', text: 'claude exited with code 1: Invalid API key · Please run /login' }]);
  });
});
