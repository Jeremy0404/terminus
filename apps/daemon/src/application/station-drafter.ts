import { choiceKey, resolveChoice } from '../domain/agent-choice.js';
import type { Epic } from '../domain/epic.js';
import { DomainError } from '../domain/errors.js';
import type { AgentDefaultsStore } from './ports/agent-defaults-store.js';
import type { AgentEvent, AgentRunner } from './ports/agent-runner.js';
import type { PlaybookRegistry } from './ports/playbook-registry.js';
import type { EpicRepository, TaskRepository } from './ports/repositories.js';
import type { IdGenerator } from './ports/system.js';
import type { TaskNotes } from './ports/task-notes.js';
import type { TranscriptStore } from './ports/transcript-store.js';
import { NotFound } from './queries.js';
import { readStationDraft, STATION_DRAFT_OUTPUT_SCHEMA, type StationDraft } from './station-draft-output.js';

const DRAFT_PHASE = 'station-draft';
const DRAFT_MAX_TURNS = 6;
const MS_PER_SECOND = 1_000;

export const STATION_DRAFT_TIMEOUT_MS = 120_000;

export interface StationDrafterDeps {
  readonly epics: EpicRepository;
  readonly tasks: TaskRepository;
  readonly notes: TaskNotes;
  readonly agent: AgentRunner;
  readonly agentDefaults: AgentDefaultsStore;
  readonly playbooks: PlaybookRegistry;
  readonly transcripts: TranscriptStore;
  readonly ids: IdGenerator;
  readonly timeoutMs: number;
}

export class StationDrafter {
  constructor(private readonly deps: StationDrafterDeps) {}

  async draft(epicId: string, text: string): Promise<StationDraft> {
    const epic = this.deps.epics.get(epicId);
    if (!epic) throw new NotFound(`Unknown epic ${epicId}`);
    const runId = this.deps.ids.next('run');
    const scratch = this.deps.notes.directoryFor(`draft-${runId}`);
    const lifecycle = this.deps.playbooks.lifecycle('epic');
    const phase = lifecycle.phases.find((candidate) => candidate.id === DRAFT_PHASE);
    const choice = resolveChoice(this.deps.agentDefaults.all()[choiceKey(lifecycle.id, DRAFT_PHASE)], phase);
    const handle = this.deps.agent.start({
      runId,
      sessionId: this.deps.ids.uuid(),
      resume: false,
      cwd: scratch,
      notesDir: scratch,
      prompt: this.prompt(epic, text),
      systemPromptAppend: '',
      skill: DRAFT_PHASE,
      model: choice.model,
      effort: choice.effort,
      maxTurns: DRAFT_MAX_TURNS,
      outputSchema: STATION_DRAFT_OUTPUT_SCHEMA,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      handle.interrupt();
    }, this.deps.timeoutMs);
    let finished: Extract<AgentEvent, { type: 'finished' }> | null = null;
    try {
      for await (const event of handle.events) {
        this.deps.transcripts.append(runId, event);
        if (event.type === 'finished') finished = event;
      }
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) throw new DomainError(`The draft took longer than ${Math.ceil(this.deps.timeoutMs / MS_PER_SECOND)} s`);
    if (!finished) throw new DomainError('The agent stopped without a result');
    if (finished.outcome !== 'success') throw new DomainError(finished.summary || finished.outcome);
    const draft = readStationDraft(finished.structuredOutput);
    if (!draft) throw new DomainError('The agent returned no station draft');
    return draft;
  }

  private prompt(epic: Epic, text: string): string {
    const stations = this.deps.tasks
      .listByEpic(epic.id)
      .filter((task) => task.status.kind !== 'closed')
      .map((task) => `- ${task.title}`);
    const lines = [`Line ${epic.code}: ${epic.name}`];
    if (epic.description) lines.push(`Line description:\n${epic.description}`);
    lines.push(
      'Stations already on this line:',
      ...(stations.length > 0 ? stations : ['- none']),
      '',
      'Text from the human:',
      text.trim(),
      '',
      'Follow the `station-draft` skill.',
    );
    return lines.join('\n');
  }
}
