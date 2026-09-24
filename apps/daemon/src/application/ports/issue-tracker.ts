export interface OpenIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
}

export interface IssueTracker {
  listOpen(repoPath: string): OpenIssue[];
  close(repoPath: string, issueNumber: number, comment: string): void;
}
