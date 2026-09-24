import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryAppRepository,
  InMemoryDecisionRepository,
  InMemoryEpicRepository,
  InMemoryRunRepository,
  InMemoryTaskRepository,
  InMemoryTranscriptStore,
} from '../adapters/in-memory/in-memory-repositories.js';
import { FakeWorkspace, FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { ScriptedAgentRunner, type AgentScript } from '../adapters/in-memory/scripted-agent-runner.js';
import { DEFAULT_FAILURE_POLICY } from '../domain/failure.js';
import { createTask, type Task, type TaskStatus } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import type { AgentEvent } from './ports/agent-runner.js';
import { PhaseRunner } from './phase-runner.js';

const GRILL_LIFECYCLE = {
  ...TASK_LIFECYCLE,
  phases: TASK_LIFECYCLE.phases.map((phase) => (phase.id === 'grill' ? { ...phase, skill: 'grill', output: 'decisions' as const } : phase)),
};

const usage = (inputTokens: number, outputTokens: number): AgentEvent => ({ type: 'usage', inputTokens, outputTokens });
const success = (structuredOutput: unknown = null): AgentEvent => ({ type: 'finished', outcome: 'success', summary: 'done', structuredOutput });
const toolFailure = (signature: string): AgentEvent => ({ type: 'tool-failure', tool: 'Bash', signature, summary: `${signature} failed` });
const script = (...events: AgentEvent[]): AgentScript => () => events;

let apps: InMemoryAppRepository;
let epics: InMemoryEpicRepository;
let tasks: InMemoryTaskRepository;
let runs: InMemoryRunRepository;
let decisions: InMemoryDecisionRepository;
let transcripts: InMemoryTranscriptStore;
let workspace: FakeWorkspace;
let bus: RecordingBus;

beforeEach(() => {
  apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  runs = new InMemoryRunRepository();
  decisions = new InMemoryDecisionRepository();
  transcripts = new InMemoryTranscriptStore();
  workspace = new FakeWorkspace();
  bus = new RecordingBus();
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', createdAt: '2026-09-24T09:00:00Z' });
  epics.save({ id: 'epic', appId: 'app', code: 'I', name: 'Interface', status: 'active', position: 1 });
});

function givenTask(phaseIndex: number, status: TaskStatus = { kind: 'ready', mode: 'fresh' }, extra: Partial<Task> = {}): Task {
  const task = { ...createTask({ id: 't1', epicId: 'epic', title: 'Zoom to platform', lifecycle: GRILL_LIFECYCLE }), phaseIndex, status, ...extra };
  tasks.save(task);
  return task;
}

function runner(agent: ScriptedAgentRunner, budget = { maxTokens: 400_000, maxTurns: 80 }): PhaseRunner {
  return new PhaseRunner({
    apps, epics, tasks, runs, decisions, transcripts, workspace, agent, bus, budget,
    clock: new FixedClock(),
    ids: new SequentialIds(),
    failurePolicy: DEFAULT_FAILURE_POLICY,
    loopThreshold: 3,
    baseRef: 'main',
    systemPromptAppend: 'context pack',
  });
}

describe('PhaseRunner', () => {
  it('runs an ungated phase, checkpoints it and moves on', async () => {
    givenTask(3);
    const agent = new ScriptedAgentRunner(script({ type: 'text', text: 'working' }, usage(1000, 200), success()));

    const task = await runner(agent).run('t1');

    expect(task.phaseIndex).toBe(4);
    expect(task.status).toEqual({ kind: 'ready', mode: 'fresh' });
    expect(task.checkpoints).toEqual([
      { sequence: 1, phaseIndex: 3, ref: 'refs/terminus/checkpoints/t1/1', sessionId: agent.requests[0]?.sessionId, takenAt: '2026-09-24T10:00:00.000Z' },
    ]);
    expect(workspace.checkpoints).toEqual(['1:execute']);
    const [run] = runs.listByTask('t1');
    expect(run?.status).toBe('succeeded');
    expect(run?.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(transcripts.read(run?.id ?? '')).toHaveLength(3);
    expect(tasks.get('t1')).toEqual(task);
  });

  it('starts the agent in the task worktree with the phase settings', async () => {
    givenTask(1);
    const agent = new ScriptedAgentRunner(script(success({ decisions: [] })));

    await runner(agent).run('t1');

    expect(agent.requests[0]).toMatchObject({
      cwd: '/worktrees/app/t1',
      resume: false,
      skill: 'grill',
      maxTurns: 80,
      systemPromptAppend: 'context pack',
    });
    expect(agent.requests[0]?.outputSchema).not.toBeNull();
    expect(agent.requests[0]?.prompt).toContain('Phase: grill (2 of 7)');
  });

  it('stops at the plan approval gate', async () => {
    givenTask(2);
    const task = await runner(new ScriptedAgentRunner(script(success()))).run('t1');
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'plan-approval' });
  });

  it('turns grill output into decision cards and waits on the first one', async () => {
    givenTask(1);
    const output = {
      decisions: [
        { question: 'Where do phases live?', options: [{ label: 'YAML', description: 'files', recommended: true }, { label: 'SQLite', description: 'rows', recommended: false }] },
        { question: 'Model per phase?', options: [{ label: 'Yes', description: 'field', recommended: true }, { label: 'No', description: 'default', recommended: false }] },
      ],
    };

    const task = await runner(new ScriptedAgentRunner(script(success(output)))).run('t1');

    const saved = decisions.listByTask('t1');
    expect(saved.map((decision) => decision.question)).toEqual(['Where do phases live?', 'Model per phase?']);
    expect(task.status).toEqual({ kind: 'awaiting-decision', decisionId: saved[0]?.id });
    expect(task.phaseIndex).toBe(1);
    expect(workspace.checkpoints).toEqual([]);
  });

  it('interrupts a looping run, then blocks after the automatic retry loops again', async () => {
    givenTask(4);
    const looping = script(toolFailure('zoom.spec.ts'), toolFailure('zoom.spec.ts'), toolFailure('zoom.spec.ts'), success());
    const agent = new ScriptedAgentRunner(looping, looping);
    const phases = runner(agent);

    const retried = await phases.run('t1');
    expect(agent.interrupts).toBe(1);
    expect(retried.status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(retried.failuresInPhase[0]).toMatchObject({ kind: 'loop-detected', signature: 'zoom.spec.ts' });
    expect(runs.listByTask('t1')[0]?.status).toBe('interrupted');

    const blocked = await phases.run('t1');
    expect(agent.requests[1]?.prompt).toContain('The previous attempt of this phase failed (loop-detected)');
    expect(blocked.status.kind).toBe('blocked');
  });

  it('interrupts a run that exceeds its token budget', async () => {
    givenTask(3);
    const agent = new ScriptedAgentRunner(script(usage(300, 100), usage(900, 200), success()));

    const task = await runner(agent, { maxTokens: 1000, maxTurns: 80 }).run('t1');

    expect(agent.interrupts).toBe(1);
    expect(task.failuresInPhase[0]?.kind).toBe('budget-exceeded');
  });

  it('blocks at once when the quota is exhausted', async () => {
    givenTask(3);
    const task = await runner(
      new ScriptedAgentRunner(script({ type: 'finished', outcome: 'quota-exhausted', summary: 'Usage limit reached', structuredOutput: null })),
    ).run('t1');
    expect(task.status).toMatchObject({ kind: 'blocked', failure: { kind: 'quota-exhausted' } });
  });

  it('counts a run that ends without any result as a crash', async () => {
    givenTask(3);
    const task = await runner(new ScriptedAgentRunner(script({ type: 'text', text: 'partial' }))).run('t1');
    expect(task.failuresInPhase[0]).toMatchObject({ kind: 'agent-crashed', signature: 'no-result' });
    expect(runs.listByTask('t1')[0]?.status).toBe('failed');
  });

  it('resumes the previous session of the same phase when asked to', async () => {
    givenTask(3, { kind: 'ready', mode: 'resume' });
    runs.save({ id: 'old', taskId: 't1', phaseIndex: 3, sessionId: 'session-before', status: 'interrupted', startedAt: '2026-09-24T09:00:00Z', endedAt: '2026-09-24T09:10:00Z', usage: null });
    const agent = new ScriptedAgentRunner(script(success()));

    await runner(agent).run('t1');

    expect(agent.requests[0]).toMatchObject({ resume: true, sessionId: 'session-before' });
  });

  it('reminds the agent of the decisions already made', async () => {
    givenTask(1, { kind: 'ready', mode: 'resume' });
    decisions.save({
      id: 'd1', taskId: 't1', phaseIndex: 1, question: 'Where do phases live?',
      options: [{ label: 'YAML', description: 'files', recommended: true }, { label: 'SQLite', description: 'rows', recommended: false }],
      answer: { kind: 'option', index: 0 }, createdAt: '2026-09-24T09:00:00Z', answeredAt: '2026-09-24T09:05:00Z',
    });
    const agent = new ScriptedAgentRunner(script(success({ decisions: [] })));

    await runner(agent).run('t1');

    expect(agent.requests[0]?.prompt).toContain('- Where do phases live? → YAML');
  });

  it('publishes every task change and run event for the UI', async () => {
    givenTask(3);
    await runner(new ScriptedAgentRunner(script(usage(10, 5), success()))).run('t1');
    expect(bus.updates.map((update) => update.kind)).toEqual(['task-changed', 'run-event', 'run-event', 'task-changed']);
  });

  it('refuses to run a task that is not ready', async () => {
    givenTask(3, { kind: 'todo' });
    await expect(runner(new ScriptedAgentRunner()).run('t1')).rejects.toThrow(/expected ready/);
  });
});
