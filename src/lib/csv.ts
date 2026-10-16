export function parseCsv(text: string): Record<string, string>[] {
  if (text.length > 2000000) throw new Error('CSV 超過 2 MB 上限');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quote = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quote && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quote = !quote;
    } else if (c === ',' && !quote) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quote) {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quote) throw new Error('CSV 引號未閉合');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('CSV 需包含標題與至少一筆資料');
  const header = rows.shift()!;
  if (new Set(header).size !== header.length) throw new Error('CSV 標題不可重複');
  return rows.map((r, i) => {
    if (r.length !== header.length) throw new Error(`第 ${i + 2} 列欄位數不正確`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
}
