import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { AgentEvent, AgentRun, AgentRunner, AgentRunRequest } from '../../application/ports/agent-runner.js';
import { ClaudeStreamParser } from './stream-parser.js';

export const GUARD_SCRIPT = fileURLToPath(new URL('../../../hooks/guard.mjs', import.meta.url));
const GUARDED_TOOLS = 'Bash|Edit|Write|MultiEdit|NotebookEdit|Read|Grep|Glob';
const STDERR_TAIL_CHARS = 2000;

export interface ClaudeCliOptions {
  readonly binary: string;
  readonly configDir: string | null;
  readonly oauthToken: string | null;
  readonly secretPaths: readonly string[];
}

export function claudeArguments(request: AgentRunRequest): string[] {
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: GUARDED_TOOLS, hooks: [{ type: 'command', command: process.execPath, args: [GUARD_SCRIPT] }] }],
    },
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
  if (options.configDir) env['CLAUDE_CONFIG_DIR'] = options.configDir;
  if (options.oauthToken) env['CLAUDE_CODE_OAUTH_TOKEN'] = options.oauthToken;
  return env;
}

export class ClaudeCliRunner implements AgentRunner {
  constructor(private readonly options: ClaudeCliOptions) {}

  start(request: AgentRunRequest): AgentRun {
    const parser = new ClaudeStreamParser();
    const child = spawn(this.options.binary, claudeArguments(request), {
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
        for await (const line of lines) yield* parser.push(line);
        const code = await exited;
        if (!parser.hasFinished && stderr.trim()) {
          yield { type: 'text', text: `claude exited with code ${String(code)}: ${stderr.trim()}` };
        }
      })(),
    };
  }
}
