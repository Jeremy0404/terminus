import { spawn } from 'node:child_process';
import type { CheckProgress, CheckResult, CheckRunner } from '../../application/ports/check-runner.js';
import type { VerificationCommand } from '../../domain/app.js';

const OUTPUT_TAIL_CHARS = 4000;

export class ShellCheckRunner implements CheckRunner {
  constructor(private readonly timeoutMs: number) {}

  async run(cwd: string, commands: readonly VerificationCommand[], onProgress?: (progress: CheckProgress) => void): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const command of commands) results.push(await this.runOne(cwd, command, onProgress));
    return results;
  }

  private runOne(cwd: string, { name, command }: VerificationCommand, onProgress?: (progress: CheckProgress) => void): Promise<CheckResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      let output = '';
      onProgress?.({ kind: 'started', name, command });
      const child = spawn(command, { cwd, shell: true, detached: true, env: { ...process.env, CI: 'true', FORCE_COLOR: '0' } });
      const collect = (chunk: Buffer): void => {
        output += chunk.toString('utf8');
        onProgress?.({ kind: 'output', name, command, outputTail: output });
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      const timer = setTimeout(() => {
        output += `\n[terminus] ${name} timed out after ${this.timeoutMs} ms`;
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      }, this.timeoutMs);
      const finish = (result: CheckResult): void => {
        clearTimeout(timer);
        onProgress?.({ kind: 'result', result });
        resolve(result);
      };
      child.on('close', (exitCode) => {
        finish({ name, command, ok: exitCode === 0, exitCode, outputTail: output.slice(-OUTPUT_TAIL_CHARS), durationMs: Date.now() - started });
      });
      child.on('error', (error) => {
        finish({ name, command, ok: false, exitCode: null, outputTail: String(error), durationMs: Date.now() - started });
      });
    });
  }
}
