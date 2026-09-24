export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type Effort = (typeof EFFORTS)[number];

export interface AgentChoice {
  readonly model: string | null;
  readonly effort: Effort | null;
}

export const NO_CHOICE: AgentChoice = { model: null, effort: null };

export type AgentDefaults = Readonly<Record<string, AgentChoice>>;

export const choiceKey = (lifecycleId: string, phaseId: string): string => `${lifecycleId}.${phaseId}`;

export function resolveChoice(...layers: readonly (Partial<AgentChoice> | undefined)[]): AgentChoice {
  return {
    model: layers.find((layer) => layer?.model)?.model ?? null,
    effort: layers.find((layer) => layer?.effort)?.effort ?? null,
  };
}
