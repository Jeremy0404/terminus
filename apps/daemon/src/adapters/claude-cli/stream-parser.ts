import type { AgentEvent, AgentOutcome } from '../../application/ports/agent-runner.js';

const SUMMARY_CHARS = 200;

export interface ExpectedAgentSetup {
  readonly skills: readonly string[];
  readonly mcpServers: readonly string[];
  readonly plugins: readonly string[];
}

interface Usage {
  readonly input_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly output_tokens?: number;
}

export class ClaudeStreamParser {
  private readonly toolNames = new Map<string, string>();
  private readonly usageByMessage = new Map<string, { input: number; output: number }>();
  private quotaRejected = false;
  private interrupted = false;
  private finished = false;
  private breached = false;

  constructor(private readonly expected: ExpectedAgentSetup | null = null) {}

  get hasBreached(): boolean {
    return this.breached;
  }

  markInterrupted(): void {
    this.interrupted = true;
  }

  get hasFinished(): boolean {
    return this.finished;
  }

  push(line: string): AgentEvent[] {
    if (!line.trim()) return [];
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [{ type: 'text', text: line }];
    }
    switch (message['type']) {
      case 'system':
        return message['subtype'] === 'init' ? this.audit(message) : [];
      case 'assistant':
        return this.assistant(message);
      case 'user':
        return this.toolResults(message);
      case 'rate_limit_event': {
        const info = message['rate_limit_info'] as { status?: string } | undefined;
        if (info?.status === 'rejected') this.quotaRejected = true;
        return [];
      }
      case 'result':
        return [this.result(message)];
      default:
        return [];
    }
  }

  private audit(init: Record<string, unknown>): AgentEvent[] {
    const skills = names(init['skills']);
    const mcpServers = names(init['mcp_servers']);
    const plugins = names(init['plugins']);
    const loaded: AgentEvent = { type: 'text', text: `Agent setup — skills: ${list(skills)} · MCP: ${list(mcpServers)} · plugins: ${list(plugins)}` };
    if (!this.expected) return [loaded];
    const unexpected = [
      ...skills.filter((name) => !this.expected?.skills.includes(name)).map((name) => `skill ${name}`),
      ...mcpServers.filter((name) => !this.expected?.mcpServers.includes(name)).map((name) => `MCP server ${name}`),
      ...plugins.filter((name) => !this.expected?.plugins.includes(name)).map((name) => `plugin ${name}`),
    ];
    if (unexpected.length === 0) return [loaded];
    this.breached = true;
    this.finished = true;
    return [
      loaded,
      {
        type: 'finished',
        outcome: 'isolation-breach',
        summary: `The run was stopped before its first action: unexpected ${unexpected.join(', ')} loaded. Allow it in the agent profile or remove it from the repository.`,
        structuredOutput: null,
      },
    ];
  }

  private assistant(message: Record<string, unknown>): AgentEvent[] {
    const body = message['message'] as { id?: string; content?: Record<string, unknown>[]; usage?: Usage } | undefined;
    const events: AgentEvent[] = [];
    for (const block of body?.content ?? []) {
      if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim()) events.push({ type: 'text', text: block['text'] });
      if (block['type'] === 'tool_use') {
        const name = String(block['name']);
        this.toolNames.set(String(block['id']), name);
        events.push({ type: 'tool-call', tool: name, summary: summarize(block['input']) });
      }
    }
    if (body?.id && body.usage && !this.usageByMessage.has(body.id)) {
      const usage = body.usage;
      this.usageByMessage.set(body.id, {
        input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        output: usage.output_tokens ?? 0,
      });
      events.push(this.totalUsage());
    }
    return events;
  }

  private toolResults(message: Record<string, unknown>): AgentEvent[] {
    const body = message['message'] as { content?: Record<string, unknown>[] } | undefined;
    return (body?.content ?? [])
      .filter((block) => block['type'] === 'tool_result' && block['is_error'] === true)
      .map((block) => {
        const tool = this.toolNames.get(String(block['tool_use_id'])) ?? 'tool';
        const text = contentText(block['content']);
        return { type: 'tool-failure', tool, signature: `${tool}:${signatureOf(text)}`, summary: text.slice(0, SUMMARY_CHARS) } satisfies AgentEvent;
      });
  }

  private result(message: Record<string, unknown>): AgentEvent {
    this.finished = true;
    const subtype = String(message['subtype'] ?? '');
    let outcome: AgentOutcome = 'error';
    if (this.interrupted) outcome = 'interrupted';
    else if (this.quotaRejected || message['api_error_status'] === 429) outcome = 'quota-exhausted';
    else if (subtype === 'error_max_turns') outcome = 'max-turns';
    else if (subtype === 'success' && message['is_error'] !== true) outcome = 'success';
    return {
      type: 'finished',
      outcome,
      summary: typeof message['result'] === 'string' ? message['result'] : subtype,
      structuredOutput: message['structured_output'] ?? null,
    };
  }

  private totalUsage(): AgentEvent {
    let inputTokens = 0;
    let outputTokens = 0;
    for (const usage of this.usageByMessage.values()) {
      inputTokens += usage.input;
      outputTokens += usage.output;
    }
    return { type: 'usage', inputTokens, outputTokens };
  }
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item !== null && 'name' in item ? String(item.name) : String(item)));
}

function list(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function summarize(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const record = input as Record<string, unknown>;
  const main = record['command'] ?? record['file_path'] ?? record['pattern'] ?? record['path'] ?? record['url'] ?? record['description'];
  return String(main ?? JSON.stringify(record)).slice(0, SUMMARY_CHARS);
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '')).join('\n');
  return JSON.stringify(content);
}

function signatureOf(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim()) ?? '';
  return firstLine.replace(/\d+(\.\d+)?m?s\b/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
