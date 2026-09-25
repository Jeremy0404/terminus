import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';
import { outcomeOf } from '../network/progress';

export interface Journey {
  readonly tasks: Readonly<Record<string, string>>;
  readonly lastTask: string | null;
}

const keyOf = (appId: string): string => `terminus:journey:${appId}`;

export function readJourney(appId: string): Journey | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(keyOf(appId)) ?? 'null');
    if (!value || typeof value !== 'object' || !('tasks' in value) || !('lastTask' in value)) return null;
    if (!value.tasks || typeof value.tasks !== 'object' || Array.isArray(value.tasks)) return null;
    if (value.lastTask !== null && typeof value.lastTask !== 'string') return null;
    const entries = Object.entries(value.tasks);
    if (!entries.every(([, state]) => typeof state === 'string')) return null;
    return { tasks: Object.fromEntries(entries), lastTask: value.lastTask };
  } catch {
    return null;
  }
}

function stateOf(task: TaskSummaryDto): string {
  const status = task.status;
  const marker = status.kind === 'awaiting-decision' ? status.decisionId : status.kind === 'awaiting-gate' ? status.gate : status.kind === 'blocked' ? status.failure.signature : '';
  return `${outcomeOf(status)}:${status.kind}:${task.phaseIndex}:${marker}`;
}

export function snapshot(network: NetworkDto, lastTask: string | null): Journey {
  return { tasks: Object.fromEntries(network.tasks.map((task) => [task.id, stateOf(task)])), lastTask };
}

export function saveJourney(appId: string, journey: Journey): void {
  try {
    window.localStorage.setItem(keyOf(appId), JSON.stringify(journey));
  } catch {
    return;
  }
}

export function changesSince(network: NetworkDto, previous: Journey | null): { completed: number; closed: number; added: number; attention: number } {
  const changes = { completed: 0, closed: 0, added: 0, attention: 0 };
  if (!previous) return changes;
  for (const task of network.tasks) {
    const before = previous.tasks[task.id]?.split(':')[0];
    const after = outcomeOf(task.status);
    if (before === undefined) changes.added += 1;
    if (['awaiting-decision', 'awaiting-gate', 'blocked', 'manual'].includes(task.status.kind) && previous.tasks[task.id] !== stateOf(task)) changes.attention += 1;
    if (before === after) continue;
    if (after === 'integrated' || after === 'existing') {
      if (before !== 'integrated' && before !== 'existing') changes.completed += 1;
    } else if (task.status.kind === 'closed') changes.closed += 1;
  }
  return changes;
}
