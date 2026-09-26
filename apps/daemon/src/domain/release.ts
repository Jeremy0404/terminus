export interface PendingRelease {
  readonly number: number;
  readonly version: string | null;
  readonly title: string;
  readonly url: string;
  readonly notes: string;
}

export interface PublishedRelease {
  readonly version: string;
  readonly publishedAt: string;
  readonly url: string;
}

export type DeployRunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DeployRun {
  readonly deploymentVerified?: boolean;
  readonly id: number;
  readonly version: string | null;
  readonly state: DeployRunState;
  readonly startedAt: string;
  readonly url: string;
}

export interface ReleaseState {
  readonly deploysOnRelease: boolean;
  readonly pending: PendingRelease | null;
  readonly latest: PublishedRelease | null;
  readonly lastRun: DeployRun | null;
}

export function versionOf(text: string): string | null {
  return /\bv?(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/.exec(text)?.[1] ?? null;
}

export type DeploymentState = 'requested' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Deployment {
  readonly id: string;
  readonly appId: string;
  readonly version: string;
  readonly pullRequest: number;
  readonly requestedAt: string;
  readonly state: DeploymentState;
  readonly runUrl: string | null;
  readonly finishedAt: string | null;
}

export function followRun(deployment: Deployment, run: DeployRun | null, now: string): Deployment {
  if (!run || run.version !== deployment.version || deployment.state === 'succeeded' || deployment.state === 'failed' || deployment.state === 'cancelled') return deployment;
  const state: DeploymentState = run.state === 'queued' ? 'running' : run.state;
  const finished = state === 'succeeded' || state === 'failed' || state === 'cancelled';
  return { ...deployment, state, runUrl: run.url, finishedAt: finished ? now : null };
}
