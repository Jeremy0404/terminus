import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitVault } from './git-vault.js';

let root: string;
const git = (...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-vault-'));
  git('init', '--quiet');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  writeFileSync(join(root, 'mine.md'), 'draft');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('GitVault', () => {
  it('writes the notes and commits only them, leaving the owner changes alone', () => {
    const vault = new GitVault(root);

    vault.write([{ path: 'Projects/carnet/product/brief.md', content: '# Carnet' }], 'Export carnet brief from Terminus');

    expect(readFileSync(join(root, 'Projects/carnet/product/brief.md'), 'utf8')).toBe('# Carnet');
    expect(git('log', '--format=%s').trim()).toBe('Export carnet brief from Terminus');
    expect(git('status', '--porcelain').trim()).toBe('?? mine.md');
    expect(vault.read('Projects/carnet/product/brief.md')).toBe('# Carnet');
    expect(vault.list('Projects/carnet/product')).toEqual(['Projects/carnet/product/brief.md']);
  });

  it('commits nothing when the notes did not change, and refuses paths outside the vault', () => {
    const vault = new GitVault(root);
    vault.write([{ path: 'a.md', content: 'x' }], 'first');
    vault.write([{ path: 'a.md', content: 'x' }], 'second');

    expect(git('log', '--format=%s').trim()).toBe('first');
    expect(() => vault.write([{ path: '../outside.md', content: 'x' }], 'nope')).toThrow(/escapes the vault/);
  });
});
