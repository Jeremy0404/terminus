import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsRepoScanner } from './fs-repo-scanner.js';

let repo: string;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'terminus-scan-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('FsRepoScanner', () => {
  it('reads a pnpm project: checks from its scripts, CI, agent docs, TODOs and git state', () => {
    execFileSync('git', ['init', '--quiet', '--initial-branch=main', repo]);
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', lint: 'eslint .', test: 'vitest run', build: 'vite build' } }));
    writeFileSync(join(repo, 'pnpm-lock.yaml'), '');
    writeFileSync(join(repo, 'CLAUDE.md'), '# rules');
    mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(repo, '.github', 'workflows', 'ci.yml'), 'name: CI');
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'export {};\n// TODO: handle the empty list\n');
    git('add', '.');

    expect(new FsRepoScanner().scan(repo)).toEqual({
      repoPath: repo,
      name: repo.split('/').at(-1),
      isGitRepo: true,
      hasOrigin: false,
      defaultBranch: 'main',
      packageManager: 'pnpm',
      ciWorkflows: ['ci.yml'],
      agentDocs: ['CLAUDE.md'],
      suggestedVerification: [
        { name: 'lint', command: 'pnpm run lint' },
        { name: 'test', command: 'pnpm run test' },
        { name: 'build', command: 'pnpm run build' },
      ],
      todos: [{ file: 'src/a.ts', line: 2, text: '// TODO: handle the empty list' }],
    });
  });

  it('suggests the standard checks of a Go module and handles a folder that is not a repository', () => {
    writeFileSync(join(repo, 'go.mod'), 'module example.com/x');
    const scan = new FsRepoScanner().scan(repo);
    expect(scan).toMatchObject({ isGitRepo: false, hasOrigin: false, defaultBranch: null, packageManager: 'go', todos: [] });
    expect(scan.suggestedVerification.map((check) => check.command)).toEqual(['go vet ./...', 'go test ./...', 'go build ./...']);
  });

  it('refuses a path that does not exist', () => {
    expect(() => new FsRepoScanner().scan(join(repo, 'missing'))).toThrow(/does not exist/);
  });
});
