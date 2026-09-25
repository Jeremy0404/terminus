import type { AgentEvent, AgentRun, AgentRunner, AgentRunRequest } from '../../application/ports/agent-runner.js';

const STEP_DELAY_MS = 400;

export class DemoAgentRunner implements AgentRunner {
  start(request: AgentRunRequest): AgentRun {
    let interrupted = false;
    const events = script(request);
    return {
      interrupt: () => {
        interrupted = true;
      },
      events: (async function* () {
        for (const event of events) {
          await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS));
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

function script(request: AgentRunRequest): AgentEvent[] {
  const phase = /Phase: ([a-z-]+)/.exec(request.prompt)?.[1] ?? 'work';
  const events: AgentEvent[] = [
    { type: 'text', text: `Demo agent working on ${phase}` },
    { type: 'tool-call', tool: 'Read', summary: 'README.md' },
    { type: 'usage', inputTokens: 12_000, outputTokens: 1_800 },
  ];
  const answered = request.prompt.includes('Decisions already made');
  let structuredOutput: unknown = null;
  if (request.skill === 'grill') {
    structuredOutput = {
      decisions: answered
        ? []
        : [
            {
              question: 'Where should phase definitions live?',
              options: [
                { label: 'YAML files', description: 'Readable and versioned with the skills.', recommended: true },
                { label: 'SQLite rows', description: 'Editable from the app, outside git.', recommended: false },
              ],
            },
          ],
    };
  }
  if (request.skill === 'review') structuredOutput = { verdict: 'approve', summary: 'Matches the spec.', findings: [] };
  if (request.skill === 'station-draft') {
    const text = /Text from the human:\n([\s\S]*?)\n\nFollow/.exec(request.prompt)?.[1] ?? '';
    structuredOutput = { title: 'Tidy up the demo station', understanding: 'A demo draft of the text you typed.', summary: text };
  }
  events.push({ type: 'finished', outcome: 'success', summary: `${phase} done`, structuredOutput });
  return events;
}
