import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentSettingsDto, LessonDto, MemoryDto, NetworkDto, StationDraftDto, TaskDetailDto, TaskSummaryDto } from '@terminus/contracts';
import { HealthResponse } from '@terminus/contracts';
import type { AgentEvent } from '../../application/ports/agent-runner.js';
import type { CheckResult, CheckRunner } from '../../application/ports/check-runner.js';
import { compose, type Services } from '../../compose.js';
import { FsPlaybookRegistry } from '../fs-playbooks/fs-playbook-registry.js';
import { FakeCodeHost, FakeTaskNotes, FakeWorkspace, FixedClock, SequentialIds } from '../in-memory/fakes.js';
import {
  InMemoryAgentDefaultsStore,
  InMemoryAppRepository,
  InMemoryDecisionRepository,
  InMemoryDeploymentRepository,
  InMemoryEpicRepository,
  InMemoryMemoryRepository,
  InMemoryQuotaStore,
  InMemoryRunRepository,
  InMemoryTaskRepository,
  InMemoryTranscriptStore,
} from '../in-memory/in-memory-repositories.js';
import { ScriptedAgentRunner, type AgentScript } from '../in-memory/scripted-agent-runner.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../../playbooks', import.meta.url));

const finish = (structuredOutput: unknown = null): AgentScript => () =>
  [{ type: 'usage', inputTokens: 100, outputTokens: 20 }, { type: 'finished', outcome: 'success', summary: 'ok', structuredOutput }] satisfies AgentEvent[];

const greenChecks: CheckRunner = {
  run: (_cwd, commands) => Promise.resolve(commands.map((c): CheckResult => ({ ...c, ok: true, exitCode: 0, outputTail: '', durationMs: 1 }))),
};

let services: Services;
let servedWeb: string | null = null;
let codeHost: FakeCodeHost;
let founded: { path: string; name: string; visibility: string }[];

function start(...scripts: AgentScript[]): void {
  const epics = new InMemoryEpicRepository();
  codeHost = new FakeCodeHost();
  founded = [];
  services = compose(
    {
      apps: new InMemoryAppRepository(),
      epics,
      tasks: new InMemoryTaskRepository(epics),
      runs: new InMemoryRunRepository(),
      decisions: new InMemoryDecisionRepository(),
      transcripts: new InMemoryTranscriptStore(),
      quota: new InMemoryQuotaStore(),
      workspace: new FakeWorkspace(),
      notes: new FakeTaskNotes(),
      instructions: { localOnly: () => '' },
      agent: new ScriptedAgentRunner(...scripts),
      agentDefaults: new InMemoryAgentDefaultsStore(),
      memory: new InMemoryMemoryRepository(),
      repositories: { create: (path, name, visibility) => void founded.push({ path, name, visibility }) },
      vault: null,
      skills: { skills: () => [{ name: 'spec', playbook: 'task', researched: '2026-08-01' }] },
      deployTarget: { state: () => ({ deploysOnRelease: true, pending: null, latest: { version: '0.2.0', publishedAt: '2026-08-10T16:54:07Z', url: 'u' }, lastRun: null }) },
      deployments: new InMemoryDeploymentRepository(),
      notifier: { notify: () => {} },
      knowledge: { contextDoc: () => 'Glossary of the demo repo.', decisions: () => [{ path: 'docs/adr/0001-use-sqlite.md', title: 'Use SQLite' }] },
      checks: greenChecks,
      codeHost,
      scanner: { scan: (repoPath) => ({ repoPath, name: 'demo', isGitRepo: true, hasOrigin: false, defaultBranch: 'main', packageManager: 'pnpm', ciWorkflows: [], agentDocs: [], suggestedVerification: [{ name: 'test', command: 'pnpm run test' }], todos: [] }) },
      issues: { listOpen: () => [], close: () => {} },
      playbooks: new FsPlaybookRegistry(PLAYBOOKS),
      clock: new FixedClock(),
      ids: new SequentialIds(),
    },
    { version: '9.9.9', baseRef: 'main', concurrency: 2, budget: { maxTokens: 400_000, maxTurns: 80 }, systemPromptAppend: '', projectsDir: '/projects', playbooksRepo: '/repo', webDir: servedWeb },
  );
}

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await services.http.request(path, init);
  const text = await response.text();
  return { status: response.status, json: (text ? JSON.parse(text) : null) as T };
}

async function settle(): Promise<void> {
  await services.scheduler.idle();
}

async function givenTask(): Promise<{ appId: string; taskId: string }> {
  const app = await call<{ id: string }>('POST', '/api/apps', { name: 'demo', repoPath: '/repo', verification: [{ name: 'test', command: 'pnpm test' }] });
  const epic = await call<{ id: string }>('POST', `/api/apps/${app.json.id}/epics`, { code: 'I', name: 'Interface' });
  const task = await call<TaskSummaryDto>('POST', `/api/epics/${epic.json.id}/tasks`, { title: 'Zoom to platform' });
  return { appId: app.json.id, taskId: task.json.id };
}

describe('HTTP API', () => {
  beforeEach(() => start());

  it('answers the health check', async () => {
    const { status, json } = await call<unknown>('GET', '/api/health');
    expect(status).toBe(200);
    expect(HealthResponse.parse(json)).toEqual({ status: 'ok', version: '9.9.9' });
  });

  it('reports the latest agent quota seen during a run', async () => {
    const quota = { limited: false, windows: [{ kind: 'five-hour', utilization: 0.4, resetsAt: '2026-09-24T12:00:00.000Z' }] };
    start(() => [{ type: 'quota', ...quota }, { type: 'finished', outcome: 'error', summary: 'stopped', structuredOutput: null }]);
    expect((await call('GET', '/api/quota')).json).toBeNull();
    const { taskId } = await givenTask();

    await call('POST', `/api/tasks/${taskId}/open`);
    await settle();

    expect((await call('GET', '/api/quota')).json).toEqual({ ...quota, observedAt: '2026-09-24T10:00:00.000Z' });
  });

  it('sets the default model per agent phase and the model of a task', async () => {
    const fallback = { model: 'sonnet', effort: 'high' };
    const saved = (await call<AgentSettingsDto>('PUT', '/api/settings/agents', { fallback, defaults: { 'task.execute': { model: 'opus', effort: 'max' } } })).json;
    expect(saved.fallback).toEqual(fallback);
    expect(saved.phases.find((phase) => phase.key === 'task.execute')?.choice).toEqual({ model: 'opus', effort: 'max' });
    expect((await call('PUT', '/api/settings/agents', { fallback, defaults: { 'task.verify': { model: 'opus', effort: null } } })).status).toBe(409);
    expect((await call('PUT', '/api/settings/agents', { fallback, defaults: { 'task.execute': { model: 'opus; rm', effort: null } } })).status).toBe(400);

    const { taskId } = await givenTask();
    const task = (await call<TaskSummaryDto>('POST', `/api/tasks/${taskId}/agent`, { model: 'haiku', effort: 'low' })).json;

    expect(task.agent).toEqual({ model: 'haiku', effort: 'low' });
    expect((await call<AgentSettingsDto>('GET', '/api/settings/agents')).json.phases.map((phase) => phase.key)).toEqual(expect.arrayContaining(['epic.breakdown', 'epic.station-draft']));
  });

  it('founds a new app from an idea, ready to frame', async () => {
    const created = await call<{ id: string; repoPath: string }>('POST', '/api/apps/found', { name: 'Carnet', idea: 'Log my rides.' });

    expect(created.status).toBe(201);
    expect(founded).toEqual([{ path: '/projects/carnet', name: 'carnet', visibility: 'private' }]);
    const network = (await call<NetworkDto>('GET', `/api/apps/${created.json.id}/network`)).json;
    expect(network.epics.map((epic) => epic.name)).toEqual(['Fondations']);
    expect(network.tasks).toEqual([
      expect.objectContaining({ title: 'Cadrer l’idée', description: 'Log my rides.', phases: ['grill', 'brief'], lifecycleId: 'app-framing' }),
      expect.objectContaining({ title: 'Choisir la stack et l’architecture', phases: ['options', 'architecture'], lifecycleId: 'app-stack' }),
      expect.objectContaining({ title: 'Poser le socle', lifecycleId: 'app-scaffold' }),
    ]);
    expect((await call('POST', '/api/apps/found', { name: 'x', idea: '' })).status).toBe(400);
  });

  it('lists the playbook skills and opens an update station on the app holding them', async () => {
    const skills = (await call<{ name: string; stale: boolean }[]>('GET', '/api/playbooks/skills')).json;
    expect(skills).toEqual([{ name: 'spec', playbook: 'task', researched: '2026-08-01', stale: true }]);
    expect((await call('POST', '/api/playbooks/skills/spec/update')).status).toBe(409);

    const { appId } = await givenTask();
    const started = await call<{ appId: string; task: TaskSummaryDto }>('POST', '/api/playbooks/skills/spec/update');

    expect(started.status).toBe(201);
    expect(started.json).toMatchObject({ appId, task: { title: 'Mettre à jour la skill spec', lifecycleId: 'playbook-update' } });
  });

  it('reports the production state of an app', async () => {
    const { appId } = await givenTask();
    expect((await call<{ latest: { version: string } }>('GET', `/api/apps/${appId}/release`)).json.latest.version).toBe('0.2.0');
    expect((await call('GET', '/api/apps/ghost/release')).status).toBe(409);
    expect((await call('POST', `/api/apps/${appId}/release/deploy`, { version: '1.0.0' })).status).toBe(409);
    expect((await call('POST', `/api/apps/${appId}/release/deploy`, { version: 'latest' })).status).toBe(400);
  });

  it('keeps the project memory and shows the pack agents receive', async () => {
    const { appId } = await givenTask();

    const lesson = await call<LessonDto>('POST', `/api/apps/${appId}/lessons`, { text: 'Run the migrations first.' });
    await call('POST', `/api/apps/${appId}/terms`, { term: 'Station', definition: 'A task on a line.' });
    expect(lesson.status).toBe(201);
    expect((await call('POST', `/api/apps/${appId}/terms`, { term: '', definition: 'x' })).status).toBe(400);

    const memory = (await call<MemoryDto>('GET', `/api/apps/${appId}/memory`)).json;
    expect(memory.lessons.map((entry) => entry.text)).toEqual(['Run the migrations first.']);
    expect(memory.terms.map((entry) => entry.term)).toEqual(['Station']);
    expect(memory.pack).toContain('- **Station**: A task on a line.');
    expect(memory.pack).toContain('Glossary of the demo repo.');
    expect(memory.pack).toContain('- docs/adr/0001-use-sqlite.md: Use SQLite');

    expect((await call('DELETE', `/api/lessons/${lesson.json.id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/lessons/${lesson.json.id}`)).status).toBe(409);
  });

  it('creates an app, a line and a station, and draws the network', async () => {
    const { appId, taskId } = await givenTask();

    const { json } = await call<NetworkDto>('GET', `/api/apps/${appId}/network`);

    expect(json.app.name).toBe('demo');
    expect(json.epics.map((epic) => epic.code)).toEqual(['I']);
    expect(json.tasks).toEqual([
      expect.objectContaining({ id: taskId, title: 'Zoom to platform', phaseIndex: 0, status: { kind: 'todo' }, phases: ['spec', 'grill', 'plan', 'execute', 'verify', 'review', 'sync', 'merge', 'retro'] }),
    ]);
    expect(json.inbox).toEqual([]);
  });

  it('keeps the description a station is created with', async () => {
    const { appId, taskId } = await givenTask();
    const described = await call<TaskSummaryDto>('POST', '/api/epics/epic-2/tasks', { title: 'Pan the map', description: 'Drag to move\naround the network' });

    expect(described.status).toBe(201);
    expect(described.json.description).toBe('Drag to move\naround the network');
    const { json } = await call<NetworkDto>('GET', `/api/apps/${appId}/network`);
    expect(json.tasks.map((task) => [task.id, task.description])).toEqual([[taskId, ''], [described.json.id, 'Drag to move\naround the network']]);
  });

  it('drafts a station from the human text', async () => {
    const draft = { title: 'Add a way back from the settings', understanding: 'No link back.', summary: 'Add one.' };
    start(finish(draft));
    await givenTask();

    const drafted = await call<StationDraftDto>('POST', '/api/epics/epic-2/station-draft', { text: 'pas de retour depuis les settings' });

    expect(drafted).toEqual({ status: 200, json: draft });
  });

  it('refuses a blank draft text or an unknown line, and reports a failed draft', async () => {
    start(() => [{ type: 'finished', outcome: 'error', summary: 'The agent crashed', structuredOutput: null }]);
    await givenTask();

    expect((await call('POST', '/api/epics/epic-2/station-draft', { text: '   ' })).status).toBe(400);
    expect((await call('POST', '/api/epics/ghost/station-draft', { text: 'x' })).status).toBe(404);
    expect(await call('POST', '/api/epics/epic-2/station-draft', { text: 'x' })).toEqual({ status: 409, json: { error: 'The agent crashed' } });
  });

  it('rejects invalid bodies with 400, unknown ids with 404 and wrong transitions with 409', async () => {
    const { taskId } = await givenTask();
    expect((await call('POST', '/api/apps', { name: '' })).status).toBe(400);
    expect((await call('GET', '/api/tasks/missing')).status).toBe(404);
    expect((await call('POST', `/api/tasks/${taskId}/approve`)).status).toBe(409);
  });

  it('refuses a duplicate line code and a dependency cycle', async () => {
    const { appId } = await givenTask();
    expect((await call('POST', `/api/apps/${appId}/epics`, { code: 'I', name: 'Again' })).status).toBe(409);
    expect((await call('POST', '/api/epics/epic-2/tasks', { title: 'x', dependsOn: ['ghost'] })).status).toBe(409);
  });

  it('drives a task through every phase to the merge', async () => {
    const grill = { decisions: [{ question: 'Where do phases live?', options: [{ label: 'YAML', description: 'files', recommended: true }, { label: 'SQLite', description: 'rows', recommended: false }] }] };
    start(finish(), finish(grill), finish({ decisions: [] }), finish(), finish(), finish({ verdict: 'approve', summary: 'good', findings: [] }), finish({ summary: 'Went well', lessons: [{ text: 'Keep phases in YAML.', why: 'Decided in the grill.' }], terms: [], obsolete: [] }));
    const { appId, taskId } = await givenTask();

    await call('POST', `/api/tasks/${taskId}/open`);
    await settle();
    let detail = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json;
    expect(detail.task.status).toMatchObject({ kind: 'awaiting-decision' });
    expect(detail.actions).toEqual([{ kind: 'answer-decision', decisionId: detail.decisions[0]?.id }, { kind: 'skip-phase', phaseId: 'grill' }]);
    const network = (await call<NetworkDto>('GET', `/api/apps/${appId}/network`)).json;
    expect(network.inbox).toEqual([expect.objectContaining({ taskId, reason: { kind: 'decision', decisionId: detail.decisions[0]?.id } })]);

    await call('POST', `/api/decisions/${detail.decisions[0]?.id}/answer`, { kind: 'option', index: 0 });
    await settle();
    detail = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json;
    expect(detail.task.status).toEqual({ kind: 'awaiting-gate', gate: 'plan-approval' });

    await call('POST', `/api/tasks/${taskId}/approve`);
    await settle();
    detail = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json;
    expect(detail.task.status).toEqual({ kind: 'awaiting-gate', gate: 'human-review' });
    expect(detail.runs.at(-1)?.output).toEqual({ verdict: 'approve', summary: 'good', findings: [] });

    await call('POST', `/api/tasks/${taskId}/approve`);
    await settle();
    detail = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json;
    expect(detail.task.status).toEqual({ kind: 'awaiting-gate', gate: 'merge' });
    expect(detail.actions).toEqual([{ kind: 'merge' }]);

    expect((await call<{ state: string }>('GET', `/api/tasks/${taskId}/checks`)).json).toEqual({ state: 'success' });
    codeHost.checksState = 'pending';
    expect((await call<{ state: string }>('GET', `/api/tasks/${taskId}/checks`)).json).toEqual({ state: 'pending' });
    codeHost.checksState = 'success';

    const merged = await call<TaskSummaryDto>('POST', `/api/tasks/${taskId}/merge`);
    expect(merged.json.status).toEqual({ kind: 'ready', mode: 'fresh' });
    expect(codeHost.merged).toEqual([42]);
    expect(detail.checkpoints.map((checkpoint) => checkpoint.phaseIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    await settle();
    detail = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json;
    expect(detail.task.status).toEqual({ kind: 'done' });
    const memory = (await call<MemoryDto>('GET', `/api/apps/${appId}/memory`)).json;
    expect(memory.proposals).toEqual([expect.objectContaining({ sourceTitle: 'Zoom to platform', proposed: { kind: 'lesson', text: 'Keep phases in YAML.' } })]);
    expect((await call<NetworkDto>('GET', `/api/apps/${appId}/network`)).json.memoryProposals).toBe(1);
    expect((await call('POST', `/api/memory-proposals/${memory.proposals[0]?.id}/accept`)).status).toBe(204);
    expect((await call<MemoryDto>('GET', `/api/apps/${appId}/memory`)).json.lessons.map((lesson) => lesson.text)).toEqual(['Keep phases in YAML.']);
  });

  it('refuses to read checks before a pull request is published', async () => {
    const { taskId } = await givenTask();
    expect((await call('GET', `/api/tasks/${taskId}/checks`)).status).toBe(409);
  });

  it('serves a run transcript', async () => {
    start(finish());
    const { taskId } = await givenTask();
    await call('POST', `/api/tasks/${taskId}/open`);
    await settle();
    const runId = (await call<TaskDetailDto>('GET', `/api/tasks/${taskId}`)).json.runs[0]?.id;

    const { json } = await call<unknown[]>('GET', `/api/runs/${runId}/transcript`);

    expect(json).toHaveLength(2);
  });

  it('streams task changes as server-sent events', async () => {
    const response = await services.http.request('/api/events');
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    await reader.read();

    await givenTask();
    let received = '';
    while (!received.includes('task-changed')) received += decoder.decode((await reader.read()).value);
    await reader.cancel();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(received).toContain('"title":"Zoom to platform"');
  });

  it('adopts a repository through the adoption routes', async () => {
    const scan = await call<{ suggestedVerification: unknown[] }>('POST', '/api/adoption/scan', { repoPath: '/elsewhere' });
    expect(scan.json.suggestedVerification).toEqual([{ name: 'test', command: 'pnpm run test' }]);

    const proposals = await call<{ warnings: string[] }>('POST', '/api/adoption/proposals', { repoPath: '/elsewhere' });
    expect(proposals.json.warnings[0]).toMatch(/No origin remote/);

    const health = await call<{ ok: boolean }[]>('POST', '/api/adoption/health', { repoPath: '/elsewhere', commands: [{ name: 'test', command: 'pnpm run test' }] });
    expect(health.json).toEqual([expect.objectContaining({ name: 'test', ok: true })]);

    const cutOver = await call<{ app: { id: string; name: string } }>('POST', '/api/adoption/cut-over', {
      name: 'elsewhere', repoPath: '/elsewhere', verification: [], closeIssues: false,
      lines: [{ code: 'A', name: 'Adopted', tasks: [{ title: 'First task', issueNumber: 3 }] }],
    });
    expect(cutOver.status).toBe(201);
    const network = await call<NetworkDto>('GET', `/api/apps/${cutOver.json.app.id}/network`);
    expect(network.json.tasks.map((task) => task.title)).toEqual(['First task']);
    expect((await call('POST', '/api/adoption/scan', { repoPath: '/elsewhere' })).status).toBe(409);
  });

  it('closes a task without merge through the API', async () => {
    const { appId, taskId } = await givenTask();

    const closed = await call<{ task: TaskSummaryDto; warnings: string[] }>('POST', `/api/tasks/${taskId}/close`, { reason: 'duplicate', evidence: 'Same as the other station' });

    expect(closed.json.task.status).toEqual({ kind: 'closed', reason: 'duplicate', evidence: 'Same as the other station' });
    expect((await call<NetworkDto>('GET', `/api/apps/${appId}/network`)).json.inbox).toEqual([]);
    expect((await call('POST', `/api/tasks/${taskId}/close`, { reason: 'duplicate' })).status).toBe(409);
    expect((await call('POST', `/api/tasks/${taskId}/close`, { reason: 'bored' })).status).toBe(400);
  });

  it('switches a task to the light track and skips a phase through the API', async () => {
    const { taskId } = await givenTask();

    const light = await call<TaskSummaryDto>('POST', `/api/tasks/${taskId}/track`, { track: 'light' });
    expect(light.json).toMatchObject({ track: 'light', phasesInTrack: ['spec', 'execute', 'verify', 'review', 'sync', 'merge', 'retro'] });
    expect(light.json.skippablePhases).toEqual(['spec', 'grill', 'plan', 'review', 'retro']);
    expect((await call('POST', `/api/tasks/${taskId}/skip`)).status).toBe(409);
    expect((await call('POST', `/api/tasks/${taskId}/track`, { track: 'fast' })).status).toBe(400);
  });

  it('breaks a line down with an agent and creates the accepted stations', async () => {
    start(() => [{ type: 'finished', outcome: 'success', summary: 'ok', structuredOutput: { description: 'd', stations: [{ title: 'A', why: 'a', dependsOn: [] }, { title: 'B', why: 'b', dependsOn: [0] }] } }]);
    const app = await call<{ id: string }>('POST', '/api/apps', { name: 'demo', repoPath: '/repo' });
    const epic = await call<{ id: string; description: string }>('POST', `/api/apps/${app.json.id}/epics`, { code: 'E', name: 'Epic', description: 'Goal' });
    expect(epic.json.description).toBe('Goal');

    expect((await call('POST', `/api/epics/${epic.json.id}/breakdown`, { brief: 'Goal' })).status).toBe(202);
    await services.planner.idle();
    const network = (await call<NetworkDto>('GET', `/api/apps/${app.json.id}/network`)).json;
    expect(network.epics[0]?.breakdown).toMatchObject({ status: 'ready', proposal: { stations: [{ title: 'A' }, { title: 'B' }] } });

    const created = await call<TaskSummaryDto[]>('POST', `/api/epics/${epic.json.id}/breakdown/accept`, { description: 'Goal, refined', stations: [{ title: 'A', why: 'a' }, { title: 'B', dependsOn: [0] }] });
    expect(created.status).toBe(201);
    expect(created.json.map((task) => [task.title, task.description])).toEqual([['A', 'a'], ['B', '']]);
  });
});

describe('serving the built web app', () => {
  let webDir: string;

  beforeEach(() => {
    webDir = mkdtempSync(join(tmpdir(), 'terminus-web-'));
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'index.html'), '<div id="root"></div>');
    writeFileSync(join(webDir, 'assets', 'app-1234.js'), 'console.log(1)');
  });
  afterEach(() => {
    servedWeb = null;
    rmSync(webDir, { recursive: true, force: true });
  });

  it('serves the app, its hashed assets for good, and falls back to the app outside the API', async () => {
    servedWeb = webDir;
    start();
    const http = services.http;

    const home = await http.request('/');
    expect(await home.text()).toBe('<div id="root"></div>');
    expect(home.headers.get('cache-control')).toBe('no-cache');
    const asset = await http.request('/assets/app-1234.js');
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect(await (await http.request('/somewhere')).text()).toBe('<div id="root"></div>');
    expect((await http.request('/api/health')).headers.get('content-type')).toContain('application/json');
    expect((await http.request('/api/nothing-here')).status).toBe(404);
  });
});
