import type { AppDto, NetworkDto, TaskDetailDto, TaskSummaryDto } from '@terminus/contracts';

export const APP: AppDto = { id: 'app-1', name: 'terminus', repoPath: '/home/me/dev/terminus' };

const PHASES = ['spec', 'grill', 'plan', 'execute', 'verify', 'review', 'merge'];

export const task = (id: string, epicId: string, title: string, status: TaskSummaryDto['status'], extra: Partial<TaskSummaryDto> = {}): TaskSummaryDto => ({
  id,
  epicId,
  title,
  description: '',
  autonomy: 'up-to-pr',
  track: 'standard',
  agent: { model: null, effort: null },
  phases: PHASES,
  phasesInTrack: PHASES,
  skippablePhases: ['spec', 'grill', 'plan', 'review'],
  phaseIndex: 0,
  status,
  dependsOn: [],
  ...extra,
});

export const NETWORK: NetworkDto = {
  app: APP,
  epics: [
    { id: 'engine', appId: 'app-1', code: 'M', name: 'Moteur', status: 'active', position: 1, description: '', breakdown: { status: 'idle' } },
    { id: 'ui', appId: 'app-1', code: 'I', name: 'Interface', status: 'active', position: 2, description: '', breakdown: { status: 'idle' } },
  ],
  tasks: [
    task('m1', 'engine', 'Spike CLI', { kind: 'done' }),
    task('m2', 'engine', 'Adaptateur CLI', { kind: 'running', runId: 'run-1' }, { phaseIndex: 3 }),
    task('i1', 'ui', 'Rendu SVG', { kind: 'awaiting-gate', gate: 'human-review' }, { phaseIndex: 5, description: 'Dessiner les lignes en SVG.\nUne couleur par ligne.' }),
    task('i2', 'ui', 'Zoom', { kind: 'blocked', failure: { kind: 'check-failed', signature: 'check:test', message: 'test failed', at: 'x' } }, { phaseIndex: 4, dependsOn: ['m2'] }),
  ],
  inbox: [
    { taskId: 'i2', epicId: 'ui', reason: { kind: 'blocked' }, unblocks: 0 },
    { taskId: 'i1', epicId: 'ui', reason: { kind: 'gate', gate: 'human-review' }, unblocks: 1 },
  ],
  memoryProposals: 0,
  obsoleteFlags: [],
};

export const detailOf = (summary: TaskSummaryDto): TaskDetailDto => ({ task: summary, checkpoints: [], failures: [], actions: [], runs: [], decisions: [] });

export function mockApi(routes: Record<string, unknown>) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const path = String(input).replace(/^\/api/, '');
    if (!(path in routes)) return Response.json({ error: `No route ${path}` }, { status: 404 });
    return Response.json(routes[path]);
  };
}
