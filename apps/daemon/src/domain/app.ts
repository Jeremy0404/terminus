export interface VerificationCommand {
  readonly name: string;
  readonly command: string;
}

export interface App {
  readonly id: string;
  readonly name: string;
  readonly repoPath: string;
  readonly verification: readonly VerificationCommand[];
  readonly createdAt: string;
}
