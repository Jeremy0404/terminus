import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsTaskNotes } from './fs-task-notes.js';

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('FsTaskNotes', () => {
  it('creates one notes folder per task outside any repository', () => {
    root = mkdtempSync(join(tmpdir(), 'terminus-notes-'));
    const directory = new FsTaskNotes(join(root, 'tasks')).directoryFor('task-1');
    expect(directory).toBe(join(root, 'tasks', 'task-1'));
    expect(existsSync(directory)).toBe(true);
    expect(() => new FsTaskNotes(root).directoryFor('../escape')).toThrow(/Unsafe task id/);
  });

  it('reads optional preview metadata without accepting directory traversal', () => {
    root = mkdtempSync(join(tmpdir(), 'terminus-notes-'));
    const notes = new FsTaskNotes(root);
    writeFileSync(join(notes.directoryFor('task-1'), 'preview.json'), '{"after":"https://example.com"}');
    expect(notes.read('task-1', 'preview.json')).toContain('https://example.com');
    expect(() => notes.read('task-1', '../preview.json')).toThrow(/Unsafe note name/);
  });
});
