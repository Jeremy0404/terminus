import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsRepositoryKnowledge } from './fs-repository-knowledge.js';

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'terminus-knowledge-'));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('FsRepositoryKnowledge', () => {
  it('finds nothing in a bare repository', () => {
    const knowledge = new FsRepositoryKnowledge();
    expect(knowledge.contextDoc(repo)).toBeNull();
    expect(knowledge.decisions(repo)).toEqual([]);
  });

  it('reads CONTEXT.md and indexes decision records by their title', () => {
    writeFileSync(join(repo, 'CONTEXT.md'), 'A line is an epic.');
    mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'adr', '0002-hono.md'), '---\nstatus: accepted\n---\n\n# Serve the API with Hono\n');
    writeFileSync(join(repo, 'docs', 'adr', '0001-sqlite.md'), 'No heading here');
    writeFileSync(join(repo, 'docs', 'adr', 'README.md'), '# Decisions');

    const knowledge = new FsRepositoryKnowledge();

    expect(knowledge.contextDoc(repo)).toBe('A line is an epic.');
    expect(knowledge.decisions(repo)).toEqual([
      { path: 'docs/adr/0001-sqlite.md', title: '0001-sqlite' },
      { path: 'docs/adr/0002-hono.md', title: 'Serve the API with Hono' },
    ]);
  });
});
