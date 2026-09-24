import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FsPlaybookRegistry, PlaybookError } from './fs-playbook-registry.js';

const REPO_PLAYBOOKS = fileURLToPath(new URL('../../../../../playbooks', import.meta.url));

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function playbooks(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'terminus-playbooks-'));
  for (const [folder, content] of Object.entries(files)) {
    mkdirSync(join(root, folder));
    writeFileSync(join(root, folder, 'lifecycle.yaml'), content);
  }
  return root;
}

describe('FsPlaybookRegistry', () => {
  it('loads a lifecycle with its gates, skills and a content-hash version', () => {
    const registry = new FsPlaybookRegistry(
      playbooks({ task: 'id: task\nphases:\n  - id: plan\n    skill: plan\n    gate: plan-approval\n  - id: merge\n    gate: merge\n' }),
    );

    const lifecycle = registry.lifecycle('task');
    expect(lifecycle.phases).toEqual([
      { id: 'plan', skill: 'plan', gate: 'plan-approval' },
      { id: 'merge', gate: 'merge' },
    ]);
    expect(lifecycle.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('gives a new version whenever the file content changes', () => {
    const first = new FsPlaybookRegistry(playbooks({ task: 'id: task\nphases:\n  - id: spec\n' })).lifecycle('task').version;
    rmSync(root, { recursive: true, force: true });
    const second = new FsPlaybookRegistry(playbooks({ task: 'id: task\nphases:\n  - id: spec\n  - id: plan\n' })).lifecycle('task').version;
    expect(second).not.toBe(first);
  });

  it.each([
    ['an unknown gate', 'id: task\nphases:\n  - id: plan\n    gate: whenever\n'],
    ['duplicate phase ids', 'id: task\nphases:\n  - id: plan\n  - id: plan\n'],
    ['no phases', 'id: task\nphases: []\n'],
    ['an unknown key', 'id: task\nphases:\n  - id: plan\n    budget: 3\n'],
    ['an id that does not match its folder', 'id: epic\nphases:\n  - id: plan\n'],
  ])('rejects %s', (_label, content) => {
    expect(() => new FsPlaybookRegistry(playbooks({ task: content }))).toThrow(PlaybookError);
  });

  it('reports an unknown lifecycle', () => {
    expect(() => new FsPlaybookRegistry(playbooks({})).lifecycle('task')).toThrow(/No playbook defines the task lifecycle/);
  });

  it('accepts the playbooks shipped in the repository', () => {
    root = mkdtempSync(join(tmpdir(), 'unused-'));
    const registry = new FsPlaybookRegistry(REPO_PLAYBOOKS);
    expect(registry.lifecycles().map((lifecycle) => lifecycle.id).sort()).toEqual(['app', 'epic', 'task']);
    expect(registry.lifecycle('task').phases.map((phase) => phase.id)).toEqual([
      'spec',
      'grill',
      'plan',
      'execute',
      'verify',
      'review',
      'merge',
    ]);
  });
});
