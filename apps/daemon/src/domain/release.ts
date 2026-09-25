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
