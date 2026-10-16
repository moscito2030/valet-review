import { seats, validateDataset, type Board, type Result } from './model';
import { contractScore } from './scoring';
export function demoDataset() {
  let seed = 20261016;
  const boards: Board[] = [1, 2, 3].map((number) => {
    const cards = [...'SHDC'].flatMap((s) => [...'AKQJT98765432'].map((r) => s + r));
    for (let i = 51; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return {
      id: `demo:${number}`,
      number,
      dealer: seats[number - 1],
      vulnerability: (['None', 'NS', 'EW'] as const)[number - 1],
      deal: Object.fromEntries(
        seats.map((s, i) => [s, cards.slice(i * 13, i * 13 + 13)]),
      ) as Board['deal'],
    };
  });
  const results = boards.flatMap((board) =>
    [0, 1, 2, 3, 4].map((i) => {
      const r: Result = {
        id: `${board.id}/table${i + 1}`,
        boardId: board.id,
        board: board.number,
        table: `第 ${i + 1} 桌`,
        assignmentId: `table${i + 1}`,
        level: i === 2 ? 3 : 4,
        strain: i === 2 ? 'NT' : 'S',
        doubled: 1,
        declarer: 'N',
        tricks: [10, 9, 9, 11, 0][i],
        lead: '',
        nsScore: 0,
        status: i === 4 ? 'cancelled' : 'played',
        updatedAt: '',
        playerNames: { N: '北家牌友', E: '東家牌友', S: '南家牌友', W: '西家牌友' },
      };
      r.nsScore = r.status === 'cancelled' ? 0 : contractScore(r, board.vulnerability);
      return r;
    }),
  );
  return validateDataset({ version: 1, title: '週末牌局 · 示範檢討', boards, results });
}
