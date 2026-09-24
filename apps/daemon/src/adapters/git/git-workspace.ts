import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { SyncResult, TaskWorkspace, Workspace } from '../../application/ports/workspace.js';

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
    const start = branchExists ? null : upToDateBase(repoPath, baseRef);
    git(repoPath, start === null ? ['worktree', 'add', workspace.path, workspace.branch] : ['worktree', 'add', '-b', workspace.branch, workspace.path, start]);
    return workspace;
  }

  syncWithBase(workspace: TaskWorkspace, baseRef: string): SyncResult {
    const cwd = workspace.path;
    const base = upToDateBase(cwd, baseRef);
    if (mergeInProgress(cwd)) {
      const conflicts = unmergedFiles(cwd);
      if (conflicts.length > 0) return { state: 'conflicts', base, conflicts };
      git(cwd, ['commit', '--no-edit', '--no-verify', '--quiet'], CHECKPOINT_IDENTITY);
      return { state: 'merged', base, conflicts: [] };
    }
    if (isAncestor(cwd, base, 'HEAD')) return { state: 'up-to-date', base, conflicts: [] };
    if (git(cwd, ['status', '--porcelain']).trim()) {
      git(cwd, ['add', '--all']);
      git(cwd, ['commit', '--no-verify', '--quiet', '-m', 'wip: before syncing with base'], CHECKPOINT_IDENTITY);
    }
    try {
      git(cwd, ['merge', '--no-edit', '--no-verify', '--quiet', base], CHECKPOINT_IDENTITY);
      return { state: 'merged', base, conflicts: [] };
    } catch (error) {
      const conflicts = unmergedFiles(cwd);
      if (conflicts.length > 0) return { state: 'conflicts', base, conflicts };
      throw error;
    }
  }

  isBehindBase(workspace: TaskWorkspace, baseRef: string): boolean {
    return !isAncestor(workspace.path, upToDateBase(workspace.path, baseRef), 'HEAD');
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

function upToDateBase(cwd: string, baseRef: string): string {
  if (tryGit(cwd, ['remote', 'get-url', 'origin']) === null) return baseRef;
  tryGit(cwd, ['fetch', '--quiet', 'origin', baseRef]);
  return tryGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseRef}`]) === null ? baseRef : `origin/${baseRef}`;
}

function mergeInProgress(cwd: string): boolean {
  return existsSync(resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'MERGE_HEAD']).trim()));
}

function unmergedFiles(cwd: string): string[] {
  return git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter((file) => file.length > 0);
}

function isAncestor(cwd: string, ancestor: string, descendant: string): boolean {
  return tryGit(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
}

function tryGit(cwd: string, args: readonly string[]): string | null {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function safe(segment: string): string {
  if (!SAFE_SEGMENT.test(segment)) throw new Error(`Unsafe path segment: ${segment}`);
  return segment;
}

function git(cwd: string, args: readonly string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
}
