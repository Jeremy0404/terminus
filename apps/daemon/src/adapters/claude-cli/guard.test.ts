import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { GUARD_SCRIPT } from './claude-cli-runner.js';

const WORKTREE = '/home/me/.terminus/worktrees/app/t1';

function guard(tool: string, toolInput: Record<string, unknown>): { code: number | null; reason: string } {
  const result = spawnSync(process.execPath, [GUARD_SCRIPT], {
    input: JSON.stringify({ cwd: WORKTREE, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: toolInput }),
    env: { ...process.env, TERMINUS_WORKTREE: WORKTREE, TERMINUS_NOTES_DIR: '/home/me/.terminus/tasks/t1', TERMINUS_SECRET_PATHS: '~/.ssh:/etc/prod-secrets' },
    encoding: 'utf8',
  });
  return { code: result.status, reason: result.stderr };
}

describe('guard hook', () => {
  it('lets the agent work freely inside its worktree', () => {
    expect(guard('Edit', { file_path: `${WORKTREE}/src/a.ts` }).code).toBe(0);
    expect(guard('Write', { file_path: 'src/new.ts' }).code).toBe(0);
    expect(guard('Bash', { command: 'pnpm test && git commit -am wip' }).code).toBe(0);
    expect(guard('Read', { file_path: '/usr/share/doc/readme' }).code).toBe(0);
  });

  it('lets the agent write its notes outside the repository', () => {
    expect(guard('Write', { file_path: '/home/me/.terminus/tasks/t1/spec.md' }).code).toBe(0);
    expect(guard('Write', { file_path: '/home/me/.terminus/tasks/t2/spec.md' }).code).toBe(2);
  });

  it('blocks writes outside the worktree', () => {
    const result = guard('Write', { file_path: '/home/me/.bashrc' });
    expect(result.code).toBe(2);
    expect(result.reason).toContain('outside the task worktree');
    expect(guard('Edit', { file_path: `${WORKTREE}/../t2/a.ts` }).code).toBe(2);
  });

  it('blocks pushing, however it is spelled', () => {
    for (const command of ['git push', 'git push --force origin main', 'cd x && git -C . push', 'git   push']) {
      expect(guard('Bash', { command }).code, command).toBe(2);
    }
    expect(guard('Bash', { command: 'git pull' }).code).toBe(0);
  });

  it('blocks protected secret paths for reads, writes and commands', () => {
    expect(guard('Read', { file_path: `${homedir()}/.ssh/id_ed25519` }).code).toBe(2);
    expect(guard('Read', { file_path: '~/.ssh/config' }).code).toBe(2);
    expect(guard('Bash', { command: 'cat /etc/prod-secrets/db' }).code).toBe(2);
    expect(guard('Bash', { command: 'ls ~/.ssh' }).code).toBe(2);
  });
});
