import { withIdentity } from './identity';
import { validateDataset, type Dataset, type Board, type Result } from './model';
import { storageKey } from './remove-board';

const sameBoard = (a: Board, b: Board) => a.number === b.number && a.dealer === b.dealer && a.vulnerability === b.vulnerability &&
  (['N', 'E', 'S', 'W'] as const).every(seat => [...a.deal[seat]].sort().join() === [...b.deal[seat]].sort().join());
function availableId(id: string, used: Set<string>) {
  if (!used.has(id)) return id;
  let n = 2;
  while (used.has(`${id.slice(0, 100)}~${n}`)) n++;
  return `${id.slice(0, 100)}~${n}`;
}
export function restoreBrowserLibrary(raw: string): Dataset {
  return withIdentity(validateDataset(JSON.parse(raw)));
}
export class StorageConflict extends Error {
  constructor() { super('相同來源的成績不同，且無法判斷新舊；請選擇保留本機或使用目前內容'); }
}
export type ConflictChoice = 'ask' | 'saved' | 'incoming';
function scoreContent(r: Result) {
  return JSON.stringify([r.status, r.level, r.strain, r.doubled, r.declarer, r.tricks,
    r.lead, r.nsScore, r.miniBridge ?? false, r.split ?? null, r.table,
    r.playerNames.N, r.playerNames.E, r.playerNames.S, r.playerNames.W]);
}
function mergeResult(saved: Result, incoming: Result, choice: ConflictChoice): Result {
  const oldTime = Date.parse(saved.updatedAt), newTime = Date.parse(incoming.updatedAt);
  if (Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime) return saved;
  const named = Object.values(incoming.playerNames).some(Boolean);
  const next = { ...incoming, assignmentId: saved.assignmentId,
    table: named ? incoming.table : saved.table,
    playerNames: named ? incoming.playerNames : saved.playerNames };
  const same = scoreContent(saved) === scoreContent(next);
  const newer = Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime > oldTime;
  if (!newer && same) return saved;
  if (!newer) {
    if (choice === 'ask') throw new StorageConflict();
    if (choice === 'saved') return saved;
  }
  // Anonymous shares must not erase the saved seating metadata.
  return next;
}
export function appendToBrowser(current: Dataset, storage: Pick<Storage, 'getItem' | 'setItem'>, choice: ConflictChoice = 'ask'): Dataset {
  const incoming = withIdentity(current);
  const raw = storage.getItem(storageKey);
  const saved = raw ? restoreBrowserLibrary(raw) : validateDataset({ version: 1, boards: [], results: [] });
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
    if (existing >= 0) results[existing] = mergeResult(results[existing], next, choice);
    else { results.push(next); resultIds.add(id); }
    if (result.id === incoming.selectedResultId) selectedResultId = id;
  }
  const merged = validateDataset({ version: 1, boards, results, selectedBoardId: mapping.get(incoming.selectedBoardId ?? incoming.boards[0]?.id), selectedResultId });
  storage.setItem(storageKey, JSON.stringify(merged));
  return merged;
}
