export interface StationDraft {
  readonly title: string;
  readonly understanding: string;
  readonly summary: string;
}

export const STATION_DRAFT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    understanding: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['title', 'understanding', 'summary'],
} as const;

export function readStationDraft(output: unknown): StationDraft | null {
  if (!isRecord(output)) return null;
  const title = textOf(output['title']);
  return title ? { title, understanding: textOf(output['understanding']), summary: textOf(output['summary']) } : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
