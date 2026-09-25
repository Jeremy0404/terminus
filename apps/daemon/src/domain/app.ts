export interface VerificationCommand {
  readonly name: string;
  readonly command: string;
}

export interface ArchitectureDecision {
  readonly title: string;
  readonly decision: string;
  readonly why: string;
}

export interface AppStack {
  readonly id: string;
  readonly name: string;
  readonly decisions: readonly ArchitectureDecision[];
}

export interface App {
  readonly id: string;
  readonly name: string;
  readonly repoPath: string;
  readonly verification: readonly VerificationCommand[];
  readonly brief?: string;
  readonly stack?: AppStack;
  readonly createdAt: string;
}
