export interface DecisionOption {
  readonly label: string;
  readonly description: string;
  readonly recommended: boolean;
}

export type DecisionAnswer = { readonly kind: 'option'; readonly index: number } | { readonly kind: 'other'; readonly text: string };

export type DecisionKind = 'question' | 'deviation' | 'proposal';

export interface Decision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly taskId: string;
  readonly phaseIndex: number;
  readonly question: string;
  readonly options: readonly DecisionOption[];
  readonly answer: DecisionAnswer | null;
  readonly createdAt: string;
  readonly answeredAt: string | null;
}
