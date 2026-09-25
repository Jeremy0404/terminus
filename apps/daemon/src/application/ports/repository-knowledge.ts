export interface RepositoryDecision {
  readonly path: string;
  readonly title: string;
}

export interface RepositoryKnowledge {
  contextDoc(repoPath: string): string | null;
  decisions(repoPath: string): RepositoryDecision[];
}
