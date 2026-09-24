import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { FakeTaskNotes, FakeWorkspace, FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import {
  InMemoryAppRepository,
  InMemoryEpicRepository,
  InMemoryTaskRepository,
  InMemoryTranscriptStore,
} from '../adapters/in-memory/in-memory-repositories.js';
import { ScriptedAgentRunner, type AgentScript } from '../adapters/in-memory/scripted-agent-runner.js';
import { Catalog } from './catalog.js';
import { EpicPlanner } from './epic-planner.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

const proposal = {
  description: 'Let users adopt an existing repository.',
  stations: [
    { title: 'Scan the repository', why: 'Know the stack', dependsOn: [] },
    { title: 'Run the health checks', why: 'Record a baseline', dependsOn: [0] },
  ],
};
const answers = (structuredOutput: unknown, outcome: 'success' | 'error' = 'success'): AgentScript => () => [
  { type: 'text', text: 'exploring' },
  { type: 'finished', outcome, summary: outcome === 'success' ? 'done' : 'The agent crashed', structuredOutput },
];

let epics: InMemoryEpicRepository;
let tasks: InMemoryTaskRepository;
let workspace: FakeWorkspace;
let bus: RecordingBus;
let transcripts: InMemoryTranscriptStore;
let catalog: Catalog;

beforeEach(() => {
  const apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  workspace = new FakeWorkspace();
  bus = new RecordingBus();
  transcripts = new InMemoryTranscriptStore();
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', verification: [], createdAt: 'x' });
  const ids = new SequentialIds();
  catalog = new Catalog({ apps, epics, tasks, playbooks: new FsPlaybookRegistry(PLAYBOOKS), clock: new FixedClock(), ids, bus });
  catalog.createEpic('app', { code: 'U', name: 'UX', status: 'active' });
  catalog.createEpic('app', { code: 'A', name: 'Adoption', status: 'active', description: 'draft' });
  catalog.createTask('epic-1', { title: 'Give every click feedback', dependsOn: [], autonomy: 'up-to-pr' });
  planner = (agent) =>
    new EpicPlanner({ apps, epics, tasks, catalog, workspace, notes: new FakeTaskNotes(), instructions: { localOnly: () => 'repo rules' }, agent, transcripts, ids, bus, budget: { maxTokens: 400_000, maxTurns: 80 }, baseRef: 'main' });
});

let planner: (agent: ScriptedAgentRunner) => EpicPlanner;

describe('EpicPlanner', () => {
  it('runs a breakdown agent in a disposable checkout and keeps its proposal for review', async () => {
    const agent = new ScriptedAgentRunner(answers(proposal));
    const epicPlanner = planner(agent);

    const running = epicPlanner.start('epic-2', 'Adopt repos in five stations');
    expect(running.breakdown).toMatchObject({ status: 'running', brief: 'Adopt repos in five stations' });
    await epicPlanner.idle();

    expect(epics.get('epic-2')?.breakdown).toEqual({ status: 'ready', brief: 'Adopt repos in five stations', proposal });
    expect(agent.requests[0]).toMatchObject({ skill: 'epic-breakdown', systemPromptAppend: 'repo rules', notesDir: '/notes/epic-epic-2' });
    expect(agent.requests[0]?.prompt).toContain('Brief from the human: Adopt repos in five stations');
    expect(agent.requests[0]?.prompt).toContain('- [U] Give every click feedback (todo)');
    expect(agent.requests[0]?.prompt).toContain('Current description:\ndraft');
    expect(workspace.branchesDeleted).toEqual([`terminus/epic-${running.breakdown.status === 'running' ? running.breakdown.runId : ''}`]);
    expect(bus.updates.filter((update) => update.kind === 'epic-changed')).toHaveLength(2);
  });

  it('records a failed breakdown and refuses a second one while running', async () => {
    const epicPlanner = planner(new ScriptedAgentRunner(answers(null, 'error')));
    epicPlanner.start('epic-2', '');
    expect(() => epicPlanner.start('epic-2', '')).toThrow(/already being broken down/);
    await epicPlanner.idle();
    expect(epics.get('epic-2')?.breakdown).toEqual({ status: 'failed', brief: '', error: 'The agent crashed' });
  });

  it('creates the accepted stations in order, with their dependencies and track', async () => {
    const epicPlanner = planner(new ScriptedAgentRunner(answers(proposal)));
    epicPlanner.start('epic-2', '');
    await epicPlanner.idle();

    const created = epicPlanner.accept('epic-2', {
      description: 'Adopt a repository in five stations.',
      stations: [{ title: 'Scan the repository', dependsOn: [] }, { title: 'Run the health checks, edited', dependsOn: [0] }],
      track: 'light',
    });

    expect(created.map((task) => [task.title, task.dependsOn, task.track])).toEqual([
      ['Scan the repository', [], 'light'],
      ['Run the health checks, edited', [created[0]?.id], 'light'],
    ]);
    expect(epics.get('epic-2')).toMatchObject({ description: 'Adopt a repository in five stations.', breakdown: { status: 'idle' } });
  });

  it('refuses to accept without a proposal or with a dependency on a later station', async () => {
    const epicPlanner = planner(new ScriptedAgentRunner(answers(proposal)));
    expect(() => epicPlanner.accept('epic-2', { description: '', stations: [{ title: 'x', dependsOn: [] }], track: 'standard' })).toThrow(/no breakdown to accept/);
    epicPlanner.start('epic-2', '');
    await epicPlanner.idle();
    expect(() => epicPlanner.accept('epic-2', { description: '', stations: [{ title: 'x', dependsOn: [1] }, { title: 'y', dependsOn: [] }], track: 'standard' })).toThrow(/only depend on stations listed before it/);
  });

  it('dismisses a proposal', async () => {
    const epicPlanner = planner(new ScriptedAgentRunner(answers(proposal)));
    epicPlanner.start('epic-2', '');
    await epicPlanner.idle();
    expect(epicPlanner.dismiss('epic-2').breakdown).toEqual({ status: 'idle' });
  });
});
