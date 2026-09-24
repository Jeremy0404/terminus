import type { VerificationCommand } from '../../domain/app.js';

export interface RepoScan {
  readonly repoPath: string;
  readonly name: string;
  readonly isGitRepo: boolean;
  readonly hasOrigin: boolean;
  readonly defaultBranch: string | null;
  readonly packageManager: string | null;
  readonly ciWorkflows: readonly string[];
  readonly agentDocs: readonly string[];
  readonly suggestedVerification: readonly VerificationCommand[];
  readonly todos: readonly { readonly file: string; readonly line: number; readonly text: string }[];
}

export interface RepoScanner {
  scan(repoPath: string): RepoScan;
}
