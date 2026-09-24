export const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'changes-requested'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          file: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['severity', 'summary'],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
} as const;
