import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FsSkillCatalog } from './fs-skill-catalog.js';

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('FsSkillCatalog', () => {
  it('lists every skill with the date its sources were researched', () => {
    root = mkdtempSync(join(tmpdir(), 'terminus-skills-'));
    mkdirSync(join(root, 'task', 'skills', 'spec'), { recursive: true });
    mkdirSync(join(root, 'task', 'skills', 'grill'), { recursive: true });
    writeFileSync(join(root, 'task', 'skills', 'spec', 'SOURCES.md'), '# Sources\n\nResearched 2026-08-01.\n');

    expect(new FsSkillCatalog(root).skills()).toEqual([
      { name: 'grill', playbook: 'task', researched: null },
      { name: 'spec', playbook: 'task', researched: '2026-08-01' },
    ]);
  });

  it('finds a research date on every skill shipped in the repository', () => {
    root = mkdtempSync(join(tmpdir(), 'unused-'));
    const shipped = new FsSkillCatalog(fileURLToPath(new URL('../../../../../playbooks', import.meta.url))).skills();
    expect(shipped.length).toBeGreaterThan(15);
    expect(shipped.filter((skill) => skill.researched === null)).toEqual([]);
  });
});
