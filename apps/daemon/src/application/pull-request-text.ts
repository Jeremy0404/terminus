import type { Run } from '../domain/run.js';
import type { Task } from '../domain/task.js';

const CONVENTIONAL_PREFIX = /^(feat|fix|chore|docs|refactor|test|perf|build|ci)(\([^)]+\))?!?: /;

export function pullRequestTitle(task: Task): string {
  return CONVENTIONAL_PREFIX.test(task.title) ? task.title : `feat: ${task.title.charAt(0).toLowerCase()}${task.title.slice(1)}`;
}

export function pullRequestBody(task: Task, runs: readonly Run[], summary: string | null = null): string {
  const review = [...runs].reverse().find((run) => isReview(run.output));
  const lines = [`Task: ${task.title}`, '', `Phases completed: ${task.checkpoints.length} of ${task.lifecycle.phases.length}.`];
  if (summary?.trim()) lines.push('', summary.trim());
  if (review && isReview(review.output)) {
    lines.push('', `Review: ${review.output.verdict} — ${review.output.summary}`);
    for (const finding of review.output.findings) lines.push(`- [${finding.severity}] ${finding.file ? `${finding.file}: ` : ''}${finding.summary}`);
  }
  return lines.join('\n');
}

interface ReviewOutput {
  readonly verdict: string;
  readonly summary: string;
  readonly findings: readonly { readonly severity: string; readonly file?: string; readonly summary: string }[];
}

function isReview(output: unknown): output is ReviewOutput {
  return typeof output === 'object' && output !== null && 'verdict' in output && 'findings' in output && Array.isArray(output.findings);
}
