import type { ResultInput, Vulnerability, Result } from './model';
const thresholds = [
  20, 50, 90, 130, 170, 220, 270, 320, 370, 430, 500, 600, 750, 900, 1100, 1300, 1500, 1750, 2000,
  2250, 2500, 3000, 3500, 4000,
];
export function imps(difference: number) {
  return Math.sign(difference) * thresholds.filter((t) => Math.abs(difference) >= t).length;
}
export function miniGameLevel(strain: ResultInput['strain']) {
  return strain === 'NT' ? 3 : strain === 'H' || strain === 'S' ? 4 : 5;
}
export function contractScore(
  r: ResultInput,
  vulnerability: Vulnerability,
  miniBridge = r.miniBridge ?? false,
): number {
  if (miniBridge && (r.doubled !== 1 || (r.level !== 1 && r.level !== miniGameLevel(r.strain)))) {
    throw new Error('MiniBridge 僅接受一線或成局合約，不可 Pass、加倍或再加倍');
  }
  if (r.level === 0) return 0;
  const ns = r.declarer === 'N' || r.declarer === 'S';
  const vul = !miniBridge && (vulnerability === 'All' || vulnerability === (ns ? 'NS' : 'EW'));
  const over = r.tricks - r.level - 6;
  let score: number;
  if (over < 0) {
    const down = -over;
    let penalty = down * (vul ? 100 : 50);
    if (r.doubled > 1)
      penalty =
        (vul
          ? 200 + Math.max(0, down - 1) * 300
          : 100 + Math.min(2, down - 1) * 200 + Math.max(0, down - 3) * 300) *
        (r.doubled / 2);
    score = -penalty;
  } else {
    const minor = r.strain === 'C' || r.strain === 'D';
    const trickPoints = (r.level * (minor ? 20 : 30) + (r.strain === 'NT' ? 10 : 0)) * r.doubled;
    score = trickPoints + (trickPoints >= 100 ? (vul ? 500 : 300) : 50);
    score +=
      r.doubled === 1 ? over * (minor ? 20 : 30) : over * (vul ? 200 : 100) * (r.doubled / 2);
    if (r.doubled > 1) score += 50 * (r.doubled / 2);
    if (r.level === 6) score += vul ? 750 : 500;
    if (r.level === 7) score += vul ? 1500 : 1000;
  }
  return score * (ns ? 1 : -1);
}

export function directionalResult(r: Result, side: 'ns' | 'ew') {
  return r.split && r.status !== 'cancelled' ? { ...r, ...r.split[side] } : r;
}
export function sideScore(r: Result, side: 'ns' | 'ew') {
  return directionalResult(r, side).nsScore * (side === 'ns' ? 1 : -1);
}
export function compareResults(results: Result[], side: 'ns' | 'ew' = 'ns') {
  const valid = results.filter((r) => r.status !== 'cancelled');
  const mean = valid.length ? valid.reduce((s, r) => s + sideScore(r, side), 0) / valid.length : null;
  const datum = mean === null ? null : Math.sign(mean) * Math.round(Math.abs(mean) / 10) * 10;
  return {
    mean,
    datum,
    valid: valid.length,
    rows: results.map((r) => {
      const others = valid.filter((x) => x.id !== r.id);
      if (r.status === 'cancelled' || !others.length)
        return { id: r.id, butler: null, crossimp: null, mp: null, top: null, percent: null };
      const mp = others.reduce(
        (sum, x) => sum + (sideScore(r, side) > sideScore(x, side) ? 2 : sideScore(r, side) === sideScore(x, side) ? 1 : 0),
        0,
      );
      return {
        id: r.id,
        butler: imps(sideScore(r, side) - datum!),
        crossimp: others.reduce((s, x) => s + imps(sideScore(r, side) - sideScore(x, side)), 0) / others.length,
        mp,
        top: others.length * 2,
        percent: (mp / (others.length * 2)) * 100,
      };
    }),
  };
}
