import { describe, expect, it } from 'vitest';
import { serpentine, type Slot } from './serpentine';

const rowSizes = (slots: readonly Slot[]): number[] =>
  slots.reduce<number[]>((sizes, slot) => {
    sizes[slot.row] = (sizes[slot.row] ?? 0) + 1;
    return sizes;
  }, []);

describe('serpentine', () => {
  it('keeps stations that fit on one row, left to right', () => {
    expect(serpentine(3, 4)).toEqual([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 0, column: 2 },
    ]);
  });

  it('takes the fewest rows for a longer line', () => {
    expect(Math.max(...serpentine(13, 4).map((slot) => slot.row)) + 1).toBe(4);
  });

  it('fills the rows evenly, never leaving one station alone on the last row', () => {
    expect(rowSizes(serpentine(13, 4))).toEqual([4, 3, 3, 3]);
    expect(rowSizes(serpentine(5, 4))).toEqual([3, 2]);
  });

  it('snakes back and forth, each row starting under the end of the previous one', () => {
    const slots = serpentine(13, 4);
    for (const [index, slot] of slots.entries()) {
      expect(slot.column).toBeGreaterThanOrEqual(0);
      expect(slot.column).toBeLessThanOrEqual(3);
      const previous = slots[index - 1];
      if (!previous) continue;
      if (previous.row === slot.row) expect(slot.column - previous.column).toBe(slot.row % 2 === 0 ? 1 : -1);
      else expect(slot.column).toBe(previous.column);
    }
    expect(slots.map((slot) => slot.row)).toEqual([...slots.map((slot) => slot.row)].sort((a, b) => a - b));
  });

  it('gives no slot to an empty line and at least one column to a tiny frame', () => {
    expect(serpentine(0, 4)).toEqual([]);
    expect(serpentine(2, 0)).toEqual([
      { row: 0, column: 0 },
      { row: 1, column: 0 },
    ]);
  });
});
