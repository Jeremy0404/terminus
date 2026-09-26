import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { DeployTarget } from '../../application/ports/deploy-target.js';
import { versionOf, type DeployRun, type DeployRunState, type PendingRelease, type PublishedRelease, type ReleaseState } from '../../domain/release.js';

const RELEASE_WORKFLOW = '.github/workflows/release.yml';
const PENDING_LABEL = 'autorelease: pending';
const DEPLOY_JOB = 'deploy';

export class GhReleaseTarget implements DeployTarget {
  constructor(private readonly gh = 'gh') {}

  state(repoPath: string): ReleaseState | null {
    const workflow = join(repoPath, RELEASE_WORKFLOW);
    if (!existsSync(workflow)) return null;
    const deployJob = deployJobName(readFileSync(workflow, 'utf8'));
    return {
      deploysOnRelease: deployJob !== null,
      pending: this.pending(repoPath),
      latest: this.latest(repoPath),
      lastRun: this.lastRun(repoPath, deployJob),
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

  private lastRun(repoPath: string, deployJob: string | null): DeployRun | null {
    const [run] = this.json<{ databaseId: number; status: string; conclusion: string; headBranch: string; createdAt: string; url: string }[]>(repoPath, ['run', 'list', '--workflow', 'release.yml', '--limit', '1', '--json', 'databaseId,status,conclusion,headBranch,createdAt,url']) ?? [];
    const jobs = deployJob && run?.conclusion === 'success' ? this.json<{ jobs: { name: string; conclusion: string }[] }>(repoPath, ['run', 'view', String(run.databaseId), '--json', 'jobs'])?.jobs : [];
    const deploymentVerified = !!deployJob && (jobs?.some((job) => ranAs(job.name, deployJob) && job.conclusion === 'success') ?? false);
    return run ? { deploymentVerified, id: run.databaseId, version: versionOf(run.headBranch), state: runState(run.status, run.conclusion), startedAt: run.createdAt, url: run.url } : null;
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

function deployJobName(workflow: string): string | null {
  try {
    const job: unknown = (parse(workflow) as { jobs?: Record<string, unknown> } | null)?.jobs?.[DEPLOY_JOB];
    if (!job || typeof job !== 'object') return null;
    return 'name' in job && typeof job.name === 'string' ? job.name : DEPLOY_JOB;
  } catch {
    return null;
  }
}

function ranAs(shownName: string, jobName: string): boolean {
  return shownName === jobName || shownName.startsWith(`${jobName} (`);
}

function runState(status: string, conclusion: string): DeployRunState {
  if (status !== 'completed') return status === 'in_progress' ? 'running' : 'queued';
  if (conclusion === 'success') return 'succeeded';
  return conclusion === 'cancelled' ? 'cancelled' : 'failed';
}
