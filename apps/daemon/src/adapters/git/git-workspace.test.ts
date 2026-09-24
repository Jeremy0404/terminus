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
});
