import type { VerificationCommand } from '../../domain/app.js';

export interface CheckResult {
  readonly name: string;
  readonly command: string;
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly outputTail: string;
  readonly durationMs: number;
}

export type CheckProgress =
  | { readonly kind: 'started'; readonly name: string; readonly command: string }
  | { readonly kind: 'output'; readonly name: string; readonly command: string; readonly outputTail: string }
  | { readonly kind: 'result'; readonly result: CheckResult };

export interface CheckRunner {
  run(cwd: string, commands: readonly VerificationCommand[], onProgress?: (progress: CheckProgress) => void): Promise<CheckResult[]>;
}
