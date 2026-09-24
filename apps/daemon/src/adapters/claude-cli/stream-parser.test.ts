import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../application/ports/agent-runner.js';
import { ClaudeStreamParser } from './stream-parser.js';

const replay = (fixture: string, parser = new ClaudeStreamParser()): AgentEvent[] =>
  readFileSync(new URL(`./fixtures/${fixture}.jsonl`, import.meta.url), 'utf8')
    .split('\n')
    .flatMap((line) => parser.push(line));

describe('ClaudeStreamParser on recorded runs', () => {
  it('turns a run with a failing tool into calls, a failure, deduplicated usage without cache reads, and a success', () => {
    const events = replay('tool-failure');

    expect(events.filter((event) => event.type !== 'usage')).toEqual([
      { type: 'text', text: 'Agent setup — skills: none · MCP: none · plugins: none' },
      { type: 'tool-call', tool: 'Bash', summary: 'false' },
      { type: 'tool-failure', tool: 'Bash', signature: 'Bash:Exit code 1', summary: 'Exit code 1' },
      { type: 'text', text: 'done' },
      { type: 'finished', outcome: 'success', summary: 'done', structuredOutput: null },
    ]);
    const usage = events.filter((event) => event.type === 'usage');
    expect(usage).toHaveLength(2);
    expect(usage.at(-1)).toEqual({ type: 'usage', inputTokens: 10 + 8123 + 8 + 926, outputTokens: 4 + 2 });
  });

  it('reads the structured output of a schema-constrained run', () => {
    const finished = replay('structured').find((event) => event.type === 'finished');
    expect(finished).toMatchObject({ outcome: 'success', structuredOutput: { decisions: [{ options: [{ recommended: false }, { recommended: true }] }] } });
  });

  it('reads a resumed run', () => {
    expect(replay('resume').at(-1)).toMatchObject({ type: 'finished', outcome: 'success', summary: 'again' });
  });
});

describe('ClaudeStreamParser outcomes', () => {
  const result = (fields: Record<string, unknown>): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'x', ...fields });

  it('maps max turns, errors, rejected quota and interruption', () => {
    expect(new ClaudeStreamParser().push(result({ subtype: 'error_max_turns', is_error: true }))[0]).toMatchObject({ outcome: 'max-turns' });
    expect(new ClaudeStreamParser().push(result({ subtype: 'error_during_execution', is_error: true }))[0]).toMatchObject({ outcome: 'error' });

    const quota = new ClaudeStreamParser();
    quota.push(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }));
    expect(quota.push(result({ is_error: true }))[0]).toMatchObject({ outcome: 'quota-exhausted' });

    const interrupted = new ClaudeStreamParser();
    interrupted.markInterrupted();
    expect(interrupted.push(result({ subtype: 'error_during_execution' }))[0]).toMatchObject({ outcome: 'interrupted' });
    expect(interrupted.hasFinished).toBe(true);
  });

  it('keeps unparseable output as text and ignores blank lines', () => {
    expect(new ClaudeStreamParser().push('Error: not logged in')).toEqual([{ type: 'text', text: 'Error: not logged in' }]);
    expect(new ClaudeStreamParser().push('  ')).toEqual([]);
  });
});

describe('ClaudeStreamParser isolation audit', () => {
  const init = (fields: Record<string, unknown>): string =>
    JSON.stringify({ type: 'system', subtype: 'init', skills: ['spec', 'plan'], mcp_servers: [], plugins: [{ name: 'agents-md', path: 'builtin' }], ...fields });
  const expected = { skills: ['spec', 'plan'], mcpServers: ['graph'], plugins: ['agents-md', 'telemetry'] };

  it('reports what the agent loaded and lets a clean run continue', () => {
    const parser = new ClaudeStreamParser(expected);
    expect(parser.push(init({}))).toEqual([{ type: 'text', text: 'Agent setup — skills: spec, plan · MCP: none · plugins: agents-md' }]);
    expect(parser.hasBreached).toBe(false);
  });

  it('stops the run on any unexpected skill, MCP server or plugin', () => {
    const parser = new ClaudeStreamParser(expected);
    const events = parser.push(init({ skills: ['spec', 'brain-access'], mcp_servers: [{ name: 'gmail', status: 'connected' }], plugins: [{ name: 'mattpocock-skills' }] }));
    expect(events.at(-1)).toMatchObject({
      type: 'finished',
      outcome: 'isolation-breach',
      summary: expect.stringContaining('skill brain-access, MCP server gmail, plugin mattpocock-skills'),
    });
    expect(parser.hasBreached).toBe(true);
    expect(parser.hasFinished).toBe(true);
  });

  it('does not audit when no profile is expected', () => {
    expect(new ClaudeStreamParser().push(init({ skills: ['anything'] }))).toHaveLength(1);
  });
});
