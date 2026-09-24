export interface AgentRunRequest {
  readonly runId: string;
  readonly sessionId: string;
  readonly resume: boolean;
  readonly cwd: string;
  readonly prompt: string;
  readonly systemPromptAppend: string;
  readonly skill: string | null;
  readonly model: string | null;
  readonly maxTurns: number;
  readonly outputSchema: object | null;
}

export type AgentOutcome = 'success' | 'error' | 'max-turns' | 'interrupted' | 'quota-exhausted';

export type AgentEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool-call'; readonly tool: string; readonly summary: string }
  | { readonly type: 'tool-failure'; readonly tool: string; readonly signature: string; readonly summary: string }
  | { readonly type: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: 'finished'; readonly outcome: AgentOutcome; readonly summary: string; readonly structuredOutput: unknown };

export interface AgentRun {
  readonly events: AsyncIterable<AgentEvent>;
  interrupt(): void;
}

export interface AgentRunner {
  start(request: AgentRunRequest): AgentRun;
}
