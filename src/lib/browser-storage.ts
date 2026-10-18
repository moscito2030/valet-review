import { withIdentity } from './identity';
import { validateDataset, type Dataset, type Board } from './model';
import { storageKey } from './remove-board';

const sameBoard = (a: Board, b: Board) => a.number === b.number && a.dealer === b.dealer && a.vulnerability === b.vulnerability &&
  (['N', 'E', 'S', 'W'] as const).every(seat => [...a.deal[seat]].sort().join() === [...b.deal[seat]].sort().join());
function availableId(id: string, used: Set<string>) {
  if (!used.has(id)) return id;
  let n = 2;
  while (used.has(`${id.slice(0, 100)}~${n}`)) n++;
  return `${id.slice(0, 100)}~${n}`;
}
export function appendToBrowser(current: Dataset, storage: Pick<Storage, 'getItem' | 'setItem'>): Dataset {
  const incoming = withIdentity(current);
  const raw = storage.getItem(storageKey);
  const saved = raw ? withIdentity(validateDataset(JSON.parse(raw))) : validateDataset({ version: 1, boards: [], results: [] });
  const boards = [...saved.boards], results = [...saved.results];
  const boardIds = new Set(boards.map(b => b.id)), resultIds = new Set(results.map(r => r.id));
  const mapping = new Map<string, string>();
  for (const board of incoming.boards) {
    const match = boards.find(b => b.originKey === board.originKey);
    if (match && !sameBoard(match, board)) throw new Error('同一來源牌局的牌型或基本資料不一致，請先移除舊牌局再儲存');
    const id = match?.id ?? availableId(board.id, boardIds);
    if (!match) { boards.push({ ...board, id }); boardIds.add(id); }
    mapping.set(board.id, id);
  }
  let selectedResultId: string | undefined;
  for (const result of incoming.results) {
    const boardId = mapping.get(result.boardId)!;
    const existing = results.findIndex(r => r.boardId === boardId && r.originKey === result.originKey);
    const id = existing >= 0 ? results[existing].id : availableId(result.id, resultIds);
    const next = { ...result, id, boardId };
    if (existing >= 0) results[existing] = next;
    else { results.push(next); resultIds.add(id); }
    if (result.id === incoming.selectedResultId) selectedResultId = id;
  }
  const merged = validateDataset({ version: 1, boards, results, selectedBoardId: mapping.get(incoming.selectedBoardId ?? incoming.boards[0]?.id), selectedResultId });
  storage.setItem(storageKey, JSON.stringify(merged));
  return merged;
}
