import { choiceKey, fallbackOf, FALLBACK_KEY, NO_CHOICE, type AgentChoice, type AgentDefaults } from '../domain/agent-choice.js';
import { DomainError } from '../domain/errors.js';
import type { AgentDefaultsStore } from './ports/agent-defaults-store.js';
import type { PlaybookRegistry } from './ports/playbook-registry.js';

export interface AgentPhase {
  readonly key: string;
  readonly lifecycleId: string;
  readonly phaseId: string;
  readonly choice: AgentChoice;
}

export interface AgentSettingsView {
  readonly fallback: AgentChoice;
  readonly phases: readonly AgentPhase[];
}

export class AgentSettings {
  constructor(private readonly deps: { readonly playbooks: PlaybookRegistry; readonly agentDefaults: AgentDefaultsStore }) {}

  view(): AgentSettingsView {
    const defaults = this.deps.agentDefaults.all();
    const phases = this.deps.playbooks.lifecycles().flatMap((lifecycle) =>
      lifecycle.phases
        .filter((phase) => phase.skill !== undefined)
        .map((phase) => {
          const key = choiceKey(lifecycle.id, phase.id);
          return { key, lifecycleId: lifecycle.id, phaseId: phase.id, choice: defaults[key] ?? NO_CHOICE };
        }),
    );
    return { fallback: fallbackOf(defaults), phases };
  }

  update(fallback: AgentChoice, defaults: AgentDefaults): AgentSettingsView {
    const known = new Set(this.view().phases.map((phase) => phase.key));
    const unknown = Object.keys(defaults).filter((key) => !known.has(key));
    if (unknown.length > 0) throw new DomainError(`No agent phase ${unknown.join(', ')}`);
    const set = Object.entries(defaults).filter(([, choice]) => choice.model || choice.effort);
    this.deps.agentDefaults.replace({ ...Object.fromEntries(set), [FALLBACK_KEY]: fallback });
    return this.view();
  }
}
