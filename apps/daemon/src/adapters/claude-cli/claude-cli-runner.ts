import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { AgentEvent, AgentRun, AgentRunner, AgentRunRequest } from '../../application/ports/agent-runner.js';
import { ClaudeStreamParser, type ExpectedAgentSetup } from './stream-parser.js';

export const GUARD_SCRIPT = fileURLToPath(new URL('../../../hooks/guard.mjs', import.meta.url));
export const BUILTIN_PLUGINS = ['agents-md', 'telemetry'];
const HIDDEN_ACCOUNT_SKILLS = ['design', 'doctor'];
const GUARDED_TOOLS = 'Bash|Edit|Write|MultiEdit|NotebookEdit|Read|Grep|Glob';
const STDERR_TAIL_CHARS = 2000;

export interface AgentProfile {
  readonly configDir: string;
  readonly expected: ExpectedAgentSetup;
  readonly mcpConfig: Record<string, unknown> | null;
}

export interface ClaudeCliOptions {
  readonly binary: string;
  readonly oauthToken: string | null;
  readonly secretPaths: readonly string[];
  readonly profile: AgentProfile | null;
}

export function claudeArguments(request: AgentRunRequest, profile: AgentProfile | null, repositorySkills: readonly string[] = []): string[] {
  const hidden = profile ? [...HIDDEN_ACCOUNT_SKILLS, ...repositorySkills.filter((name) => !profile.expected.skills.includes(name))] : [];
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: GUARDED_TOOLS, hooks: [{ type: 'command', command: process.execPath, args: [GUARD_SCRIPT] }] }],
    },
    ...(hidden.length > 0 ? { skillOverrides: Object.fromEntries(hidden.map((name) => [name, 'off'])) } : {}),
  };
  return [
    '-p',
    request.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--add-dir',
    request.notesDir,
    ...(request.resume ? ['--resume', request.sessionId] : ['--session-id', request.sessionId]),
    '--permission-mode',
    'bypassPermissions',
    '--max-turns',
    String(request.maxTurns),
    '--settings',
    JSON.stringify(settings),
    ...(profile ? ['--setting-sources', 'user', '--strict-mcp-config'] : []),
    ...(profile?.mcpConfig ? ['--mcp-config', JSON.stringify({ mcpServers: profile.mcpConfig })] : []),
    ...(request.systemPromptAppend ? ['--append-system-prompt', request.systemPromptAppend] : []),
    ...(request.model ? ['--model', request.model] : []),
    ...(request.outputSchema ? ['--json-schema', JSON.stringify(request.outputSchema)] : []),
  ];
}

export function claudeEnvironment(request: AgentRunRequest, options: ClaudeCliOptions, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    TERMINUS_WORKTREE: request.cwd,
    TERMINUS_NOTES_DIR: request.notesDir,
    TERMINUS_SECRET_PATHS: options.secretPaths.join(':'),
  };
  if (options.profile) {
    env['CLAUDE_CONFIG_DIR'] = options.profile.configDir;
    env['CLAUDE_CODE_DISABLE_BUNDLED_SKILLS'] = '1';
    env['CLAUDE_CODE_DISABLE_AUTO_MEMORY'] = '1';
  }
  if (options.oauthToken) env['CLAUDE_CODE_OAUTH_TOKEN'] = options.oauthToken;
  return env;
}

export function repositorySkills(worktree: string): string[] {
  const directory = join(worktree, '.claude', 'skills');
  return existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];
}

export class ClaudeCliRunner implements AgentRunner {
  constructor(private readonly options: ClaudeCliOptions) {}

  start(request: AgentRunRequest): AgentRun {
    const parser = new ClaudeStreamParser(this.options.profile?.expected ?? null);
    const child = spawn(this.options.binary, claudeArguments(request, this.options.profile, repositorySkills(request.cwd)), {
      cwd: request.cwd,
      env: claudeEnvironment(request, this.options, process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_CHARS);
    });
    const exited = new Promise<number | null>((resolve) => {
      child.on('close', resolve);
      child.on('error', (error) => {
        stderr += String(error);
        resolve(null);
      });
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

    return {
      interrupt: () => {
        parser.markInterrupted();
        child.kill('SIGINT');
      },
      events: (async function* (): AsyncGenerator<AgentEvent> {
        for await (const line of lines) {
          yield* parser.push(line);
          if (parser.hasBreached) {
            child.kill('SIGTERM');
            lines.close();
            return;
          }
        }
        const code = await exited;
        if (!parser.hasFinished && stderr.trim()) {
          yield { type: 'text', text: `claude exited with code ${String(code)}: ${stderr.trim()}` };
        }
      })(),
    };
  }
}
