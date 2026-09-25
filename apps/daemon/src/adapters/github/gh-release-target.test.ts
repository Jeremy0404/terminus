import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GhReleaseTarget } from './gh-release-target.js';

let root: string;
let repo: string;

function fakeGh(responses: Record<string, string>): string {
  const script = join(root, 'gh');
  const cases = Object.entries(responses)
    .map(([command, json]) => `  "${command}") echo '${json}' ;;`)
    .join('\n');
  writeFileSync(script, `#!/bin/sh\ncase "$1 $2" in\n${cases}\n  *) exit 1 ;;\nesac\n`);
  chmodSync(script, 0o755);
  return script;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'terminus-release-'));
  repo = join(root, 'repo');
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('GhReleaseTarget', () => {
  it('reads the pending release, the latest one and the last release run', () => {
    writeFileSync(join(repo, '.github/workflows/release.yml'), 'jobs:\n  build:\n    runs-on: x\n  deploy:\n    needs: build\n');
    const gh = fakeGh({
      'pr list': '[{"number":87,"title":"chore(main): release 1.0.0","url":"https://github.com/o/r/pull/87","body":"Features"}]',
      'release view': '{"tagName":"v0.2.0","publishedAt":"2026-08-10T16:54:07Z","url":"https://github.com/o/r/releases/tag/v0.2.0"}',
      'run list': '[{"databaseId":31,"status":"completed","conclusion":"success","headBranch":"v0.2.0","createdAt":"2026-08-10T16:54:10Z","url":"https://github.com/o/r/actions/runs/31"}]',
    });

    expect(new GhReleaseTarget(gh).state(repo)).toEqual({
      deploysOnRelease: true,
      pending: { number: 87, version: '1.0.0', title: 'chore(main): release 1.0.0', url: 'https://github.com/o/r/pull/87', notes: 'Features' },
      latest: { version: '0.2.0', publishedAt: '2026-08-10T16:54:07Z', url: 'https://github.com/o/r/releases/tag/v0.2.0' },
      lastRun: { id: 31, version: '0.2.0', state: 'succeeded', startedAt: '2026-08-10T16:54:10Z', url: 'https://github.com/o/r/actions/runs/31' },
    });
  });

  it('has nothing to say without a release workflow, and tolerates a repository with no release yet', () => {
    expect(new GhReleaseTarget(fakeGh({})).state(repo)).toBeNull();
    writeFileSync(join(repo, '.github/workflows/release.yml'), 'jobs:\n  build:\n    runs-on: x\n');
    expect(new GhReleaseTarget(fakeGh({ 'pr list': '[]', 'run list': '[]' })).state(repo)).toEqual({ deploysOnRelease: false, pending: null, latest: null, lastRun: null });
  });
});
