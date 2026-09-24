import type { AgentEvent, AgentRun, AgentRunner, AgentRunRequest } from './ports/agent-runner.js';
import type { QuotaStore } from './ports/quota-store.js';
import type { Clock, RunEventBus } from './ports/system.js';

export class QuotaTrackingRunner implements AgentRunner {
  constructor(
    private readonly inner: AgentRunner,
    private readonly store: QuotaStore,
    private readonly bus: RunEventBus,
    private readonly clock: Clock,
  ) {}

  start(request: AgentRunRequest): AgentRun {
    const run = this.inner.start(request);
    return { events: this.track(run.events), interrupt: () => run.interrupt() };
  }

  private async *track(events: AsyncIterable<AgentEvent>): AsyncIterable<AgentEvent> {
    for await (const event of events) {
      if (event.type !== 'quota') {
        yield event;
        continue;
      }
      const quota = { limited: event.limited, windows: event.windows, observedAt: this.clock.now() };
      this.store.save(quota);
      this.bus.publish({ kind: 'quota-changed', quota });
    }
  }
}
