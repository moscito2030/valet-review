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
export function removeAndSaveBoard(data: Dataset, boardId: string, storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'getItem'>>): Dataset {
  const next = removeBoard(data, boardId);
  let persisted = next;
  if (storage.getItem) {
    const raw = storage.getItem(storageKey);
    const saved = raw ? validateDataset(JSON.parse(raw)) : undefined;
    const target = data.boards.find(b => b.id === boardId)!;
    const stored = saved?.boards.find(b => target.originKey ? b.originKey === target.originKey : b.id === boardId);
    // Removing a board from an imported/shared view must not replace the saved library.
    if (saved) {
      persisted = stored && (target.originKey || JSON.stringify(stored) === JSON.stringify(target))
        ? removeBoard(saved, stored.id) : saved;
    }
  }
  storage.setItem(storageKey, JSON.stringify(persisted));
  return next;
}
