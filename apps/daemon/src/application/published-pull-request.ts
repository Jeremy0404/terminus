import type { Run } from '../domain/run.js';
import type { PullRequest } from './ports/code-host.js';

export function publishedPullRequest(runs: readonly Run[]): PullRequest | null {
  const output = runs
    .map((run) => run.output)
    .reverse()
    .find((candidate): candidate is { pullRequest: PullRequest } => typeof candidate === 'object' && candidate !== null && 'pullRequest' in candidate);
  return output?.pullRequest ?? null;
}
