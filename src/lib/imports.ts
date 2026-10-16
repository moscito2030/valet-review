import {
  boardSchema,
  resultSchema,
  seats,
  validateDataset,
  type Board,
  type Dataset,
  type Result,
  type Seat,
  type Vulnerability,
} from './model';
import { parseCsv } from './csv';
import { contractScore } from './scoring';
import { toPbn } from './play';
export const MAX_FILE_BYTES = 2_000_000;
const vulnerabilities: Vulnerability[] = [
  'None',
  'NS',
  'EW',
  'All',
  'NS',
  'EW',
  'All',
  'None',
  'EW',
  'All',
  'None',
  'NS',
  'All',
  'None',
  'NS',
  'EW',
];
export function checkText(text: string) {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('檔案超過 2 MB 上限');
  if (!text.trim()) throw new Error('請選擇檔案或貼上內容');
}
export function importJson(text: string): Dataset {
  checkText(text);
  try {
    return validateDataset(JSON.parse(text));
  } catch (error) {
    throw new Error(error instanceof SyntaxError ? 'JSON 格式不正確' : (error as Error).message);
  }
}
export function parseDeal(raw: string): Board['deal'] {
  const match = raw
    .trim()
    .toUpperCase()
    .match(/^([NESW]):(.+)$/);
  if (!match) throw new Error('Deal 需包含起始方位與四家手牌');
  const hands = match[2].split(/\s+/);
  if (hands.length !== 4) throw new Error('Deal 必須包含四家手牌');
  const deal = {} as Board['deal'];
  hands.forEach((h, i) => {
    const suits = h.split('.');
    if (suits.length !== 4) throw new Error('手牌請使用 S.H.D.C 格式');
    deal[seats[(seats.indexOf(match[1] as Seat) + i) % 4]] = suits.flatMap((r, j) =>
      (r === '-' ? '' : r).split('').map((rank) => 'SHDC'[j] + rank),
    );
  });
  return deal;
}
export function importPbn(text: string): Dataset {
  checkText(text);
  const boards: Board[] = [],
    results: Result[] = [];
  // Board begins a record; accept ordinary PBN tags and ignore auction/play sections.
  const records = text
    .replace(/\{[^]*?\}/g, '')
    .replace(/^%.*$/gm, '')
    .split(/(?=\[Board\s+")/i)
    .filter((s) => /^\[Board\s+"/i.test(s));
  if (!records.length) throw new Error('找不到 PBN Board 標籤');
  for (const record of records) {
    const tags = Object.fromEntries(
      [...record.matchAll(/\[(\w+)\s+"((?:\\.|[^"\\])*)"\]/g)].map((m) => [
        m[1].toLowerCase(),
        m[2].replace(/\\(["\\])/g, '$1'),
      ]),
    );
    const number = Number(tags.board),
      group = tags.bridgeboardgroup || undefined;
    const id = `${group ?? 'board'}:${number}`;
    const vul = {
      LOVE: 'None',
      NONE: 'None',
      '-': 'None',
      NS: 'NS',
      EW: 'EW',
      ALL: 'All',
      BOTH: 'All',
    }[tags.vulnerable?.toUpperCase()];
    const parsed = boardSchema.safeParse({
      id,
      number,
      group,
      dealer: tags.dealer?.toUpperCase() ?? seats[(number - 1) % 4],
      vulnerability: tags.vulnerable ? vul : vulnerabilities[(number - 1) % 16],
      deal: parseDeal(tags.deal ?? ''),
    });
    if (!parsed.success) throw new Error(`第 ${tags.board} 副：${parsed.error.issues[0].message}`);
    const board = parsed.data,
      existing = boards.find((b) => b.id === id);
    const canonical = (b: Board) => JSON.stringify(seats.map((s) => [...b.deal[s]].sort()));
    if (
      existing &&
      (canonical(existing) !== canonical(board) ||
        existing.dealer !== board.dealer ||
        existing.vulnerability !== board.vulnerability)
    )
      throw new Error(`牌號 ${number} 對應不同牌局；請用 BridgeboardGroup 區分場次`);
    if (!existing) boards.push(board);
    if (tags.contract && tags.contract !== '?') {
      const pass = /^(pass|pass out)$/i.test(tags.contract);
      const bid = tags.contract.toUpperCase().match(/^([1-7])(NT|[SHDC])(XX|X)?$/);
      if (!pass && !bid) throw new Error(`第 ${number} 副合約格式不正確`);
      if (!pass && !/^\d+$/.test(tags.result ?? ''))
        throw new Error(`第 ${number} 副缺少有效 Result（莊家實得墩數）`);
      const r = resultSchema.parse({
        id: `pbn-${results.length + 1}`,
        boardId: id,
        board: number,
        table: tags.table || `桌 ${results.length + 1}`,
        assignmentId: tags.table || `pbn-${results.length + 1}`,
        level: pass ? 0 : Number(bid![1]),
        strain: pass ? 'NT' : bid![2],
        doubled: bid?.[3] === 'XX' ? 4 : bid?.[3] === 'X' ? 2 : 1,
        declarer: pass ? 'N' : tags.declarer?.toUpperCase(),
        tricks: pass ? 0 : Number(tags.result),
        nsScore: 0,
        playerNames: Object.fromEntries(
          seats.map((s) => [s, tags[{ N: 'north', E: 'east', S: 'south', W: 'west' }[s]] || '']),
        ),
      });
      r.nsScore = contractScore(r, board.vulnerability);
      results.push(r);
    }
  }
  return validateDataset({ version: 1, title: '匯入牌局', boards, results });
}
export function importResultsCsv(text: string, dataset: Dataset): Dataset {
  checkText(text);
  const results = parseCsv(text).map((row, i) => {
    if (row.splitNS || row.splitEW)
      throw new Error(`第 ${i + 2} 列是不平衡合約，目前需先整理成各桌獨立檢討結果`);
    const candidates = dataset.boards.filter((b) =>
      row.boardId
        ? b.id === row.boardId
        : b.number === Number(row.board) && (!row.group || b.group === row.group),
    );
    if (candidates.length !== 1)
      throw new Error(`第 ${i + 2} 列找不到唯一牌局；請先匯入 PBN，重複牌號請填 boardId`);
    const board = candidates[0];
    const status =
      row.status?.toLowerCase() === 'average' ? 'cancelled' : row.status?.toLowerCase() || 'played';
    const emptyCancelled =
      status === 'cancelled' &&
      ['level', 'strain', 'doubled', 'declarer', 'tricks'].every((k) => !row[k]);
    if (
      !emptyCancelled &&
      ['level', 'strain', 'doubled', 'declarer', 'tricks'].some((k) => !row[k])
    )
      throw new Error(`第 ${i + 2} 列合約欄位不完整`);
    const raw = {
      id: row.id || `${board.id}/${row.assignmentId || row.table || i + 1}`,
      boardId: board.id,
      board: board.number,
      table: row.table || row.assignmentId || `桌 ${i + 1}`,
      assignmentId: row.assignmentId || row.table || String(i + 1),
      status,
      level: emptyCancelled ? 0 : Number(row.level),
      strain: emptyCancelled ? 'NT' : row.strain.toUpperCase(),
      doubled: emptyCancelled ? 1 : Number(row.doubled),
      declarer: emptyCancelled ? 'N' : row.declarer.toUpperCase(),
      tricks: emptyCancelled ? 0 : Number(row.tricks),
      lead: (row.lead || '').toUpperCase().replace('10', 'T'),
      nsScore: row.nsScore ? Number(row.nsScore) : 0,
      playerNames: Object.fromEntries(seats.map((s) => [s, row[s] || ''])),
    };
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`第 ${i + 2} 列：${parsed.error.issues[0].message}`);
    const result = parsed.data;
    result.nsScore =
      status === 'cancelled'
        ? 0
        : row.nsScore
          ? result.nsScore
          : contractScore(result, board.vulnerability);
    return result;
  });
  // CSV replaces this collection's result list atomically. No hidden merge or duplicate scoring.
  return validateDataset({ ...dataset, results, selectedResultId: undefined });
}
export function exportPbn(boards: Board[]) {
  return boards
    .map(
      (b) =>
        `[Board "${b.number}"]\n${b.group ? `[BridgeboardGroup "${b.group.replace(/["\\\r\n]/g, '')}"]\n` : ''}[Dealer "${b.dealer}"]\n[Vulnerable "${b.vulnerability}"]\n[Deal "${toPbn(b.deal)}"]`,
    )
    .join('\n\n');
}
export const csvHeader =
  'id,boardId,board,table,assignmentId,level,strain,doubled,declarer,tricks,lead,status,nsScore,N,E,S,W';
export function exportResultsCsv(results: Result[]) {
  const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  return (
    csvHeader +
    '\n' +
    results
      .map((r) =>
        [
          r.id,
          r.boardId,
          r.board,
          r.table,
          r.assignmentId,
          r.level,
          r.strain,
          r.doubled,
          r.declarer,
          r.tricks,
          r.lead,
          r.status,
          r.nsScore,
          ...seats.map((s) => r.playerNames[s] || ''),
        ]
          .map(cell)
          .join(','),
      )
      .join('\n')
  );
}
