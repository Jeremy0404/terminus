import { describe, expect, it } from 'vitest';
import { readReadiness } from './readiness-output.js';

describe('readReadiness', () => {
  it('reads a ready output', () => {
    expect(readReadiness({ summary: 'all visible', ready: true, missing: [] })).toEqual({ ready: true, missing: [] });
  });

  it('reads a not-ready output with its missing items', () => {
    const output = {
      summary: 'two gaps',
      ready: false,
      missing: [
        { check: 'dns', detail: 'app.example.com resolves to nothing' },
        { check: 'secrets', detail: 'SSH_KEY is not set' },
      ],
    };
    expect(readReadiness(output)).toEqual({ ready: false, missing: output.missing });
  });

  it('ignores malformed outputs rather than acting on them', () => {
    expect(readReadiness(null)).toBeNull();
    expect(readReadiness({ summary: 's', missing: [] })).toBeNull();
    expect(readReadiness({ summary: 's', ready: 'no', missing: [] })).toBeNull();
    expect(readReadiness({ summary: 's', ready: false, missing: 'dns' })).toBeNull();
  });

  it('drops missing items that are not shaped as a check and a detail', () => {
    expect(readReadiness({ summary: 's', ready: false, missing: [{ check: 'dns' }, { check: 'tls', detail: 'no certificate' }] })).toEqual({
      ready: false,
      missing: [{ check: 'tls', detail: 'no certificate' }],
    });
  });
});
