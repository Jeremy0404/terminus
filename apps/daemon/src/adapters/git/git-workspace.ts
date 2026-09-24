import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TaskWorkspace, Workspace } from '../../application/ports/workspace.js';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const CHECKPOINT_IDENTITY = {
  GIT_AUTHOR_NAME: 'terminus',
  GIT_AUTHOR_EMAIL: 'terminus@localhost',
  GIT_COMMITTER_NAME: 'terminus',
  GIT_COMMITTER_EMAIL: 'terminus@localhost',
};

export class GitWorkspace implements Workspace {
  constructor(private readonly worktreesRoot: string) {}

  prepare(repoPath: string, appId: string, taskId: string, baseRef: string): TaskWorkspace {
    const workspace = { taskId, path: join(this.worktreesRoot, safe(appId), safe(taskId)), branch: `terminus/${safe(taskId)}` };
    if (existsSync(workspace.path)) return workspace;
    mkdirSync(dirname(workspace.path), { recursive: true });
    const branchExists = git(repoPath, ['branch', '--list', workspace.branch]).trim().length > 0;
    git(repoPath, branchExists ? ['worktree', 'add', workspace.path, workspace.branch] : ['worktree', 'add', '-b', workspace.branch, workspace.path, baseRef]);
    return workspace;
  }

  checkpoint(workspace: TaskWorkspace, sequence: number, label: string): string {
    const ref = `refs/terminus/checkpoints/${safe(workspace.taskId)}/${sequence}`;
    git(workspace.path, ['add', '--all']);
    git(workspace.path, ['commit', '--allow-empty', '--no-verify', '--quiet', '-m', `wip: checkpoint ${sequence} (${label})`], CHECKPOINT_IDENTITY);
    git(workspace.path, ['update-ref', ref, 'HEAD']);
    return ref;
  }

  rewind(workspace: TaskWorkspace, checkpointRef: string): void {
    git(workspace.path, ['reset', '--hard', '--quiet', checkpointRef]);
    git(workspace.path, ['clean', '-fd', '--quiet']);
  }

  diff(workspace: TaskWorkspace, baseRef: string): string {
    git(workspace.path, ['add', '--all', '--intent-to-add']);
    const mergeBase = git(workspace.path, ['merge-base', baseRef, 'HEAD']).trim();
    return git(workspace.path, ['diff', mergeBase, '--', '.']);
  }

  remove(repoPath: string, workspace: TaskWorkspace): void {
    if (existsSync(workspace.path)) git(repoPath, ['worktree', 'remove', '--force', workspace.path]);
    git(repoPath, ['worktree', 'prune']);
  }
}

function safe(segment: string): string {
  if (!SAFE_SEGMENT.test(segment)) throw new Error(`Unsafe path segment: ${segment}`);
  return segment;
}

function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
