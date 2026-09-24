import type { AgentEvent, AgentRun, AgentRunner, AgentRunRequest } from '../../application/ports/agent-runner.js';

export type AgentScript = (request: AgentRunRequest) => readonly AgentEvent[];

export class ScriptedAgentRunner implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];
  interrupts = 0;
  private readonly scripts: AgentScript[];

  constructor(...scripts: AgentScript[]) {
    this.scripts = scripts;
  }

  start(request: AgentRunRequest): AgentRun {
    this.requests.push(request);
    const script = this.scripts.shift();
    if (!script) throw new Error(`No script left for run ${request.runId}`);
    const events = script(request);
    let interrupted = false;
    return {
      interrupt: () => {
        interrupted = true;
        this.interrupts += 1;
      },
      events: (async function* () {
        for (const event of events) {
          if (interrupted) {
            yield { type: 'finished', outcome: 'interrupted', summary: 'Interrupted', structuredOutput: null } satisfies AgentEvent;
            return;
          }
          yield event;
        }
      })(),
    };
  }
}
