import { useEffect } from 'react';
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

const FINISHED: readonly string[] = ['done', 'closed'];

export function resumable(network: NetworkDto, lastTask: string | null): TaskSummaryDto | null {
  const task = network.tasks.find((candidate) => candidate.id === lastTask);
  return task && !FINISHED.includes(task.status.kind) ? task : null;
}

export function useResume(network: NetworkDto | null, taskId: string | null): TaskSummaryDto | null {
  useEffect(() => {
    if (!network) return;
    const lastTask = taskId ?? readJourney(network.app.id)?.lastTask ?? null;
    saveJourney(network.app.id, snapshot(network, lastTask));
  }, [network, taskId]);
  return network ? resumable(network, readJourney(network.app.id)?.lastTask ?? null) : null;
}
