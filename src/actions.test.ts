import { describe, expect, it } from 'vitest';
import { deleteCard, findCard, isSamePlace, moveCard, replaceCard } from './actions';
import { parseProject, type Project } from './format';

const project = () =>
  parseProject('# P\n\n## B\n\n### Backlog\n\n#### A\n\n#### B\n\n#### C\n\n### Ready\n\n#### D\n\n## Other\n\n### Backlog\n\n#### E\n');
const id = (p: Project, title: string) => p.boards.flatMap((b) => b.columns.flat()).find((c) => c.title === title)!.id;
const titles = (p: Project, board = 0) => p.boards[board].columns.map((cards) => cards.map((c) => c.title));

describe('moveCard', () => {
  it('reorders within a column', () => {
    const p = project();
    expect(titles(moveCard(p, id(p, 'A'), 0, 2))[0]).toEqual(['B', 'C', 'A']);
    expect(titles(moveCard(p, id(p, 'C'), 0, 0))[0]).toEqual(['C', 'A', 'B']);
    expect(titles(moveCard(p, id(p, 'A'), 0, 1))[0]).toEqual(['B', 'A', 'C']);
  });

  it('moves between columns at the given position', () => {
    const p = project();
    const moved = moveCard(p, id(p, 'B'), 1, 0);
    expect(titles(moved)).toEqual([['A', 'C'], ['B', 'D'], [], [], []]);
    expect(titles(moveCard(p, id(p, 'B'), 4, 0))[4]).toEqual(['B']);
  });

  it('clamps the position and leaves other boards and the original alone', () => {
    const p = project();
    const moved = moveCard(p, id(p, 'A'), 1, 99);
    expect(titles(moved)[1]).toEqual(['D', 'A']);
    expect(moved.boards[1]).toBe(p.boards[1]);
    expect(titles(p)[0]).toEqual(['A', 'B', 'C']);
  });

  it('knows when a drop changes nothing', () => {
    const p = project();
    expect(isSamePlace(p, id(p, 'B'), 0, 1)).toBe(true);
    expect(isSamePlace(p, id(p, 'B'), 0, 2)).toBe(false);
    expect(isSamePlace(p, id(p, 'B'), 1, 1)).toBe(false);
  });
});

describe('card edits', () => {
  it('finds, replaces and deletes cards on any board', () => {
    const p = project();
    expect(findCard(p, id(p, 'E'))).toMatchObject({ column: 0, index: 0, board: { name: 'Other' } });
    const edited = replaceCard(p, { ...findCard(p, id(p, 'E'))!.card, title: 'E2', checklist: [{ text: 'x', done: true }] });
    expect(titles(edited, 1)[0]).toEqual(['E2']);
    expect(edited.boards[0]).toBe(p.boards[0]);
    expect(titles(deleteCard(p, id(p, 'B')))[0]).toEqual(['A', 'C']);
    expect(findCard(p, 'missing')).toBeNull();
    expect(deleteCard(p, 'missing')).toBe(p);
  });
});
