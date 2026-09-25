import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../domain/errors.js';
import { GhRepositoryCreator } from './gh-repository-creator.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-found-'));
  for (const [key, value] of Object.entries({ GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' })) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function fakeGh(exitCode: number): string {
  const script = join(root, 'gh');
  writeFileSync(script, `#!/bin/sh\necho "$@" > "${join(root, 'gh-args')}"\n${exitCode === 0 ? '' : 'echo "name already exists on this account" >&2\n'}exit ${exitCode}\n`);
  chmodSync(script, 0o755);
  return script;
}

describe('GhRepositoryCreator', () => {
  it('starts a local repository with a first commit on main, then creates and pushes the GitHub repository', () => {
    const path = join(root, 'carnet');

    new GhRepositoryCreator(fakeGh(0)).create(path, 'carnet', 'private');

    expect(execFileSync('git', ['log', '--format=%s'], { cwd: path, encoding: 'utf8' }).trim()).toBe('chore: start the project');
    expect(execFileSync('git', ['branch', '--show-current'], { cwd: path, encoding: 'utf8' }).trim()).toBe('main');
    expect(readFileSync(join(root, 'gh-args'), 'utf8').trim()).toBe(`repo create carnet --private --source ${path} --remote origin --push`);
  });

  it('refuses a folder that already has files, and reports what GitHub said', () => {
    const busy = join(root, 'busy');
    mkdirSync(busy);
    writeFileSync(join(busy, 'README.md'), 'mine');
    expect(() => new GhRepositoryCreator(fakeGh(0)).create(busy, 'busy', 'private')).toThrow(/already exists and is not empty/);

    expect(() => new GhRepositoryCreator(fakeGh(1)).create(join(root, 'taken'), 'taken', 'public')).toThrow(DomainError);
    expect(() => new GhRepositoryCreator(fakeGh(1)).create(join(root, 'taken2'), 'taken2', 'public')).toThrow(/name already exists on this account/);
  });
});
