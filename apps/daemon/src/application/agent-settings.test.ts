import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsPlaybookRegistry } from '../adapters/fs-playbooks/fs-playbook-registry.js';
import { InMemoryAgentDefaultsStore } from '../adapters/in-memory/in-memory-repositories.js';
import { DomainError } from '../domain/errors.js';
import { AgentSettings } from './agent-settings.js';

const PLAYBOOKS = fileURLToPath(new URL('../../../../playbooks', import.meta.url));

describe('AgentSettings', () => {
  it('lists every phase run by an agent with its default choice, under a global default of Opus xhigh', () => {
    const settings = new AgentSettings({ playbooks: new FsPlaybookRegistry(PLAYBOOKS), agentDefaults: new InMemoryAgentDefaultsStore({ 'task.spec': { model: 'sonnet', effort: null } }) });

    const view = settings.view();

    expect(view.fallback).toEqual({ model: 'opus', effort: 'xhigh' });
    expect(view.phases.map((phase) => phase.key)).toEqual(expect.arrayContaining(['epic.breakdown', 'task.spec', 'task.execute', 'task.sync']));
    expect(view.phases.find((phase) => phase.key === 'task.spec')?.choice).toEqual({ model: 'sonnet', effort: null });
    expect(view.phases.find((phase) => phase.key === 'task.plan')?.choice).toEqual({ model: null, effort: null });
  });

  it('saves the global default and only the phases that set something, and refuses unknown phases', () => {
    const store = new InMemoryAgentDefaultsStore();
    const settings = new AgentSettings({ playbooks: new FsPlaybookRegistry(PLAYBOOKS), agentDefaults: store });

    const view = settings.update({ model: null, effort: 'high' }, { 'task.execute': { model: 'opus', effort: 'max' }, 'task.spec': { model: null, effort: null } });

    expect(store.all()).toEqual({ '*': { model: null, effort: 'high' }, 'task.execute': { model: 'opus', effort: 'max' } });
    expect(view.fallback).toEqual({ model: null, effort: 'high' });
    expect(() => settings.update({ model: null, effort: null }, { 'task.verify': { model: 'haiku', effort: null } })).toThrow(DomainError);
  });
});
