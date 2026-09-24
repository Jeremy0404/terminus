const LINE_COLORS = ['var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)', 'var(--l5)', 'var(--l6)'];

export const lineColor = (position: number): string => LINE_COLORS[(position - 1) % LINE_COLORS.length] ?? 'var(--l1)';
