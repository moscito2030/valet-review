import test from 'node:test';
import assert from 'node:assert/strict';
import { cardKey } from '../src/lib/play-keyboard';
test('suit prefix disambiguates ranks, with case-insensitive entry', () => {
  const legal = ['ST', 'HT', 'H2'];
  assert.equal(cardKey('T', '', legal).card, undefined);
  const prefix = cardKey('h', '', legal);
  assert.equal(cardKey('t', prefix.suit, legal).card, 'HT');
  assert.equal(cardKey('2', '', legal).card, 'H2');
});
test('qualified input never falls back to another suit or illegal card', () => {
  assert.deepEqual(cardKey('T', 'H', ['ST']), { suit: '', card: undefined });
  assert.deepEqual(cardKey('Escape', 'H', ['HT']), { suit: '' });
  assert.deepEqual(cardKey('S', 'H', ['ST']), { suit: 'S' });
});
