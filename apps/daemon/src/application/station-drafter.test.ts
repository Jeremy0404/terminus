import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { FakeTaskNotes, FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import {
  InMemoryAgentDefaultsStore,
  InMemoryAppRepository,
  InMemoryEpicRepository,
  InMemoryTaskRepository,
  InMemoryTranscriptStore,
} from '../adapters/in-memory/in-memory-repositories.js';
import { ScriptedAgentRunner, type AgentScript } from '../adapters/in-memory/scripted-agent-runner.js';
import { DomainError } from '../domain/errors.js';
import { Catalog } from './catalog.js';
import type { AgentEvent, AgentRunner } from './ports/agent-runner.js';
import { NotFound } from './queries.js';
import { STATION_DRAFT_OUTPUT_SCHEMA } from './station-draft-output.js';
import { StationDrafter } from './station-drafter.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

const DRAFT = { title: 'Add a way back from the settings', understanding: 'The settings page has no link back.', summary: 'Add a link back to the line.' };
const TEXT = "Pas de moyen de revenir à l'ecran de l'épique quand on est sur la page settings";

const answers = (structuredOutput: unknown, outcome: 'success' | 'error' = 'success'): AgentScript => () => [
  { type: 'text', text: 'reading' },
  { type: 'finished', outcome, summary: outcome === 'success' ? 'done' : 'The agent crashed', structuredOutput },
];

const stuck: AgentRunner = {
  start: () => {
    let release = (): void => {};
    const interrupted = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      interrupt: () => release(),
      events: (async function* () {
        await interrupted;
        yield { type: 'finished', outcome: 'interrupted', summary: 'Interrupted', structuredOutput: null } satisfies AgentEvent;
      })(),
    };
  },
};

let epics: InMemoryEpicRepository;
let tasks: InMemoryTaskRepository;
let transcripts: InMemoryTranscriptStore;
let drafter: (agent: AgentRunner, agentDefaults?: InMemoryAgentDefaultsStore) => StationDrafter;

beforeEach(() => {
  const apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  transcripts = new InMemoryTranscriptStore();
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', verification: [], createdAt: 'x' });
  const ids = new SequentialIds();
  const playbooks = new FsPlaybookRegistry(PLAYBOOKS);
  const catalog = new Catalog({ apps, epics, tasks, playbooks, clock: new FixedClock(), ids, bus: new RecordingBus() });
  catalog.createEpic('app', { code: 'I', name: 'Interface', status: 'active', description: 'Everything the human sees.' });
  catalog.createEpic('app', { code: 'M', name: 'Engine', status: 'active' });
  catalog.createTask('epic-1', { title: 'Zoom to platform', dependsOn: [], autonomy: 'up-to-pr' });
  const drawn = catalog.createTask('epic-1', { title: 'Draw the map', dependsOn: [], autonomy: 'up-to-pr' });
  tasks.save({ ...drawn, status: { kind: 'closed', reason: 'obsolete', evidence: '' } });
  catalog.createTask('epic-2', { title: 'Run the CLI', dependsOn: [], autonomy: 'up-to-pr' });
  drafter = (agent, agentDefaults = new InMemoryAgentDefaultsStore()) =>
    new StationDrafter({ epics, tasks, agent, agentDefaults, transcripts, ids, playbooks, notes: new FakeTaskNotes(), timeoutMs: 1_000 });
});

describe('StationDrafter', () => {
  it('returns the draft the agent wrote', async () => {
    await expect(drafter(new ScriptedAgentRunner(answers(DRAFT))).draft('epic-1', TEXT)).resolves.toEqual(DRAFT);
  });

  it('gives the agent the text and the line', async () => {
    const agent = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(agent).draft('epic-1', TEXT);

    const prompt = agent.requests[0]?.prompt ?? '';
    expect(prompt).toContain(TEXT);
    expect(prompt).toContain('Line I: Interface');
    expect(prompt).toContain('Everything the human sees.');
    expect(prompt.trimEnd().endsWith('Follow the `station-draft` skill.')).toBe(true);
  });

  it('lists the open stations of the line only', async () => {
    const agent = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(agent).draft('epic-1', TEXT);

    const prompt = agent.requests[0]?.prompt ?? '';
    expect(prompt).toContain('- Zoom to platform');
    expect(prompt).not.toContain('Draw the map');
    expect(prompt).not.toContain('Run the CLI');
  });

  it('runs the station-draft skill in a scratch notes directory, without repository instructions', async () => {
    const agent = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(agent).draft('epic-1', TEXT);

    const request = agent.requests[0];
    expect(request).toMatchObject({ skill: 'station-draft', outputSchema: STATION_DRAFT_OUTPUT_SCHEMA, systemPromptAppend: '', resume: false });
    expect(request?.runId).toMatch(/^run-\d+$/);
    expect(request?.cwd).toBe(`/notes/draft-${request?.runId}`);
    expect(request?.notesDir).toBe(request?.cwd);
  });

  it('records the transcript under the run id', async () => {
    const agent = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(agent).draft('epic-1', TEXT);

    expect(transcripts.read(agent.requests[0]?.runId ?? '')).toEqual(answers(DRAFT)(agent.requests[0] as never));
  });

  it('runs with haiku at low effort unless the settings say otherwise', async () => {
    const byDefault = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(byDefault).draft('epic-1', TEXT);
    const configured = new ScriptedAgentRunner(answers(DRAFT));
    await drafter(configured, new InMemoryAgentDefaultsStore({ 'epic.station-draft': { model: 'sonnet', effort: 'medium' } })).draft('epic-1', TEXT);

    expect(byDefault.requests[0]).toMatchObject({ model: 'haiku', effort: 'low' });
    expect(configured.requests[0]).toMatchObject({ model: 'sonnet', effort: 'medium' });
  });

  it('fails with the agent summary when the run fails', async () => {
    const draft = drafter(new ScriptedAgentRunner(answers(null, 'error'))).draft('epic-1', TEXT);
    await expect(draft).rejects.toThrow(DomainError);
    await expect(draft).rejects.toThrow('The agent crashed');
  });

  it('fails when the agent returns no draft', async () => {
    await expect(drafter(new ScriptedAgentRunner(answers({ title: ' ' }))).draft('epic-1', TEXT)).rejects.toThrow(/no station draft/);
  });

  it('fails when the run ends without a result', async () => {
    const silent = new ScriptedAgentRunner(() => [{ type: 'text', text: 'thinking' }]);
    await expect(drafter(silent).draft('epic-1', TEXT)).rejects.toThrow(/stopped without a result/);
  });

  it('interrupts a run that takes too long', async () => {
    const slow = new StationDrafter({ epics, tasks, transcripts, agent: stuck, agentDefaults: new InMemoryAgentDefaultsStore(), ids: new SequentialIds(), playbooks: new FsPlaybookRegistry(PLAYBOOKS), notes: new FakeTaskNotes(), timeoutMs: 10 });
    await expect(slow.draft('epic-1', TEXT)).rejects.toThrow(/took longer/);
  });

  it('refuses an unknown line', async () => {
    await expect(drafter(new ScriptedAgentRunner(answers(DRAFT))).draft('ghost', TEXT)).rejects.toThrow(NotFound);
  });
});
