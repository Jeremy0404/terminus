import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckProgress } from '../../application/ports/check-runner.js';
import { ShellCheckRunner } from './shell-check-runner.js';

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'terminus-checks-'));
  writeFileSync(join(cwd, 'marker.txt'), 'present\n');
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('ShellCheckRunner', () => {
  it('runs every command in the worktree and reports each result', async () => {
    const results = await new ShellCheckRunner(10_000).run(cwd, [
      { name: 'read', command: 'cat marker.txt' },
      { name: 'fail', command: 'echo broken >&2; exit 3' },
      { name: 'after', command: 'true' },
    ]);

    expect(results.map(({ name, ok, exitCode }) => ({ name, ok, exitCode }))).toEqual([
      { name: 'read', ok: true, exitCode: 0 },
      { name: 'fail', ok: false, exitCode: 3 },
      { name: 'after', ok: true, exitCode: 0 },
    ]);
    expect(results[0]?.outputTail).toBe('present\n');
    expect(results[1]?.outputTail).toContain('broken');
  });

  it('keeps only the tail of long output', async () => {
    const [result] = await new ShellCheckRunner(10_000).run(cwd, [{ name: 'noisy', command: 'seq 1 5000' }]);
    expect(result?.outputTail.length).toBeLessThanOrEqual(4000);
    expect(result?.outputTail.trimEnd().endsWith('5000')).toBe(true);
  });

  it('fails a command that runs past the timeout', async () => {
    const [result] = await new ShellCheckRunner(200).run(cwd, [{ name: 'slow', command: 'sleep 5' }]);
    expect(result?.ok).toBe(false);
    expect(result?.outputTail).toContain('timed out');
  });

  it('reports progress for each command as it happens, not only after the whole batch resolves', async () => {
    const progress: CheckProgress[] = [];

    const promise = new ShellCheckRunner(10_000).run(
      cwd,
      [
        { name: 'fast', command: 'true' },
        { name: 'slow', command: 'sleep 0.3 && true' },
      ],
      (event) => progress.push(event),
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(progress.filter((event) => event.kind === 'started').map((event) => event.name)).toEqual(['fast', 'slow']);
    expect(progress.filter((event) => event.kind === 'result')).toHaveLength(1);

    await promise;
    expect(progress.filter((event) => event.kind === 'result')).toHaveLength(2);
  });

  it('reports the live, uncapped output tail while a command is still running, capped only once it finishes', async () => {
    const progress: CheckProgress[] = [];

    const [result] = await new ShellCheckRunner(10_000).run(cwd, [{ name: 'noisy', command: 'seq 1 5000' }], (event) => progress.push(event));

    const outputEvents = progress.filter((event): event is Extract<CheckProgress, { kind: 'output' }> => event.kind === 'output');
    expect(outputEvents.some((event) => event.outputTail.length > 4000)).toBe(true);
    expect(result?.outputTail.length).toBeLessThanOrEqual(4000);
  });
});
