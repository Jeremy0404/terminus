import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskNotes } from '../../application/ports/task-notes.js';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class FsTaskNotes implements TaskNotes {
  constructor(private readonly root: string) {}

  directoryFor(taskId: string): string {
    if (!SAFE_ID.test(taskId)) throw new Error(`Unsafe task id: ${taskId}`);
    const directory = join(this.root, taskId);
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  read(taskId: string, file: string): string | null {
    if (!SAFE_ID.test(file.replace(/\.(md|json)$/, ''))) throw new Error(`Unsafe note name: ${file}`);
    const path = join(this.directoryFor(taskId), file);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  }
}
