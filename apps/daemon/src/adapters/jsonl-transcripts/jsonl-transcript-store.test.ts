import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonlTranscriptStore } from './jsonl-transcript-store.js';

let directory: string;
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('JsonlTranscriptStore', () => {
  it('appends events in order and reads them back', () => {
    directory = mkdtempSync(join(tmpdir(), 'terminus-runs-'));
    const store = new JsonlTranscriptStore(join(directory, 'runs'));

    store.append('run-1', { type: 'system', subtype: 'init' });
    store.append('run-1', { type: 'result', usage: { output_tokens: 12 } });
    store.append('run-2', { type: 'system' });

    expect(store.read('run-1')).toEqual([{ type: 'system', subtype: 'init' }, { type: 'result', usage: { output_tokens: 12 } }]);
    expect(store.read('unknown')).toEqual([]);
  });

  it('refuses run ids that could escape the directory', () => {
    directory = mkdtempSync(join(tmpdir(), 'terminus-runs-'));
    expect(() => new JsonlTranscriptStore(directory).append('../evil', {})).toThrow(/Unsafe run id/);
  });
});
