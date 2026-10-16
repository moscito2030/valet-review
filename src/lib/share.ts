import { validateDataset, type Dataset } from './model';
export const MAX_LINK_LENGTH = 12000;
const MAX_JSON_BYTES = 2_000_000;
async function collect(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error('分享資料超過大小限制');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
export function singleBoard(
  data: Dataset,
  boardId: string,
  selectedResultId: string | undefined,
  names: boolean,
  scope: 'all' | 'selected' | 'none',
): Dataset {
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) throw new Error('找不到牌局');
  const results = data.results
    .filter(
      (r) =>
        r.boardId === boardId &&
        scope !== 'none' &&
        (scope !== 'selected' || r.id === selectedResultId),
    )
    .map((r, i) => ({
      ...r,
      id: `result-${i + 1}`,
      assignmentId: `table-${i + 1}`,
      table: names ? r.table : `桌 ${i + 1}`,
      playerNames: names ? r.playerNames : {},
    }));
  const source = data.results.filter(
    (r) =>
      r.boardId === boardId &&
      scope !== 'none' &&
      (scope !== 'selected' || r.id === selectedResultId),
  );
  const index = source.findIndex((r) => r.id === selectedResultId);
  // Strip collection title/group/identifiers when omitting names; they can contain identifying text too.
  const sharedBoard = names ? board : { ...board, id: `board:${board.number}`, group: undefined };
  return validateDataset({
    version: 1,
    title: names ? data.title : `第 ${board.number} 副檢討`,
    boards: [sharedBoard],
    results: results.map((r) => ({ ...r, boardId: sharedBoard.id, updatedAt: '' })),
    selectedBoardId: sharedBoard.id,
    selectedResultId: index < 0 ? undefined : results[index].id,
  });
}
export async function encodeShare(data: Dataset): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(validateDataset(data)));
  if (bytes.length > MAX_JSON_BYTES) throw new Error('分享資料超過大小限制');
  const compressed = await collect(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    MAX_LINK_LENGTH,
  );
  const base64 = btoa(Array.from(compressed, (n) => String.fromCharCode(n)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  if (base64.length > MAX_LINK_LENGTH)
    throw new Error('連結太長，請改分享選定桌次、只分享牌型，或下載檢討檔');
  return `#review=1.${base64}`;
}
export async function decodeShare(hash: string): Promise<Dataset> {
  if (!hash.startsWith('#review=1.')) throw new Error('不支援的分享連結版本');
  const raw = hash.slice(10);
  if (!raw || raw.length > MAX_LINK_LENGTH || !/^[\w-]+$/.test(raw))
    throw new Error('分享連結不完整或過長');
  try {
    const bytes = Uint8Array.from(atob(raw.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
      c.charCodeAt(0),
    );
    const json = await collect(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
      MAX_JSON_BYTES,
    );
    return validateDataset(JSON.parse(new TextDecoder().decode(json)));
  } catch (error) {
    throw new Error(`無法讀取分享連結：${(error as Error).message}`);
  }
}
