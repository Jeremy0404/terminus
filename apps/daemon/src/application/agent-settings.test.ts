import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { InMemoryAgentDefaultsStore } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { AgentSettings } from './agent-settings.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

describe('AgentSettings', () => {
  it('lists every phase run by an agent with its default choice', () => {
    const settings = new AgentSettings({ playbooks: new FsPlaybookRegistry(PLAYBOOKS), agentDefaults: new InMemoryAgentDefaultsStore({ 'task.spec': { model: 'sonnet', effort: null } }) });

    expect(settings.phases().map((phase) => phase.key)).toEqual(['epic.breakdown', 'task.spec', 'task.grill', 'task.plan', 'task.execute', 'task.review', 'task.sync']);
    expect(settings.phases().find((phase) => phase.key === 'task.spec')?.choice).toEqual({ model: 'sonnet', effort: null });
    expect(settings.phases().find((phase) => phase.key === 'task.plan')?.choice).toEqual({ model: null, effort: null });
  });

  it('saves only the phases that set something and refuses unknown phases', () => {
    const store = new InMemoryAgentDefaultsStore();
    const settings = new AgentSettings({ playbooks: new FsPlaybookRegistry(PLAYBOOKS), agentDefaults: store });

    settings.update({ 'task.execute': { model: 'opus', effort: 'high' }, 'task.spec': { model: null, effort: null } });

    expect(store.all()).toEqual({ 'task.execute': { model: 'opus', effort: 'high' } });
    expect(() => settings.update({ 'task.verify': { model: 'haiku', effort: null } })).toThrow(DomainError);
  });
});
