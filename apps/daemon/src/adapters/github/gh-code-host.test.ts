import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitWorkspace } from '../git/git-workspace.js';
import { GhCodeHost } from './gh-code-host.js';

let root: string;
let repo: string;
let remote: string;
let ghLog: string;
let gh: string;

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

function fakeGh(responses: Record<string, { stdout: string; exit?: number }>): GhCodeHost {
  const table = JSON.stringify(responses);
  writeFileSync(
    gh,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(ghLog)}, JSON.stringify(args) + '\\n');
const table = ${table};
const key = args.slice(0, 2).join(' ');
const hit = table[key] ?? { stdout: '' };
process.stdout.write(hit.stdout);
process.exit(hit.exit ?? 0);
`,
  );
  chmodSync(gh, 0o755);
  return new GhCodeHost(gh);
}

const ghCalls = (): string[][] => readFileSync(ghLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-gh-'));
  remote = join(root, 'remote.git');
  repo = join(root, 'repo');
  ghLog = join(root, 'gh.log');
  gh = join(root, 'gh');
  writeFileSync(ghLog, '');
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
  execFileSync('git', ['clone', '--quiet', remote, repo]);
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '-m', 'initial');
  git(repo, 'push', '--quiet', 'origin', 'main');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('GhCodeHost', () => {
  it('pushes the task branch and opens a pull request when none is open', () => {
    const workspaces = new GitWorkspace(join(root, 'worktrees'));
    const workspace = workspaces.prepare(repo, 'app', 't1', 'main');
    writeFileSync(join(workspace.path, 'feature.ts'), 'export {};\n');
    workspaces.checkpoint(workspace, 1, 'merge');
    const host = fakeGh({
      'pr list': { stdout: '[]' },
      'pr view': { stdout: '{"number":12,"url":"https://github.com/o/r/pull/12"}' },
    });

    const pullRequest = host.publish(workspace, 'main', 'feat: add feature', 'Body');

    expect(pullRequest).toEqual({ number: 12, url: 'https://github.com/o/r/pull/12' });
    expect(git(remote, 'log', '--format=%s', '-1', 'terminus/t1').trim()).toBe('wip: checkpoint 1 (merge)');
    expect(ghCalls().map((args) => args.slice(0, 2).join(' '))).toEqual(['pr list', 'pr create', 'pr view']);
    expect(ghCalls()[1]).toEqual(['pr', 'create', '--head', 'terminus/t1', '--base', 'main', '--title', 'feat: add feature', '--body', 'Body']);
  });

  it('updates the open pull request instead of creating another one', () => {
    const workspace = new GitWorkspace(join(root, 'worktrees')).prepare(repo, 'app', 't1', 'main');
    const host = fakeGh({ 'pr list': { stdout: '[{"number":7,"url":"u7"}]' } });

    expect(host.publish(workspace, 'main', 'feat: again', 'Body 2')).toEqual({ number: 7, url: 'u7' });
    expect(ghCalls()[1]).toEqual(['pr', 'edit', '7', '--title', 'feat: again', '--body', 'Body 2']);
  });

  it.each([
    ['[]', 0, 'none'],
    ['[{"state":"SUCCESS"},{"state":"SKIPPED"}]', 0, 'success'],
    ['[{"state":"SUCCESS"},{"state":"IN_PROGRESS"}]', 8, 'pending'],
    ['[{"state":"SUCCESS"},{"state":"FAILURE"}]', 1, 'failure'],
  ])('reads checks %s (exit %i) as %s', (stdout, exit, expected) => {
    expect(fakeGh({ 'pr checks': { stdout, exit } }).checks(repo, 3)).toBe(expected);
  });

  it('squash-merges the pull request', () => {
    fakeGh({}).merge(repo, 9);
    expect(ghCalls()).toEqual([['pr', 'merge', '9', '--squash']]);
  });
});
