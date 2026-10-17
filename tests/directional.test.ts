import test from 'node:test';
import assert from 'node:assert/strict';
import { demoDataset } from '../src/lib/demo';
import { compareResults } from '../src/lib/scoring';
import { decodeShare, encodeShare } from '../src/lib/share';
import { exportResultsCsv, importResultsCsv, importJson } from '../src/lib/imports';
import { validateDataset } from '../src/lib/model';

test('split awards compare separately without creating extra tables and survive all review formats', async () => {
 const data = demoDataset();
 const base = data.results[0];
 const award = (nsScore: number) => ({ level: base.level, strain: base.strain, doubled: base.doubled, declarer: base.declarer, tricks: base.tricks, lead: '', nsScore });
 data.results = [{ ...base, id: 'a', status: 'played', nsScore: 420, split: { ns: award(620), ew: award(170) } }, { ...base, id: 'b', status: 'played', nsScore: 400 }];
 data.selectedResultId = 'a';
 const ns = compareResults(data.results, 'ns'), ew = compareResults(data.results, 'ew');
 assert.equal(ns.datum, 510);
 assert.equal(ew.datum, -290);
 assert.equal(ns.valid, 2);
 assert.equal(ew.valid, 2);
 assert.equal(ns.rows[0].butler, 3);
 assert.equal(ew.rows[0].butler, 3);
 assert.equal(ns.rows[0].mp, 2);
 assert.equal(ew.rows[0].mp, 2);
 assert.equal(ns.rows[0].crossimp, 6);
 assert.equal(ew.rows[0].crossimp, 6);
 for(const copy of [await decodeShare(await encodeShare(data)), importJson(JSON.stringify(data)), importResultsCsv(exportResultsCsv(data.results), data)]) {
   assert.deepEqual(copy.results[0].split, validateDataset(data).results[0].split);
   assert.equal(compareResults(copy.results,'ew').datum, -290);
 }
 assert.throws(() => validateDataset({...data, results: [{...data.results[0], split: {ns: award(0)}}]}));
});

test('Valet splitNS/splitEW CSV columns preserve both awards and reject partial awards', () => {
  const data = demoDataset();
  const r = data.results[0];
  const award = (nsScore: number) => ({ level: r.level, strain: r.strain, doubled: r.doubled, declarer: r.declarer, tricks: r.tricks, lead: '', nsScore });
  const cell = (v: unknown) => '"' + String(v).replaceAll('"', '""') + '"';
  const csv = (ns: string, ew: string, split = '') => 'boardId,level,strain,doubled,declarer,tricks,nsScore,splitNS,splitEW,split\n' + [r.boardId,r.level,r.strain,r.doubled,r.declarer,r.tricks,r.nsScore,ns,ew,split].map(cell).join(',');
  const ns = JSON.stringify(award(620)), ew = JSON.stringify(award(170));
  const imported = importResultsCsv(csv(ns, ew), data);
  assert.equal(imported.results[0].split?.ns.nsScore, 620);
  assert.equal(imported.results[0].split?.ew.nsScore, 170);
  assert.throws(() => importResultsCsv(csv(ns, ''), data), /同時提供/);
  assert.throws(() => importResultsCsv(csv(ns, ew, '{}'), data), /混用/);
});
