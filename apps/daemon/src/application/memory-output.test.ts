import { describe, expect, it } from 'vitest';
import { readMemoryOutput } from './memory-output.js';

describe('readMemoryOutput', () => {
  it('reads proposed lessons and terms, skipping empty ones', () => {
    expect(
      readMemoryOutput({
        summary: 'Two things learned',
        lessons: [{ text: ' Run the migrations first. ', why: 'The tests failed twice without it.' }, { text: '  ', why: 'empty' }],
        terms: [{ term: 'Station', definition: 'A task on a line.', why: 'Used everywhere in the UI.' }, { term: 'Line', definition: '', why: 'x' }],
      }),
    ).toEqual([
      { proposed: { kind: 'lesson', text: 'Run the migrations first.' }, why: 'The tests failed twice without it.' },
      { proposed: { kind: 'term', term: 'Station', definition: 'A task on a line.' }, why: 'Used everywhere in the UI.' },
    ]);
  });

  it('keeps at most five of each and ignores anything malformed', () => {
    const lessons = Array.from({ length: 7 }, (_, index) => ({ text: `Lesson ${index}`, why: '' }));
    expect(readMemoryOutput({ lessons, terms: 'nope' })).toHaveLength(5);
    expect(readMemoryOutput(null)).toEqual([]);
  });

  it('keeps obsolete flags only for the open stations it was shown', () => {
    const output = { lessons: [], terms: [], obsolete: [{ stationId: 'task-1', reason: 'Done by this merge.' }, { stationId: 'task-9', reason: 'Unknown.' }] };

    expect(readMemoryOutput(output, new Set(['task-1', 'task-2']))).toEqual([{ proposed: { kind: 'obsolete', targetTaskId: 'task-1' }, why: 'Done by this merge.' }]);
    expect(readMemoryOutput(output)).toEqual([]);
  });
});
