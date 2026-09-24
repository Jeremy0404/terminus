import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';

export type NextStep =
  | { readonly kind: 'open-station'; readonly epicId: string; readonly taskId: string; readonly title: string }
  | { readonly kind: 'break-down'; readonly epicId: string; readonly name: string }
  | { readonly kind: 'create-line' };

const SATISFYING = ['already-done', 'obsolete', 'duplicate'];

function settled(task: TaskSummaryDto | undefined): boolean {
  if (!task) return false;
  return task.status.kind === 'done' || (task.status.kind === 'closed' && SATISFYING.includes(task.status.reason));
}

export function nextStep(network: NetworkDto, lineId: string | null = null): NextStep | null {
  const epics = [...network.epics].filter((epic) => lineId === null || epic.id === lineId).sort((a, b) => a.position - b.position);
  if (lineId === null && epics.length === 0) return { kind: 'create-line' };
  const byId = new Map(network.tasks.map((task) => [task.id, task]));
  for (const epic of epics) {
    const openable = network.tasks.find(
      (task) => task.epicId === epic.id && task.status.kind === 'todo' && task.dependsOn.every((id) => settled(byId.get(id))),
    );
    if (openable) return { kind: 'open-station', epicId: epic.id, taskId: openable.id, title: openable.title };
  }
  const empty = epics.find((epic) => epic.breakdown.status === 'idle' && !network.tasks.some((task) => task.epicId === epic.id));
  return empty ? { kind: 'break-down', epicId: empty.id, name: empty.name } : null;
}
