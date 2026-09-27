export interface Slot {
  readonly row: number;
  readonly column: number;
}

export function serpentine(count: number, columns: number): readonly Slot[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / Math.max(1, columns));
  const sizes = Array.from({ length: rows }, (_, row) => Math.floor(count / rows) + (row < count % rows ? 1 : 0));
  const slots: Slot[] = [];
  let column = 0;
  for (const [row, size] of sizes.entries()) {
    const direction = row % 2 === 0 ? 1 : -1;
    for (let index = 0; index < size; index += 1) slots.push({ row, column: column + index * direction });
    column += (size - 1) * direction;
  }
  return slots;
}
