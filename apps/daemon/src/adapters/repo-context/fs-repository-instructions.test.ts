import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsRepositoryInstructions } from './fs-repository-instructions.js';

let root: string;
let repo: string;
let worktree: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-instructions-'));
  repo = join(root, 'repo');
  worktree = join(root, 'worktree');
  mkdirSync(repo);
  mkdirSync(worktree);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('FsRepositoryInstructions', () => {
  it('passes on local instruction files that the worktree does not have', () => {
    writeFileSync(join(repo, 'CLAUDE.md'), 'Domain code has zero framework imports.');
    expect(new FsRepositoryInstructions().localOnly(repo, worktree)).toBe(
      '# Repository instructions (CLAUDE.md, kept outside git, so absent from your working copy)\n\nDomain code has zero framework imports.',
    );
  });

  it('skips files already in the worktree, which Claude Code reads itself', () => {
    writeFileSync(join(repo, 'AGENTS.md'), 'tracked');
    writeFileSync(join(worktree, 'AGENTS.md'), 'tracked');
    expect(new FsRepositoryInstructions().localOnly(repo, worktree)).toBe('');
  });
});
