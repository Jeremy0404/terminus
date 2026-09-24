import type { VerificationCommand } from '../../domain/app.js';

export interface CheckResult {
  readonly name: string;
  readonly command: string;
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly outputTail: string;
  readonly durationMs: number;
}

export interface CheckRunner {
  run(cwd: string, commands: readonly VerificationCommand[]): Promise<CheckResult[]>;
}
