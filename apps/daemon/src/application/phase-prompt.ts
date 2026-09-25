import type { VerificationCommand } from '../domain/app.js';
import type { Decision } from '../domain/decision.js';
import type { PhaseDefinition } from '../domain/lifecycle.js';
import type { Task } from '../domain/task.js';

export interface PromptContext {
  readonly notesDir: string;
  readonly baseRef: string;
  readonly verification: readonly VerificationCommand[];
  readonly openStations?: readonly { readonly id: string; readonly line: string; readonly title: string }[];
}

export function buildPhasePrompt(task: Task, phase: PhaseDefinition, answeredDecisions: readonly Decision[], context: PromptContext): string {
  const lines = [`Task: ${task.title}`];
  const brief = task.description.trim();
  if (brief) lines.push(`Brief: ${brief}`);
  lines.push(`Phase: ${phase.id} (${task.phaseIndex + 1} of ${task.lifecycle.phases.length})`);
  if (phase.skill) lines.push(`Follow the \`${phase.skill}\` skill for this phase.`);
  lines.push(
    '',
    `Task notes directory: ${context.notesDir} — spec.md, plan.md and any other working notes live there, never in the repository.`,
    `Base branch: ${context.baseRef}`,
  );
  if (context.verification.length > 0) {
    lines.push('Verification commands (the deterministic barrier runs exactly these):');
    for (const check of context.verification) lines.push(`- ${check.name}: ${check.command}`);
  }
  const retry = task.status.kind === 'ready' && task.status.mode === 'retry' ? task.failuresInPhase.at(-1) : undefined;
  if (retry) {
    lines.push('', `The previous attempt of this phase failed (${retry.kind}): ${retry.message}`, 'Do not repeat the same approach.');
  }
  if (answeredDecisions.length > 0) {
    lines.push('', 'Decisions already made for this task:');
    for (const decision of answeredDecisions) lines.push(`- ${decision.question} → ${answerText(decision)}`);
  }
  if (context.openStations && context.openStations.length > 0) {
    lines.push('', 'Open stations on this network (id [line] title). List in `obsolete` only those this merge already covers:');
    for (const station of context.openStations) lines.push(`- ${station.id} [${station.line}] ${station.title}`);
  }
  return lines.join('\n');
}

function answerText(decision: Decision): string {
  if (!decision.answer) return 'unanswered';
  if (decision.answer.kind === 'other') return decision.answer.text;
  return decision.options[decision.answer.index]?.label ?? 'unknown option';
}
