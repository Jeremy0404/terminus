import type { AgentDefaults } from '../../domain/agent-choice.js';

export interface AgentDefaultsStore {
  all(): AgentDefaults;
  replace(defaults: AgentDefaults): void;
}
