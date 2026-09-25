import { describe, expect, it } from 'vitest';
import { readStationDraft } from './station-draft-output.js';

describe('readStationDraft', () => {
  it('reads the title, understanding and summary, trimmed', () => {
    expect(readStationDraft({ title: '  Add a way back from the settings \n', understanding: ' No link back. ', summary: '\nAdd one.\n' })).toEqual({
      title: 'Add a way back from the settings',
      understanding: 'No link back.',
      summary: 'Add one.',
    });
  });

  it('gives nothing without a usable title', () => {
    expect(readStationDraft({ understanding: 'u', summary: 's' })).toBeNull();
    expect(readStationDraft({ title: '   ', understanding: 'u', summary: 's' })).toBeNull();
    expect(readStationDraft({ title: 42, understanding: 'u', summary: 's' })).toBeNull();
  });

  it('gives nothing for output that is not an object', () => {
    expect(readStationDraft(null)).toBeNull();
    expect(readStationDraft([{ title: 't' }])).toBeNull();
    expect(readStationDraft('Add a way back')).toBeNull();
  });

  it('leaves a missing understanding or summary empty', () => {
    expect(readStationDraft({ title: 'Add a way back', summary: 7 })).toEqual({ title: 'Add a way back', understanding: '', summary: '' });
  });
});
