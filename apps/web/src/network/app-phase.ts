import type { NetworkDto, TaskSummaryDto } from '@terminus/contracts';

const FOUNDATION: readonly (readonly [string, string])[] = [
  ['app-framing', 'framing'],
  ['app-stack', 'stack-and-architecture'],
  ['app-scaffold', 'scaffold'],
  ['app-deploy', 'production'],
];

const settled = (task: TaskSummaryDto): boolean => task.status.kind === 'done' || task.status.kind === 'closed';

export function appPhaseOf(network: NetworkDto): string | null {
  const stations = FOUNDATION.map(([lifecycleId, phase]) => [network.tasks.find((task) => task.lifecycleId === lifecycleId), phase] as const);
  if (stations.every(([task]) => !task)) return null;
  const current = stations.find(([task]) => task && !settled(task));
  return current ? current[1] : 'build';
}
