import type { Decision } from '../domain/decision.js';
import type { PhaseDefinition } from '../domain/lifecycle.js';
import type { Task } from '../domain/task.js';

export function buildPhasePrompt(task: Task, phase: PhaseDefinition, answeredDecisions: readonly Decision[]): string {
  const lines = [
    `Task: ${task.title}`,
    `Phase: ${phase.id} (${task.phaseIndex + 1} of ${task.lifecycle.phases.length})`,
  ];
  if (phase.skill) lines.push(`Follow the \`${phase.skill}\` skill for this phase.`);
  const retry = task.status.kind === 'ready' && task.status.mode === 'retry' ? task.failuresInPhase.at(-1) : undefined;
  if (retry) {
    lines.push('', `The previous attempt of this phase failed (${retry.kind}): ${retry.message}`, 'Do not repeat the same approach.');
  }
  if (answeredDecisions.length > 0) {
    lines.push('', 'Decisions already made for this task:');
    for (const decision of answeredDecisions) lines.push(`- ${decision.question} → ${answerText(decision)}`);
  }
  return lines.join('\n');
}

function answerText(decision: Decision): string {
  if (!decision.answer) return 'unanswered';
  if (decision.answer.kind === 'other') return decision.answer.text;
  return decision.options[decision.answer.index]?.label ?? 'unknown option';
}
