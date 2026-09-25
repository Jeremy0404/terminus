import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeployTarget } from '../../application/ports/deploy-target.js';
import { versionOf, type DeployRun, type DeployRunState, type PendingRelease, type PublishedRelease, type ReleaseState } from '../../domain/release.js';

const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const PENDING_LABEL = 'autorelease: pending';

export class GhReleaseTarget implements DeployTarget {
  constructor(private readonly gh = 'gh') {}

  state(repoPath: string): ReleaseState | null {
    const workflow = join(repoPath, RELEASE_WORKFLOW);
    if (!existsSync(workflow)) return null;
    return {
      deploysOnRelease: /^ {2}deploy:/m.test(readFileSync(workflow, 'utf8')),
      pending: this.pending(repoPath),
      latest: this.latest(repoPath),
      lastRun: this.lastRun(repoPath),
    };
  }

  private pending(repoPath: string): PendingRelease | null {
    const [open] = this.json<{ number: number; title: string; url: string; body: string }[]>(repoPath, ['pr', 'list', '--state', 'open', '--label', PENDING_LABEL, '--json', 'number,title,url,body', '--limit', '1']) ?? [];
    return open ? { number: open.number, version: versionOf(open.title), title: open.title, url: open.url, notes: open.body } : null;
  }

  private latest(repoPath: string): PublishedRelease | null {
    const release = this.json<{ tagName: string; publishedAt: string; url: string }>(repoPath, ['release', 'view', '--json', 'tagName,publishedAt,url']);
    return release ? { version: versionOf(release.tagName) ?? release.tagName, publishedAt: release.publishedAt, url: release.url } : null;
  }

  private lastRun(repoPath: string): DeployRun | null {
    const [run] = this.json<{ databaseId: number; status: string; conclusion: string; headBranch: string; createdAt: string; url: string }[]>(repoPath, ['run', 'list', '--workflow', 'release.yml', '--limit', '1', '--json', 'databaseId,status,conclusion,headBranch,createdAt,url']) ?? [];
    return run ? { id: run.databaseId, version: versionOf(run.headBranch), state: runState(run.status, run.conclusion), startedAt: run.createdAt, url: run.url } : null;
  }

  private json<T>(repoPath: string, args: readonly string[]): T | null {
    try {
      const output = execFileSync(this.gh, args, { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      return output ? (JSON.parse(output) as T) : null;
    } catch {
      return null;
    }
  }
}

function runState(status: string, conclusion: string): DeployRunState {
  if (status !== 'completed') return status === 'in_progress' ? 'running' : 'queued';
  if (conclusion === 'success') return 'succeeded';
  return conclusion === 'cancelled' ? 'cancelled' : 'failed';
}
