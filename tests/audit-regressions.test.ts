import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoDataset } from '../src/lib/demo';
import { withIdentity } from '../src/lib/identity';
import { appendToBrowser, restoreBrowserLibrary, StorageConflict } from '../src/lib/browser-storage';
import { exportPbn, importPbn, exportResultsCsv, importResultsCsv, importJson, MAX_FILE_BYTES } from '../src/lib/imports';
import { singleBoard, encodeShare, decodeShare } from '../src/lib/share';
import { DealExplorer } from '../src/components/deal-explorer';
import { directionalResult } from '../src/lib/scoring';
import { csvCell } from '../src/lib/csv-cell';

const json = (value: unknown) => JSON.parse(JSON.stringify(value));
function memory(initial = '') {
  let raw = initial;
  return { getItem: () => raw, setItem: (_: string, next: string) => { raw = next; } };
}
test('a saved library larger than the upload limit reloads and JSON backups round-trip', () => {
  const d = withIdentity(demoDataset());
  d.boards = d.boards.slice(0, 1);
  d.results = Array.from({ length: 7000 }, (_, i) => ({ ...d.results[0], id: `result-${i}`, originKey: crypto.randomUUID() }));
  const storage = memory();
  const saved = appendToBrowser(d, storage);
  assert.ok(new TextEncoder().encode(storage.getItem()).length > MAX_FILE_BYTES);
  assert.deepEqual(json(restoreBrowserLibrary(storage.getItem())), json(saved));
  assert.deepEqual(json(importJson(JSON.stringify(saved, null, 2))), json(saved));
  const before = storage.getItem();
  assert.throws(() => appendToBrowser(d, { getItem: storage.getItem, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.equal(storage.getItem(), before);
});
test('dated corrections survive old shares and new shares preserve their timestamp', async () => {
  const old = withIdentity(demoDataset());
  old.results[0].updatedAt = '2026-10-17T12:00:00Z';
  const newer = structuredClone(old);
  newer.results[0].updatedAt = '2026-10-18T12:00:00Z';
  newer.results[0].nsScore = 800;
  const storage = memory(JSON.stringify(old));
  appendToBrowser(newer, storage);
  const share = await decodeShare(await encodeShare(singleBoard(old, old.boards[0].id, old.results[0].id, false, 'selected')));
  assert.equal(share.results[0].updatedAt, old.results[0].updatedAt);
  const merged = appendToBrowser(share, storage, 'incoming');
  assert.equal(merged.results[0].nsScore, 800);
  assert.deepEqual(merged.results[0].playerNames, newer.results[0].playerNames);
});
test('unknown or equal versions require an explicit conflict choice, atomically', () => {
  for (const timestamp of ['', 'invalid', '2026-10-18T00:00:00Z']) {
    const d = withIdentity(demoDataset());
    d.results[0].updatedAt = timestamp;
    const storage = memory(JSON.stringify(d)), incoming = structuredClone(d);
    incoming.results[0].nsScore = 800;
    incoming.boards.push({ ...incoming.boards[0], id: 'extra', originKey: crypto.randomUUID() });
    const before = storage.getItem();
    assert.throws(() => appendToBrowser(incoming, storage), StorageConflict);
    assert.equal(storage.getItem(), before);
    assert.equal(appendToBrowser(incoming, storage, 'saved').results[0].nsScore, d.results[0].nsScore);
    assert.equal(appendToBrowser(incoming, storage, 'incoming').results[0].nsScore, 800);
  }
});
test('identified PBN plus CSV round-trips without editing IDs, including duplicate board numbers', () => {
  const d = withIdentity(demoDataset());
  const b = { ...d.boards[0], id: 'other-source', originKey: crypto.randomUUID() };
  d.boards.push(b);
  d.results.push({ ...d.results[0], id: 'other-result', boardId: b.id, originKey: crypto.randomUUID() });
  d.results[0].updatedAt = '2026-10-18T00:00:00Z';
  const back = importResultsCsv(exportResultsCsv(d.results), importPbn(exportPbn(d.boards)));
  assert.deepEqual(json(back.results), json(d.results));
  assert.deepEqual(back.boards.map(b => [b.id, b.originKey]), d.boards.map(b => [b.id, b.originKey]));
  // Existing PBN exports without the local-ID tag retain their source identity.
  assert.equal(importPbn(exportPbn(d.boards).replace(/\[ValetBoardId[^\n]+\n/g, '')).boards[0].id, d.boards[0].originKey);
});
test('MiniBridge survives CSV, recalculates without vulnerability and reaches the viewer', () => {
  const d = withIdentity(demoDataset());
  d.boards[0].vulnerability = 'All';
  d.results = [{ ...d.results[0], miniBridge: true }];
  const csv = exportResultsCsv(d.results);
  const back = importResultsCsv(csv, importPbn(exportPbn(d.boards)));
  assert.equal(back.results[0].miniBridge, true);
  const recomputed = importResultsCsv('board,level,strain,doubled,declarer,tricks,miniBridge\n1,4,S,1,N,10,true', d);
  assert.equal(recomputed.results[0].nsScore, 420);
  const view = (result?: typeof d.results[0]) => renderToStaticMarkup(createElement(DealExplorer, { board: d.boards[0], boardResults: back.results, result }));
  assert.match(view(), /最佳合約（雙明手）/);
  assert.doesNotMatch(view({ ...back.results[0], miniBridge: false }), /最佳合約（雙明手）/);
  const split = { ...back.results[0], split: { ns: back.results[0], ew: { ...back.results[0], miniBridge: false } } };
  assert.match(view(directionalResult(split, 'ns')), /最佳合約（雙明手）/);
  assert.doesNotMatch(view(directionalResult(split, 'ew')), /最佳合約（雙明手）/);
  assert.throws(() => importResultsCsv('board,status,miniBridge\n1,cancelled,yes', d), /miniBridge/);
});
test('CSV escapes formula-like text reversibly without converting numeric negative scores to text', () => {
  for (const text of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', "'literal", '=HYPERLINK("https://example.invalid")']) {
    const d = demoDataset();
    d.results = [{ ...d.results[0], id: text, table: text, assignmentId: text, nsScore: -50,
      playerNames: { N: text, E: text, S: text, W: text } }];
    const csv = exportResultsCsv(d.results);
    assert.ok(csv.includes(csvCell(text)));
    assert.ok(csv.includes('"-50"'));
    assert.deepEqual(json(importResultsCsv(csv, d).results), json(d.results));
  }
  assert.match(csvCell('  =1'), /^"'/);
});

test('name corrections with unknown versions require a choice; anonymous shares preserve saved names', () => {
  const d = withIdentity(demoDataset());
  d.results[0].playerNames.N = 'Original';
  const storage = memory(JSON.stringify(d));
  const incoming = structuredClone(d);
  incoming.results[0].playerNames.N = 'Corrected';
  assert.throws(() => appendToBrowser(incoming, storage), StorageConflict);
  assert.equal(appendToBrowser(incoming, storage, 'incoming').results[0].playerNames.N, 'Corrected');
  const shared = singleBoard(incoming, incoming.boards[0].id, incoming.results[0].id, false, 'selected');
  assert.equal(appendToBrowser(shared, storage).results[0].playerNames.N, 'Corrected');
});
