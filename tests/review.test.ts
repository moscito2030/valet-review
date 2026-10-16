import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../src/lib/demo';
import { compareResults, contractScore, imps } from '../src/lib/scoring';
import {
  exportPbn,
  exportResultsCsv,
  importJson,
  importPbn,
  importResultsCsv,
} from '../src/lib/imports';
import { decodeShare, encodeShare, singleBoard } from '../src/lib/share';
import {
  initialPlay,
  legalCards,
  nextSeat,
  playCard,
  rewindToCard,
  visibleHandSeats,
} from '../src/lib/play';
import { validateDataset } from '../src/lib/model';

test('full PBN and CSV export/import preserve board data and cancelled scores', () => {
  const data = demoDataset();
  const boards = importPbn(exportPbn(data.boards));
  assert.equal(boards.boards.length, 3);
  for (let i = 0; i < 3; i++)
    for (const seat of ['N', 'E', 'S', 'W'] as const)
      assert.deepEqual(
        [...boards.boards[i].deal[seat]].sort(),
        [...data.boards[i].deal[seat]].sort(),
      );
  // Explicit board IDs remain local to the JSON collection. Number-only CSV attaches to new PBN IDs.
  const csv = exportResultsCsv(data.results.map((r) => ({ ...r, boardId: `board:${r.board}` })));
  const restored = importResultsCsv(csv, boards);
  assert.deepEqual(
    restored.results.map((r) => r.nsScore),
    data.results.map((r) => r.nsScore),
  );
  assert.equal(restored.results.filter((r) => r.status === 'cancelled').length, 3);
});
test('CSV supports contract-free cancellation and canonicalizes the legacy label', () => {
  const data = demoDataset();
  for (const status of ['cancelled', 'average']) {
    const result = importResultsCsv(`board,table,status\n1,Test,${status}`, data).results[0];
    assert.equal(result.status, 'cancelled');
    assert.equal(result.nsScore, 0);
    assert.ok(!exportResultsCsv([result]).includes('average'));
  }
});
test('imports are atomic and reject duplicate IDs, broken CSV and unknown boards', () => {
  const data = demoDataset(),
    before = structuredClone(data);
  assert.throws(() => importResultsCsv('board,status\n1,cancelled\n99,cancelled', data));
  assert.deepEqual(data, before);
  assert.throws(() => importResultsCsv('board,status\n1,"cancelled', data));
  assert.throws(() => importResultsCsv('board,table,status\n1,A,cancelled\n1,A,cancelled', data));
  assert.throws(() => importResultsCsv('board,level,strain\n1,4,S', data));
});
test('PBN supports rotated deals, standard contract records, and repeated same-board tables', () => {
  const data = demoDataset();
  const pbn = exportPbn([data.boards[0]]);
  const withResult = pbn + '\n[Contract "4S"]\n[Declarer "N"]\n[Result "10"]';
  const imported = importPbn(withResult + '\n\n' + withResult);
  assert.equal(imported.boards.length, 1);
  assert.equal(imported.results.length, 2);
  assert.equal(imported.results[0].nsScore, 420);
  const deal = pbn.match(/\[Deal "N:([^\"]+)"\]/)![1].split(' ');
  const rotated = pbn.replace(`N:${deal.join(' ')}`, `E:${[...deal.slice(1), deal[0]].join(' ')}`);
  assert.deepEqual(importPbn(rotated).boards[0].deal, imported.boards[0].deal);
});
test('different deals sharing a board number must have separate groups', () => {
  const data = demoDataset();
  const a = data.boards[0],
    b = { ...data.boards[1], number: 1 };
  assert.throws(() => importPbn(exportPbn([a, b])), /BridgeboardGroup/);
  const separate = importPbn(
    exportPbn([
      { ...a, group: 'A' },
      { ...b, group: 'B' },
    ]),
  );
  assert.equal(separate.boards.length, 2);
  assert.throws(() => importResultsCsv('board,status\n1,cancelled', separate), /唯一牌局/);
});
test('validation rejects duplicate cards, incomplete hands and dangling results', () => {
  const data = demoDataset();
  data.boards[0].deal.N[0] = data.boards[0].deal.E[0];
  assert.throws(() => validateDataset(data), /52/);
  assert.throws(() => importPbn('[Board "1"]\n[Deal "N:... ... ... ..."]'));
  assert.throws(() => validateDataset({ ...demoDataset(), boards: [demoDataset().boards[0]] }));
  assert.throws(() => importJson('{bad json}'));
});
test('NS contract scoring handles games, slams, pass and doubled penalties', () => {
  const r = demoDataset().results[0];
  assert.equal(contractScore(r, 'None'), 420);
  assert.equal(contractScore(r, 'All'), 620);
  assert.equal(contractScore({ ...r, declarer: 'E' }, 'All'), -620);
  assert.equal(contractScore({ ...r, level: 0 }, 'None'), 0);
  assert.equal(contractScore({ ...r, level: 6, tricks: 12 }, 'None'), 980);
  assert.equal(contractScore({ ...r, doubled: 2, tricks: 7 }, 'None'), -500);
  assert.equal(imps(10), 0);
  assert.equal(imps(-20), -1);
  assert.equal(imps(4000), 24);
});
test('Butler/CrossIMP/MP exclude cancellations and handle ties and single valid result', () => {
  const template = demoDataset().results[0];
  const results = [420, 420, -50, 9999].map((nsScore, i) => ({
    ...template,
    id: String(i),
    nsScore,
    status: i === 3 ? ('cancelled' as const) : ('played' as const),
  }));
  const stats = compareResults(results);
  assert.equal(stats.datum, 260);
  assert.equal(stats.valid, 3);
  assert.deepEqual(stats.rows[0], { id: '0', butler: 4, crossimp: 5, mp: 3, top: 4, percent: 75 });
  assert.equal(stats.rows[2].crossimp, -10);
  assert.equal(stats.rows[3].mp, null);
  assert.equal(compareResults([results[0], results[3]]).rows[0].butler, null);
});
test('share roundtrip preserves selected result and strips identifying fields by default', async () => {
  const data = demoDataset();
  const shared = singleBoard(data, data.boards[0].id, data.results[0].id, false, 'all');
  const hash = await encodeShare(shared),
    decoded = await decodeShare(hash);
  assert.deepEqual(decoded, JSON.parse(JSON.stringify(shared)));
  assert.equal(decoded.boards.length, 1);
  assert.equal(decoded.selectedResultId, 'result-1');
  assert.deepEqual(decoded.results[0].playerNames, { N: '', E: '', S: '', W: '' });
  assert.ok(!JSON.stringify(decoded).includes('週末'));
  assert.equal(singleBoard(data, data.boards[0].id, undefined, false, 'none').results.length, 0);
  assert.equal(
    singleBoard(data, data.boards[0].id, data.results[1].id, true, 'selected').results.length,
    1,
  );
});
test('share rejects invalid versions, corrupt payloads and decompression bombs', async () => {
  await assert.rejects(decodeShare('#review=2.abc'));
  await assert.rejects(decodeShare('#review=1.not-valid'));
  await assert.rejects(decodeShare('#review=1.' + 'a'.repeat(13000)));
  const huge = new TextEncoder().encode('x'.repeat(2_000_001));
  const zipped = new Uint8Array(
    await new Response(
      new Blob([huge]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer(),
  );
  const encoded = Buffer.from(zipped).toString('base64url');
  await assert.rejects(decodeShare('#review=1.' + encoded), /大小限制/);
});
test('play follows suit, counts 13 tricks, is immutable, and undo restores the original state', () => {
  const board = demoDataset().boards[0],
    start = initialPlay(board, 'N'),
    original = structuredClone(start);
  const history = [start];
  while (history.at(-1)!.ns + history.at(-1)!.ew < 13) {
    const state = history.at(-1)!;
    const legal = legalCards(state);
    const invalid = state.hands[nextSeat(state)].find((c) => !legal.includes(c));
    if (invalid) assert.throws(() => playCard(state, invalid, 'S'));
    history.push(playCard(state, legal[0], 'S'));
  }
  assert.equal(history.length, 53);
  assert.deepEqual(start, original);
  assert.equal(Object.values(history.at(-1)!.hands).flat().length, 0);
  const card = legalCards(start)[0];
  assert.equal(rewindToCard(history, 'E', card).length, 1);
  assert.deepEqual(visibleHandSeats('W', 'N', start), ['W']);
  assert.deepEqual(visibleHandSeats('W', 'N', history[1]), ['W', 'S']);
});
