import { execFileSync } from 'node:child_process';
import type { ChecksState, CodeHost, PullRequest } from '../../application/ports/code-host.js';
import type { TaskWorkspace } from '../../application/ports/workspace.js';

const FAILED_STATES = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
const PASSED_STATES = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

export class GhCodeHost implements CodeHost {
  constructor(private readonly gh = 'gh') {}

  publish(workspace: TaskWorkspace, baseBranch: string, title: string, body: string): PullRequest {
    run('git', workspace.path, ['push', '--quiet', '--force-with-lease', '-u', 'origin', workspace.branch]);
    const existing = JSON.parse(
      run(this.gh, workspace.path, ['pr', 'list', '--head', workspace.branch, '--state', 'open', '--json', 'number,url', '--limit', '1']),
    ) as PullRequest[];
    const [open] = existing;
    if (open) {
      run(this.gh, workspace.path, ['pr', 'edit', String(open.number), '--title', title, '--body', body]);
      return open;
    }
    run(this.gh, workspace.path, ['pr', 'create', '--head', workspace.branch, '--base', baseBranch, '--title', title, '--body', body]);
    return JSON.parse(run(this.gh, workspace.path, ['pr', 'view', workspace.branch, '--json', 'number,url'])) as PullRequest;
  }

  checks(repoPath: string, pullRequest: number): ChecksState {
    const output = run(this.gh, repoPath, ['pr', 'checks', String(pullRequest), '--json', 'state'], { allowFailure: true });
    const states = (output.trim() ? (JSON.parse(output) as { state: string }[]) : []).map((check) => check.state);
    if (states.length === 0) return 'none';
    if (states.some((state) => FAILED_STATES.has(state))) return 'failure';
    return states.every((state) => PASSED_STATES.has(state)) ? 'success' : 'pending';
  }

  merge(repoPath: string, pullRequest: number): void {
    run(this.gh, repoPath, ['pr', 'merge', String(pullRequest), '--squash']);
  }
}

function run(binary: string, cwd: string, args: readonly string[], options: { allowFailure?: boolean } = {}): string {
  try {
    return execFileSync(binary, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;
    if (options.allowFailure && typeof stdout === 'string') return stdout;
    throw error;
  }
}
