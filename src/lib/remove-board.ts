import { validateDataset, type Dataset } from './model';

export const storageKey = 'valet-review:v1';

export function removeBoard(data: Dataset, boardId: string): Dataset {
  const index = data.boards.findIndex(board => board.id === boardId);
  if (index < 0) throw new Error('找不到要移除的牌局');
  const boards = data.boards.filter(board => board.id !== boardId);
  return validateDataset({
    ...data,
    boards,
    results: data.results.filter(result => result.boardId !== boardId),
    selectedBoardId: boards[Math.min(index, boards.length - 1)]?.id,
    selectedResultId: undefined,
  });
}

// Persist before updating the screen; storage failures leave the current review intact.
export function removeAndSaveBoard(data: Dataset, boardId: string, storage: Pick<Storage, 'setItem'>): Dataset {
  const next = removeBoard(data, boardId);
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}
