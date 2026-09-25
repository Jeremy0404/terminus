import type { ReleaseState } from '../../domain/release.js';

export interface DeployTarget {
  state(repoPath: string): ReleaseState | null;
}
