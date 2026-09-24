import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryAppRepository,
  InMemoryDecisionRepository,
  InMemoryEpicRepository,
  InMemoryRunRepository,
  InMemoryTaskRepository,
  InMemoryTranscriptStore,
} from '../adapters/in-memory/in-memory-repositories.js';
import { FakeCodeHost, FakeTaskNotes, FakeWorkspace, FixedClock, RecordingBus, SequentialIds } from '../adapters/in-memory/fakes.js';
import { ScriptedAgentRunner, type AgentScript } from '../adapters/in-memory/scripted-agent-runner.js';
import { DEFAULT_FAILURE_POLICY } from '../domain/failure.js';
import { createTask, type Task, type TaskStatus } from '../domain/task.js';
import { TASK_LIFECYCLE } from '../domain/test-fixtures.js';
import type { AgentEvent } from './ports/agent-runner.js';
import type { CheckResult, CheckRunner } from './ports/check-runner.js';
import { PhaseRunner } from './phase-runner.js';

class StubCheckRunner implements CheckRunner {
  readonly calls: { cwd: string; names: string[] }[] = [];
  outcomes: Record<string, boolean>[] = [];

  run(cwd: string, commands: readonly { name: string; command: string }[]): Promise<CheckResult[]> {
    this.calls.push({ cwd, names: commands.map((command) => command.name) });
    const outcome = this.outcomes.shift() ?? {};
    return Promise.resolve(
      commands.map(({ name, command }) => {
        const ok = outcome[name] ?? true;
        return { name, command, ok, exitCode: ok ? 0 : 1, outputTail: ok ? '' : `${name} exploded`, durationMs: 5 };
      }),
    );
  }
}

const GRILL_LIFECYCLE = {
  ...TASK_LIFECYCLE,
  phases: TASK_LIFECYCLE.phases.map((phase) => {
    if (phase.id === 'grill') return { ...phase, skill: 'grill', output: 'decisions' as const };
    if (phase.id === 'verify') return { ...phase, executor: 'checks' as const, retryFrom: 'execute' };
    if (phase.id === 'review') return { ...phase, skill: 'review', output: 'review' as const };
    if (phase.id === 'merge') return { ...phase, executor: 'code-host' as const };
    return phase;
  }),
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
let checks: StubCheckRunner;
let codeHost: FakeCodeHost;

beforeEach(() => {
  apps = new InMemoryAppRepository();
  epics = new InMemoryEpicRepository();
  tasks = new InMemoryTaskRepository(epics);
  runs = new InMemoryRunRepository();
  decisions = new InMemoryDecisionRepository();
  transcripts = new InMemoryTranscriptStore();
  workspace = new FakeWorkspace();
  bus = new RecordingBus();
  checks = new StubCheckRunner();
  codeHost = new FakeCodeHost();
  apps.save({ id: 'app', name: 'app', repoPath: '/repo', verification: [{ name: 'test', command: 'pnpm test' }, { name: 'build', command: 'pnpm build' }], createdAt: '2026-09-24T09:00:00Z' });
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
    checks,
    codeHost,
    notes: new FakeTaskNotes(),
    instructions: { localOnly: (repoPath: string) => `instructions of ${repoPath}` },
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
      notesDir: '/notes/t1',
      resume: false,
      skill: 'grill',
      maxTurns: 80,
      systemPromptAppend: 'context pack\n\ninstructions of /repo',
    });
    expect(agent.requests[0]?.outputSchema).not.toBeNull();
    expect(agent.requests[0]?.prompt).toContain('Phase: grill (2 of 7)');
    expect(agent.requests[0]?.prompt).toContain('Task notes directory: /notes/t1');
    expect(agent.requests[0]?.prompt).toContain('- test: pnpm test');
    expect(agent.requests[0]?.prompt).toContain('Base branch: main');
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
    givenTask(3);
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

  it('blocks at once when the agent setup breaks isolation', async () => {
    givenTask(3);
    const task = await runner(
      new ScriptedAgentRunner(script({ type: 'finished', outcome: 'isolation-breach', summary: 'unexpected skill brain-access', structuredOutput: null })),
    ).run('t1');
    expect(task.status).toMatchObject({ kind: 'blocked', failure: { kind: 'isolation-breach', message: 'unexpected skill brain-access' } });
  });

  it('counts a run that ends without any result as a crash', async () => {
    givenTask(3);
    const task = await runner(new ScriptedAgentRunner(script({ type: 'text', text: 'partial' }))).run('t1');
    expect(task.failuresInPhase[0]).toMatchObject({ kind: 'agent-crashed', signature: 'no-result' });
    expect(runs.listByTask('t1')[0]?.status).toBe('failed');
  });

  it('resumes the previous session of the same phase when asked to', async () => {
    givenTask(3, { kind: 'ready', mode: 'resume' });
    runs.save({ id: 'old', taskId: 't1', phaseIndex: 3, sessionId: 'session-before', status: 'interrupted', startedAt: '2026-09-24T09:00:00Z', endedAt: '2026-09-24T09:10:00Z', usage: null, output: null });
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

  it('passes verification when every check is green, with a checkpoint and no agent', async () => {
    givenTask(4);
    const agent = new ScriptedAgentRunner();

    const task = await runner(agent).run('t1');

    expect(agent.requests).toEqual([]);
    expect(checks.calls).toEqual([{ cwd: '/worktrees/app/t1', names: ['test', 'build'] }]);
    expect(task.phaseIndex).toBe(5);
    expect(task.checkpoints.at(-1)).toMatchObject({ phaseIndex: 4, sessionId: null });
    expect(runs.listByTask('t1')[0]).toMatchObject({ status: 'succeeded', sessionId: 'checks' });
    expect(bus.updates.filter((update) => update.kind === 'check-result')).toHaveLength(2);
  });

  it('sends a red verification back to execution with the failing output', async () => {
    givenTask(4);
    checks.outcomes = [{ build: false }];

    const task = await runner(new ScriptedAgentRunner()).run('t1');

    expect(task.phaseIndex).toBe(3);
    expect(task.status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(task.failuresInPhase[0]).toMatchObject({ kind: 'check-failed', signature: 'check:build' });
    expect(task.failuresInPhase[0]?.message).toContain('build exploded');
    expect(runs.listByTask('t1')[0]?.status).toBe('failed');
    expect(workspace.checkpoints).toEqual([]);
  });

  it('blocks when the same check keeps failing across fix cycles', async () => {
    givenTask(4);
    checks.outcomes = [{ test: false }, { test: false }, { test: false }];
    const agent = new ScriptedAgentRunner(script(success()), script(success()));
    const phases = runner(agent);

    await phases.run('t1');
    await phases.run('t1');
    await phases.run('t1');
    await phases.run('t1');
    const task = await phases.run('t1');

    expect(task.status).toMatchObject({ kind: 'blocked', failure: { signature: 'check:test' } });
    expect(task.checkFailures).toHaveLength(3);
  });

  it('asks the reviewer for a structured verdict and keeps it on the run', async () => {
    givenTask(5);
    const verdict = { verdict: 'changes-requested', summary: 'One gap', findings: [{ severity: 'major', file: 'zoom.ts', summary: 'No test for Esc' }] };
    const agent = new ScriptedAgentRunner(script(success(verdict)));

    const task = await runner(agent).run('t1');

    expect(agent.requests[0]?.outputSchema).toMatchObject({ required: ['verdict', 'summary', 'findings'] });
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'human-review' });
    expect(runs.listByTask('t1')[0]?.output).toEqual(verdict);
  });

  it('publishes the branch as a pull request and waits at the merge gate', async () => {
    givenTask(6, { kind: 'ready', mode: 'fresh' }, { title: 'Zoom to platform' });
    runs.save({ id: 'review-run', taskId: 't1', phaseIndex: 5, sessionId: 's', status: 'succeeded', startedAt: 'a', endedAt: 'b', usage: null,
      output: { verdict: 'approve', summary: 'Looks right', findings: [{ severity: 'minor', file: 'zoom.ts', summary: 'Rename var' }] } });
    const agent = new ScriptedAgentRunner();

    const task = await runner(agent).run('t1');

    expect(agent.requests).toEqual([]);
    expect(task.status).toEqual({ kind: 'awaiting-gate', gate: 'merge' });
    expect(workspace.checkpoints).toEqual(['1:merge']);
    expect(codeHost.published).toEqual([{
      branch: 'terminus/t1',
      title: 'feat: zoom to platform',
      body: 'Task: Zoom to platform\n\nPhases completed: 0 of 7.\n\nReview: approve — Looks right\n- [minor] zoom.ts: Rename var',
    }]);
    expect(runs.listByTask('t1').at(-1)?.output).toEqual({ pullRequest: { number: 42, url: 'https://github.com/o/r/pull/42' } });
  });

  it('keeps a conventional task title as the pull request title', async () => {
    givenTask(6, { kind: 'ready', mode: 'fresh' }, { title: 'fix: keep Esc working in the platform' });
    await runner(new ScriptedAgentRunner()).run('t1');
    expect(codeHost.published[0]?.title).toBe('fix: keep Esc working in the platform');
  });

  it('records a failed publication as a retryable failure', async () => {
    givenTask(6);
    codeHost.failPublish = Object.assign(new Error('Command failed'), { stderr: 'remote rejected' });

    const task = await runner(new ScriptedAgentRunner()).run('t1');

    expect(task.status).toEqual({ kind: 'ready', mode: 'retry' });
    expect(task.failuresInPhase[0]).toMatchObject({ kind: 'publish-failed', message: 'remote rejected' });
  });
});
