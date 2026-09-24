import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TranscriptStore } from '../../application/ports/transcript-store.js';

const SAFE_RUN_ID = /^[A-Za-z0-9_-]+$/;

export class JsonlTranscriptStore implements TranscriptStore {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }

  append(runId: string, event: unknown): void {
    appendFileSync(this.pathFor(runId), `${JSON.stringify(event)}\n`);
  }

  read(runId: string): unknown[] {
    const path = this.pathFor(runId);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown);
  }

  private pathFor(runId: string): string {
    if (!SAFE_RUN_ID.test(runId)) throw new Error(`Unsafe run id: ${runId}`);
    return join(this.directory, `${runId}.jsonl`);
  }
}
