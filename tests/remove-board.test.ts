import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../src/lib/demo';
import { importJson } from '../src/lib/imports';
import { removeBoard, removeAndSaveBoard, storageKey } from '../src/lib/remove-board';

test('removes only the selected board and all its results, selecting its next neighbor', () => {
  const data = demoDataset(), before = structuredClone(data);
  const next = removeBoard(data, data.boards[1].id);
  assert.deepEqual(next.boards.map(b => b.id), [data.boards[0].id, data.boards[2].id]);
  assert.equal(next.selectedBoardId, data.boards[2].id);
  assert.equal(next.results.length, 10);
  assert.ok(next.results.every(r => r.boardId !== data.boards[1].id));
  assert.deepEqual(data, before);
});

test('last board selects previous neighbor and clears stale selected result', () => {
  const data = demoDataset();
  data.selectedBoardId = data.boards[2].id;
  data.selectedResultId = data.results.at(-1)!.id;
  const next = removeBoard(data, data.boards[2].id);
  assert.equal(next.selectedBoardId, data.boards[1].id);
  assert.equal(next.selectedResultId, undefined);
});

test('removal uses identity rather than number across groups', () => {
  const data = demoDataset();
  const target = data.boards[1].id;
  data.boards[1].number = 1;
  data.results.filter(r => r.boardId === target).forEach(r => r.board = 1);
  const next = removeBoard(data, target);
  assert.equal(next.boards[0].id, data.boards[0].id);
  assert.equal(next.results.filter(r => r.board === 1).length, 5);
});

test('removing all boards persists an empty review that survives reloading', () => {
  let data = demoDataset(), saved = '';
  const storage = { setItem(key: string, value: string) { assert.equal(key, storageKey); saved = value; } };
  while (data.boards.length) data = removeAndSaveBoard(data, data.boards[0].id, storage);
  const reloaded = importJson(saved);
  assert.deepEqual(reloaded.boards, []);
  assert.deepEqual(reloaded.results, []);
  assert.equal(reloaded.selectedBoardId, undefined);
});

test('unknown board or failed persistence leaves the input intact', () => {
  const data = demoDataset(), before = structuredClone(data);
  assert.throws(() => removeBoard(data, 'missing'));
  assert.throws(() => removeAndSaveBoard(data, data.boards[0].id, { setItem() { throw new Error('storage denied'); } }), /storage denied/);
  assert.deepEqual(data, before);
});
