import type { TaskWorkspace } from './workspace.js';

export interface PullRequest {
  readonly number: number;
  readonly url: string;
}

export type ChecksState = 'none' | 'pending' | 'success' | 'failure';

export interface CodeHost {
  publish(workspace: TaskWorkspace, baseBranch: string, title: string, body: string): PullRequest;
  checks(repoPath: string, pullRequest: number): ChecksState;
  merge(repoPath: string, pullRequest: number): void;
  close(repoPath: string, pullRequest: number, comment: string): void;
}
