import type { Board, Card, Project } from './format';

/** Where a card is: its board, column and position. */
export function findCard(project: Project, cardId: string) {
  for (const board of project.boards) {
    for (let column = 0; column < board.columns.length; column++) {
      const index = board.columns[column].findIndex((c) => c.id === cardId);
      if (index >= 0) return { board, column, index, card: board.columns[column][index] };
    }
  }
  return null;
}

function updateBoard(project: Project, boardId: string, update: (b: Board) => Board): Project {
  return { ...project, boards: project.boards.map((b) => (b.id === boardId ? update(b) : b)) };
}

/**
 * Moves a card to a column and position. `index` counts the destination's
 * cards without the moved card, which is what a drop placeholder shows.
 */
export function moveCard(project: Project, cardId: string, column: number, index: number): Project {
  const found = findCard(project, cardId);
  if (!found) return project;
  return updateBoard(project, found.board.id, (b) => {
    const columns = b.columns.map((cards) => cards.filter((c) => c.id !== cardId));
    columns[column].splice(Math.max(0, Math.min(index, columns[column].length)), 0, found.card);
    return { ...b, columns };
  });
}

/** True when moving would leave the card where it is. */
export function isSamePlace(project: Project, cardId: string, column: number, index: number) {
  const found = findCard(project, cardId);
  return Boolean(found && found.column === column && found.index === index);
}

export function replaceCard(project: Project, card: Card): Project {
  const found = findCard(project, card.id);
  if (!found) return project;
  return updateBoard(project, found.board.id, (b) => ({
    ...b,
    columns: b.columns.map((cards) => cards.map((c) => (c.id === card.id ? card : c))),
  }));
}

export function deleteCard(project: Project, cardId: string): Project {
  const found = findCard(project, cardId);
  if (!found) return project;
  return updateBoard(project, found.board.id, (b) => ({
    ...b,
    columns: b.columns.map((cards) => cards.filter((c) => c.id !== cardId)),
  }));
}
