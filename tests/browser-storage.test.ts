import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../src/lib/demo';
import { appendToBrowser } from '../src/lib/browser-storage';
test('append preserves saved boards, resolves collisions and repeated saves update without duplicates', () => {
  let raw = JSON.stringify(demoDataset());
  const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
  const incoming = demoDataset();
  incoming.boards[0].dealer = 'E';
  const merged = appendToBrowser(incoming, storage);
  assert.equal(merged.boards.length, 4);
  assert.equal(merged.results.length, 20);
  incoming.results[0].nsScore = 123;
  const again = appendToBrowser(incoming, storage);
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
