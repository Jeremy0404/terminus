import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitWorkspace } from './git-workspace.js';

let root: string;
let repo: string;
let workspaces: GitWorkspace;

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-git-'));
  repo = join(root, 'repo');
  execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'initial');
  workspaces = new GitWorkspace(join(root, 'worktrees'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('GitWorkspace', () => {
  it('creates one worktree per task on its own branch, and reuses it', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');

    expect(workspace).toEqual({ taskId: 't1', path: join(root, 'worktrees', 'app', 't1'), branch: 'terminus/t1' });
    expect(git(workspace.path, 'branch', '--show-current').trim()).toBe('terminus/t1');
    expect(workspaces.prepare(repo, 'app', 't1', 'main')).toEqual(workspace);
  });

  it('re-attaches an existing task branch after its worktree was removed', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    writeFileSync(join(workspace.path, 'kept.txt'), 'kept\n');
    workspaces.checkpoint(workspace, 1, 'spec');
    workspaces.remove(repo, workspace);

    const again = workspaces.prepare(repo, 'app', 't1', 'main');
    expect(readFileSync(join(again.path, 'kept.txt'), 'utf8')).toBe('kept\n');
  });

  it('records each checkpoint as a commit behind a stable ref, hooks skipped', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(workspace.path, 'spec.md'), 'spec\n');

    const ref = workspaces.checkpoint(workspace, 1, 'spec');

    expect(ref).toBe('refs/terminus/checkpoints/t1/1');
    expect(git(repo, 'show', '--quiet', '--format=%s|%an', ref).trim()).toBe('wip: checkpoint 1 (spec)|terminus');
    expect(git(repo, 'show', `${ref}:spec.md`)).toBe('spec\n');
  });

  it('allows a checkpoint with no changes', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    expect(() => workspaces.checkpoint(workspace, 1, 'grill')).not.toThrow();
  });

  it('rewinds tracked and untracked files to a checkpoint', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    writeFileSync(join(workspace.path, 'code.ts'), 'v1\n');
    const first = workspaces.checkpoint(workspace, 1, 'execute');
    writeFileSync(join(workspace.path, 'code.ts'), 'v2\n');
    workspaces.checkpoint(workspace, 2, 'verify');
    writeFileSync(join(workspace.path, 'scratch.txt'), 'junk\n');

    workspaces.rewind(workspace, first);

    expect(readFileSync(join(workspace.path, 'code.ts'), 'utf8')).toBe('v1\n');
    expect(existsSync(join(workspace.path, 'scratch.txt'))).toBe(false);
  });

  it('diffs committed, staged, unstaged and new files against the base branch', () => {
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    writeFileSync(join(workspace.path, 'committed.ts'), 'a\n');
    workspaces.checkpoint(workspace, 1, 'execute');
    writeFileSync(join(workspace.path, 'staged.ts'), 'b\n');
    git(workspace.path, 'add', 'staged.ts');
    writeFileSync(join(workspace.path, 'README.md'), 'hello again\n');
    writeFileSync(join(workspace.path, 'new.ts'), 'c\n');

    const diff = workspaces.diff(workspace, 'main');

    for (const file of ['committed.ts', 'staged.ts', 'README.md', 'new.ts']) expect(diff).toContain(`b/${file}`);
  });

  it('refuses ids that could escape the worktrees folder', () => {
    expect(() => workspaces.prepare(repo, 'app', '../evil', 'main')).toThrow(/Unsafe path segment/);
  });

  describe('syncing with the base branch', () => {
    const commitOnMain = (file: string, content: string): void => {
      writeFileSync(join(repo, file), content);
      git(repo, 'add', '.');
      git(repo, 'commit', '--quiet', '-m', `main: ${file}`);
    };

    it('reports a branch that already contains the base', () => {
      const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
      expect(workspaces.syncWithBase(workspace, 'main')).toEqual({ state: 'up-to-date', base: 'main', conflicts: [] });
      expect(workspaces.isBehindBase(workspace, 'main')).toBe(false);
    });

    it('merges new base commits, committing pending work first', () => {
      const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
      writeFileSync(join(workspace.path, 'feature.ts'), 'feature\n');
      commitOnMain('other.ts', 'other\n');
      expect(workspaces.isBehindBase(workspace, 'main')).toBe(true);

      expect(workspaces.syncWithBase(workspace, 'main')).toEqual({ state: 'merged', base: 'main', conflicts: [] });

      expect(readFileSync(join(workspace.path, 'other.ts'), 'utf8')).toBe('other\n');
      expect(readFileSync(join(workspace.path, 'feature.ts'), 'utf8')).toBe('feature\n');
      expect(git(workspace.path, 'status', '--porcelain')).toBe('');
      expect(workspaces.isBehindBase(workspace, 'main')).toBe(false);
    });

    it('stops on conflicts, then concludes the merge once they are resolved', () => {
      const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
      writeFileSync(join(workspace.path, 'README.md'), 'hello from the task\n');
      workspaces.checkpoint(workspace, 1, 'execute');
      commitOnMain('README.md', 'hello from main\n');

      expect(workspaces.syncWithBase(workspace, 'main')).toEqual({ state: 'conflicts', base: 'main', conflicts: ['README.md'] });
      expect(workspaces.syncWithBase(workspace, 'main').state).toBe('conflicts');

      writeFileSync(join(workspace.path, 'README.md'), 'hello from main and the task\n');
      git(workspace.path, 'add', 'README.md');
      expect(workspaces.syncWithBase(workspace, 'main')).toEqual({ state: 'merged', base: 'main', conflicts: [] });
      expect(git(workspace.path, 'log', '-1', '--format=%P').trim().split(' ')).toHaveLength(2);
      expect(workspaces.isBehindBase(workspace, 'main')).toBe(false);
    });

    it('starts new worktrees from the up-to-date remote base, not a stale local main', () => {
      const remote = join(root, 'remote.git');
      execFileSync('git', ['clone', '--quiet', '--bare', repo, remote]);
      git(repo, 'remote', 'add', 'origin', remote);
      git(repo, 'fetch', '--quiet', 'origin');
      const other = join(root, 'other');
      execFileSync('git', ['clone', '--quiet', remote, other]);
      writeFileSync(join(other, 'remote-only.ts'), 'from the remote\n');
      git(other, 'add', '.');
      git(other, '-c', 'user.name=o', '-c', 'user.email=o@o', 'commit', '--quiet', '-m', 'remote work');
      git(other, 'push', '--quiet', 'origin', 'main');

      const workspace = workspaces.prepare(repo, 'app', 't2', 'main');

      expect(readFileSync(join(workspace.path, 'remote-only.ts'), 'utf8')).toBe('from the remote\n');
      expect(workspaces.syncWithBase(workspace, 'main')).toEqual({ state: 'up-to-date', base: 'origin/main', conflicts: [] });
    });
  });
});
