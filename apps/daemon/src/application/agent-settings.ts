import { choiceKey, NO_CHOICE, type AgentChoice, type AgentDefaults } from '../domain/agent-choice.js';
import { DomainError } from '../domain/errors.js';
import type { AgentDefaultsStore } from './ports/agent-defaults-store.js';
import type { PlaybookRegistry } from './ports/playbook-registry.js';

export interface AgentPhase {
  readonly key: string;
  readonly lifecycleId: string;
  readonly phaseId: string;
  readonly choice: AgentChoice;
}

export class AgentSettings {
  constructor(private readonly deps: { readonly playbooks: PlaybookRegistry; readonly agentDefaults: AgentDefaultsStore }) {}

  phases(): AgentPhase[] {
    const defaults = this.deps.agentDefaults.all();
    return this.deps.playbooks.lifecycles().flatMap((lifecycle) =>
      lifecycle.phases
        .filter((phase) => phase.skill !== undefined)
        .map((phase) => {
          const key = choiceKey(lifecycle.id, phase.id);
          return { key, lifecycleId: lifecycle.id, phaseId: phase.id, choice: defaults[key] ?? NO_CHOICE };
        }),
    );
  }

  update(defaults: AgentDefaults): AgentPhase[] {
    const known = new Set(this.phases().map((phase) => phase.key));
    const unknown = Object.keys(defaults).filter((key) => !known.has(key));
    if (unknown.length > 0) throw new DomainError(`No agent phase ${unknown.join(', ')}`);
    this.deps.agentDefaults.replace(Object.fromEntries(Object.entries(defaults).filter(([, choice]) => choice.model || choice.effort)));
    return this.phases();
  }
}
