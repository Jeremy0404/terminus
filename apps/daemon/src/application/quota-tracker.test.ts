import { describe, expect, it } from 'vitest';
import { FixedClock, RecordingBus } from '../adapters/in-memory/fakes.js';
import { InMemoryQuotaStore } from '../adapters/in-memory/in-memory-repositories.js';
import { ScriptedAgentRunner } from '../adapters/in-memory/scripted-agent-runner.js';
import type { AgentEvent, AgentRunRequest } from './ports/agent-runner.js';
import { QuotaTrackingRunner } from './quota-tracker.js';

const request: AgentRunRequest = {
  runId: 'run-1',
  sessionId: 'session-1',
  resume: false,
  cwd: '/repo',
  notesDir: '/notes',
  prompt: 'Do it',
  systemPromptAppend: '',
  skill: null,
  model: null,
  maxTurns: 10,
  outputSchema: null,
};

const fiveHour = { kind: 'five-hour', utilization: 0.47, resetsAt: '2026-09-24T12:00:00.000Z' };

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const seen: AgentEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('QuotaTrackingRunner', () => {
  it('keeps the latest quota, publishes it and hides it from the run', async () => {
    const store = new InMemoryQuotaStore();
    const bus = new RecordingBus();
    const inner = new ScriptedAgentRunner(() => [
      { type: 'quota', limited: false, windows: [fiveHour] },
      { type: 'text', text: 'Working' },
      { type: 'finished', outcome: 'success', summary: 'Done', structuredOutput: null },
    ]);
    const runner = new QuotaTrackingRunner(inner, store, bus, new FixedClock());

    const events = await drain(runner.start(request).events);

    expect(events.map((event) => event.type)).toEqual(['text', 'finished']);
    const quota = { limited: false, windows: [fiveHour], observedAt: '2026-09-24T10:00:00.000Z' };
    expect(store.latest()).toEqual(quota);
    expect(bus.updates).toEqual([{ kind: 'quota-changed', quota }]);
  });

  it('forwards interruption to the wrapped run', () => {
    const inner = new ScriptedAgentRunner(() => []);
    const run = new QuotaTrackingRunner(inner, new InMemoryQuotaStore(), new RecordingBus(), new FixedClock()).start(request);

    run.interrupt();

    expect(inner.interrupts).toBe(1);
  });
});
