import type { AppStack, VerificationCommand } from '../domain/app.js';

export const STACK_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    stackId: { type: 'string' },
    stackName: { type: 'string' },
    decisions: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' }, decision: { type: 'string' }, why: { type: 'string' } }, required: ['title', 'decision', 'why'] },
    },
    verification: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, command: { type: 'string' } }, required: ['name', 'command'] },
    },
  },
  required: ['summary', 'stackId', 'stackName', 'decisions', 'verification'],
} as const;

export interface ChosenStack {
  readonly stack: AppStack;
  readonly verification: readonly VerificationCommand[];
}

export function readStack(output: unknown): ChosenStack | null {
  if (!isRecord(output) || !text(output['stackId']) || !text(output['stackName'])) return null;
  const decisions = records(output['decisions'])
    .filter((entry) => text(entry['title']) && text(entry['decision']))
    .map((entry) => ({ title: text(entry['title']), decision: text(entry['decision']), why: text(entry['why']) }));
  const verification = records(output['verification'])
    .filter((entry) => text(entry['name']) && text(entry['command']))
    .map((entry) => ({ name: text(entry['name']), command: text(entry['command']) }));
  return { stack: { id: text(output['stackId']), name: text(output['stackName']), decisions }, verification };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
