import { describe, expect, it } from 'vitest';
import { readStack } from './stack-output.js';

describe('readStack', () => {
  it('reads the chosen stack, its decisions and its verification commands', () => {
    expect(
      readStack({
        summary: 'ok',
        stackId: ' stack-static-site ',
        stackName: 'Static site',
        decisions: [{ title: 'Hosting', decision: 'nginx', why: 'Simple' }, { title: '', decision: 'x', why: '' }],
        verification: [{ name: 'html', command: 'npx --yes html-validate "**/*.html"' }],
      }),
    ).toEqual({
      stack: { id: 'stack-static-site', name: 'Static site', decisions: [{ title: 'Hosting', decision: 'nginx', why: 'Simple' }] },
      verification: [{ name: 'html', command: 'npx --yes html-validate "**/*.html"' }],
    });
  });

  it('refuses an output without a stack', () => {
    expect(readStack({ summary: 'x', decisions: [] })).toBeNull();
  });
});
