import type { DecisionOption } from '../domain/decision.js';

export interface ProposedDecision {
  readonly question: string;
  readonly options: readonly DecisionOption[];
}

export const DECISIONS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string', description: 'The user benefit of this option, in plain language.' },
                rationale: { type: 'string', description: 'Why this option fits the product goal; explain the recommendation when recommended.' },
                tradeoff: { type: 'string', description: 'The concrete cost, limitation or risk accepted by choosing this option.' },
                recommended: { type: 'boolean' },
              },
              required: ['label', 'description', 'recommended'],
            },
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  required: ['decisions'],
} as const;

export function readProposedDecisions(output: unknown): ProposedDecision[] {
  if (!isRecord(output) || !Array.isArray(output['decisions'])) return [];
  return output['decisions'].filter(isProposedDecision);
}

function isProposedDecision(value: unknown): value is ProposedDecision {
  return (
    isRecord(value) &&
    typeof value['question'] === 'string' &&
    Array.isArray(value['options']) &&
    value['options'].length >= 2 &&
    value['options'].every(
      (option) =>
        isRecord(option) &&
        typeof option['label'] === 'string' &&
        typeof option['description'] === 'string' &&
        typeof option['recommended'] === 'boolean' &&
        (option['rationale'] === undefined || typeof option['rationale'] === 'string') &&
        (option['tradeoff'] === undefined || typeof option['tradeoff'] === 'string'),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
