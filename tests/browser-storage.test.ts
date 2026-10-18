import { withIdentity } from '../src/lib/identity';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../src/lib/demo';
import { appendToBrowser } from '../src/lib/browser-storage';
test('append preserves saved boards, resolves collisions and repeated saves update without duplicates', () => {
  const original = withIdentity(demoDataset());
  let raw = JSON.stringify(original);
  const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
  const incoming = structuredClone(original);
  incoming.boards[0].originKey = crypto.randomUUID();
  incoming.boards[0].dealer = 'E';
  const merged = appendToBrowser(incoming, storage);
  assert.equal(merged.boards.length, 4);
  assert.equal(merged.results.length, 20);
  incoming.results[0].nsScore = 123;
  const again = appendToBrowser(incoming, storage, 'incoming');
  assert.equal(again.boards.length, 4);
  assert.equal(again.results.length, 20);
  assert.equal(again.results.find(r => r.id === incoming.results[0].id)?.nsScore, demoDataset().results[0].nsScore);
  assert.equal(again.results.find(r => r.id === incoming.results[0].id + '~2')?.nsScore, 123);
});
test('invalid existing storage is not overwritten', () => {
  let writes = 0;
  assert.throws(() => appendToBrowser(demoDataset(), { getItem: () => '{bad', setItem: () => { writes++; } }));
  assert.equal(writes, 0);
});

test('removing from a partial view preserves unrelated stored boards', async () => {
  const { removeAndSaveBoard } = await import('../src/lib/remove-board');
  const saved = demoDataset();
  let raw = JSON.stringify(saved);
  const view = { ...saved, boards: saved.boards.slice(0, 1), results: saved.results.filter(r => r.boardId === saved.boards[0].id) };
  removeAndSaveBoard(view, view.boards[0].id, { getItem: () => raw, setItem: (_, value) => { raw = value; } });
  assert.equal(JSON.parse(raw).boards.length, 2);
});

test('identical boards from separate sources stay separate; anonymous shares retain identity', async () => {
  const { singleBoard, encodeShare, decodeShare } = await import('../src/lib/share');
  const { exportPbn, importPbn } = await import('../src/lib/imports');
  const first = withIdentity(demoDataset()), second = withIdentity(demoDataset());
  let raw = JSON.stringify(first);
  const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
  assert.equal(appendToBrowser(second, storage).boards.length, 6);
  const shared = await decodeShare(await encodeShare(singleBoard(first, first.boards[0].id, first.results[1].id, false, 'selected')));
  assert.equal(shared.boards[0].originKey, first.boards[0].originKey);
  assert.equal(shared.results[0].originKey, first.results[1].originKey);
  const merged = appendToBrowser(shared, storage);
  assert.equal(merged.boards.length, 6);
  assert.equal(merged.results.length, 30);
  assert.equal(importPbn(exportPbn(first.boards)).boards[0].originKey, first.boards[0].originKey);
});
