import { withIdentity } from './lib/identity';
import { appendToBrowser } from './lib/browser-storage';
import { AppVersion } from './components/app-version';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  Share2,
  Upload,
  Info,
  RotateCcw,
  Bookmark,
  Check,
  Diamond,
  Trash2,
} from 'lucide-react';
import { DealExplorer } from './components/deal-explorer';
import { Modal } from './components/modal';
import { type Dataset, type Result, validateDataset } from './lib/model';
import { demoDataset } from './lib/demo';
import { compareResults, imps, directionalResult, sideScore } from './lib/scoring';
import {
  csvHeader,
  exportPbn,
  exportResultsCsv,
  importJson,
  importPbn,
  importResultsCsv,
  MAX_FILE_BYTES,
} from './lib/imports';
import { decodeShare, encodeShare, singleBoard } from './lib/share';
import { removeAndSaveBoard, storageKey } from './lib/remove-board';
const suits = { S: '♠', H: '♥', D: '♦', C: '♣', NT: 'NT' };
const signed = (n: number, decimals = 0) => `${n > 0 ? '+' : ''}${n.toFixed(decimals)}`;
function contract(r: Result) {
  if (r.status === 'cancelled') return 'Cancelled';
  if (!r.level) return 'PASS';
  const delta = r.tricks - r.level - 6;
  return `${r.level}${suits[r.strain]}${r.doubled === 2 ? 'x' : r.doubled === 4 ? 'xx' : ''} ${r.declarer} ${delta ? signed(delta) : '='}`;
}
function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [data, setData] = useState<Dataset>(() => withIdentity(demoDataset()));
  const [boardId, setBoardId] = useState('demo:1');
  const [side, setSide] = useState<'ns' | 'ew'>('ns');
  const [selectedId, setSelectedId] = useState<string>();
  const [selection, setSelection] = useState(0);
  const [comparison, setComparison] = useState<string[]>([]);
  const [metric, setMetric] = useState<'butler' | 'crossimp' | 'mp'>('butler');
  const [modal, setModal] = useState<'import' | 'share' | 'help' | 'export' | 'remove' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<'pbn' | 'csv' | 'json'>('pbn');
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<Dataset>();
  const [includeNames, setIncludeNames] = useState(false);
  const [shareScope, setShareScope] = useState<'all' | 'selected' | 'none'>('all');
  const [link, setLink] = useState('');
  const [working, setWorking] = useState(false);
  const [popupError, setPopupError] = useState('');
  function load(next: Dataset) {
    next = withIdentity(next);
    setData(next);
    setBoardId(next.selectedBoardId || next.boards[0]?.id || '');
    setSelectedId(next.selectedResultId);
    setComparison([]);
    setSelection((s) => s + 1);
    setError('');
  }
  useEffect(() => {
    let generation = 0;
    async function restore() {
      const current = ++generation;
      if (location.hash) {
        setLoading(true);
        try {
          const shared = await decodeShare(location.hash);
          if (current === generation) {
            load(shared);
            setNotice('牌局來源：網址分享。所有內容只在此瀏覽器處理。');
          }
        } catch (e) {
          if (current === generation) {
            load(demoDataset());
            setError((e as Error).message);
            setNotice('牌局來源：示範牌局。網址分享資料無法讀取。');
          }
        } finally {
          if (current === generation) setLoading(false);
        }
      } else {
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) {
            const restored = withIdentity(importJson(saved));
            localStorage.setItem(storageKey, JSON.stringify(restored));
            load(restored);
            setNotice('牌局來源：本機儲存。已載入此瀏覽器上次儲存的檢討。');
          } else {
            load(demoDataset());
            setNotice('牌局來源：示範牌局。目前沒有本機儲存的檢討。');
          }
        } catch {
          load(demoDataset());
          setNotice('牌局來源：示範牌局。本機儲存的檢討無法讀取。');
        }
      }
    }
    void restore();
    window.addEventListener('hashchange', restore);
    return () => {
      generation++;
      window.removeEventListener('hashchange', restore);
    };
  }, []);
  const board = data.boards.find((b) => b.id === boardId) ?? data.boards[0];
  const index = data.boards.indexOf(board);
  const results = data.results.filter((r) => r.boardId === board?.id);
  const selected = results.find((r) => r.id === selectedId);
  const stats = compareResults(results, side);
  const nsStats = compareResults(results, 'ns');
  const ewStats = compareResults(results, 'ew');
  const hasSplit = results.some(r => r.status !== 'cancelled' && !!r.split);
  const pair = comparison
    .map((id) => results.find((r) => r.id === id))
    .filter((r): r is Result => !!r);
  function changeBoard(id: string) {
    setBoardId(id);
    setSelectedId(undefined);
    setComparison([]);
    setSelection((s) => s + 1);
  }
  function open(name: typeof modal) {
    setModal(name);
    setPopupError('');
    setLink('');
    setPreview(undefined);
  }
  function snapshot() {
    return validateDataset({ ...data, selectedBoardId: board?.id, selectedResultId: selected?.id });
  }
  async function readFile(file?: File) {
    if (!file) return;
    setPreview(undefined);
    setPopupError('');
    if (file.size > MAX_FILE_BYTES) {
      setPopupError('檔案超過 2 MB 上限');
      return;
    }
    try {
      setSource(await file.text());
    } catch {
      setPopupError('無法讀取檔案');
    }
  }
  function verifyImport() {
    setPopupError('');
    setPreview(undefined);
    try {
      setPreview(
        kind === 'pbn'
          ? importPbn(source)
          : kind === 'csv'
            ? importResultsCsv(source, data)
            : importJson(source),
      );
    } catch (e) {
      setPopupError((e as Error).message);
    }
  }
  async function makeLink() {
    if (!board) return;
    setWorking(true);
    setPopupError('');
    try {
      const fragment = await encodeShare(
        singleBoard(data, board.id, selected?.id, includeNames, shareScope),
      );
      setLink(location.href.split('#')[0] + fragment);
    } catch (e) {
      setPopupError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href={location.pathname}>
          <Diamond size={28} fill="currentColor" />
          <span className="brand-wordmark">VALET</span>
          <span className="brand-subtitle">REVIEW</span>
        </a>
        <span className="header-note">造輪子？或許你會發現我的小巧思。</span>
        <button className="icon-button" aria-label="使用說明" onClick={() => open('help')}>
          <Info size={20} />
        </button>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="muted">
              {data.boards.length} 副牌 · {data.results.length} 筆成績
            </p>
          </div>
          <div className="toolbar">
            <button onClick={() => open('import')}>
              <Upload size={16} />
              匯入
            </button>
            <button onClick={() => open('export')}>
              <Download size={16} />
              匯出
            </button>
            <button className="share-button" disabled={!board || loading} onClick={() => open('share')}>
              <Share2 size={16} />
              分享此副
            </button>
          </div>
        </section>
        {error && (
          <p role="alert" className="error-banner">
            {error}
            <button
              onClick={() => {
                history.replaceState(null, '', location.pathname + location.search);
                setError('');
              }}
            >
              關閉錯誤連結
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
            <button onClick={() => setNotice('')} aria-label="關閉提示">
              ×
            </button>
          </p>
        )}
        {loading ? (
          <p role="status">正在開啟分享牌局…</p>
        ) : !board ? (
          <section className="panel empty" aria-label="沒有牌局">
            <h2>目前沒有牌局</h2>
            <p className="muted">可以匯入新的牌型或檢討檔，開始下一份檢討。</p>
            <button onClick={() => open('import')}><Upload size={16} />匯入牌局</button>
          </section>
        ) : (
          <>
            <div className="board-bar">
              <div className="board-switch">
                <button
                  className="icon-button"
                  aria-label="上一副"
                  disabled={index === 0}
                  onClick={() => changeBoard(data.boards[index - 1].id)}
                >
                  <ArrowLeft size={19} />
                </button>
                <label>
                  <span>牌號</span>
                  <select
                    aria-label="選擇牌號"
                    value={board.id}
                    onChange={(e) => changeBoard(e.target.value)}
                  >
                    {data.boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.group ? `${b.group} · ` : ''}第 {b.number} 副
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button"
                  aria-label="下一副"
                  disabled={index === data.boards.length - 1}
                  onClick={() => changeBoard(data.boards[index + 1].id)}
                >
                  <ArrowRight size={19} />
                </button>
              </div>
              <span className="board-counter">
                {String(index + 1).padStart(2, '0')} / {String(data.boards.length).padStart(2, '0')}
              </span>
              <div className="review-actions"><button
                onClick={() => {
                  try {
                    const merged = appendToBrowser(snapshot(), localStorage);
                    load(merged);
                    setNotice('已追加儲存至此瀏覽器；相同牌局的既有成績已更新。需要跨裝置保存時，請匯出檢討檔。');
                  } catch (error) {
                    setError(`儲存失敗，原本的儲存資料未變更：${(error as Error).message}。可改匯出檢討檔。`);
                  }
                }}
              >
                <Bookmark size={15} />
                儲存至瀏覽器
              </button>
              <button className="remove-board-button" onClick={() => open('remove')}>
                <Trash2 size={15} />移除此牌
              </button></div>
            </div>
            <div className="workspace">
              <section className="panel deal-panel" aria-label="牌局與試打">
                <div className="panel-top">
                  <div>
                    <span className="eyebrow">THE BOARD</span>
                    <h2>{selected ? selected.table : '四家手牌'}</h2>
                  </div>
                  {selected && (
                    <button
                      onClick={() => {
                        setSelectedId(undefined);
                        setSelection((s) => s + 1);
                      }}
                    >
                      <RotateCcw size={15} />
                      回到牌局
                    </button>
                  )}
                </div>
                <DealExplorer
                  key={board.id}
                  board={board}
                  result={selected ? directionalResult(selected, side) : undefined}
                  resultSelection={selection}
                  tableSelected={!!selected}
                  playerNames={selected?.playerNames}
                  onManualTrial={() => setSelectedId(undefined)}
                  averageScore={stats.datum}
                  scoreSide={side.toUpperCase()}
                  datumDetails={{ ns: nsStats.mean, ew: ewStats.mean, split: hasSplit }}
                  validResults={stats.valid}
                />
                <p className="panel-tip">
                  點選桌次，以該桌合約試打；或點最佳墩數表，自選莊家與合約花色。點方位切換視角。
                </p>
              </section>
              <section className="panel traveller" aria-label="同副跨桌成績">
                <div className="panel-top">
                  <div>
                    <span className="eyebrow">THE TRAVELLER</span>
                    <h2>同副跨桌比較</h2>
                  </div>
                  <span className="count-badge">{stats.valid} 桌有效</span>
                </div>
                <div className="metric-picker" role="group" aria-label="比較方向">
                  {(['ns','ew'] as const).map(s => <button key={s} aria-pressed={side === s} onClick={() => { setSide(s); setSelection(n => n + 1); }}>{s.toUpperCase()}</button>)}
                </div>
                <div className="metric-picker" role="group" aria-label="比較方式">
                  {(['butler', 'crossimp', 'mp'] as const).map((m) => (
                    <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                      {m === 'mp' ? <><span className="metric-full">Matchpoints</span><span className="metric-short">MP</span></> : m === 'butler' ? 'Butler IMP' : 'Cross IMP'}
                    </button>
                  ))}
                </div>
                {!results.length ? (
                  <div className="empty">
                    <h3>這副牌還沒有成績</h3>
                    <p>匯入成績 CSV，即可比較同一副牌在各桌的表現。</p>
                    <button
                      onClick={() => {
                        setKind('csv');
                        setSource('');
                        open('import');
                      }}
                    >
                      匯入成績
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>比較</th>
                          <th>桌次／合約</th>
                          <th>{side.toUpperCase()} 得分</th>
                          <th>{metric === 'mp' ? 'MP %' : 'IMP'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => {
                          const awarded = directionalResult(r, side);
                          const score = stats.rows.find((row) => row.id === r.id)!;
                          const value = metric === 'mp' ? score.percent : score[metric];
                          return (
                            <tr
                              key={r.id}
                              className={selected?.id === r.id ? 'selected-result' : undefined}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`比較 ${r.table}`}
                                  checked={comparison.includes(r.id)}
                                  disabled={
                                    r.status === 'cancelled' ||
                                    (!comparison.includes(r.id) && comparison.length === 2)
                                  }
                                  onChange={(e) =>
                                    setComparison(
                                      e.target.checked
                                        ? [...comparison, r.id]
                                        : comparison.filter((id) => id !== r.id),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  className="result-select"
                                  aria-label={`查看 ${r.table} ${contract(awarded)}`}
                                  aria-pressed={selected?.id === r.id}
                                  onClick={() => {
                                    setSelectedId(r.id);
                                    setSelection((s) => s + 1);
                                  }}
                                >
                                  <span className="table-name">{r.table}</span>
                                  <strong
                                    className={
                                      awarded.strain === 'H' || awarded.strain === 'D' ? 'red-suit' : ''
                                    }
                                  >
                                    {contract(awarded)}
                                  </strong>
                                  {awarded.lead && (
                                    <small>
                                      首攻 {suits[awarded.lead[0] as keyof typeof suits]}
                                      {awarded.lead[1]}
                                    </small>
                                  )}
                                </button>
                              </td>
                              <td className="numeric">
                                {r.status === 'cancelled' ? '—' : signed(sideScore(r, side))}
                              </td>
                              <td
                                className={`numeric ${value !== null && value < 0 ? 'negative' : ''}`}
                              >
                                {value === null
                                  ? '—'
                                  : metric === 'mp'
                                    ? `${value.toFixed(1)}%`
                                    : signed(value, metric === 'crossimp' ? 2 : 0)}
                                {metric === 'mp' && score.mp !== null && (
                                  <small>
                                    {score.mp} / {score.top} MP
                                  </small>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="comparison-box">
                  <span className="eyebrow">HEAD TO HEAD · 兩桌對照</span>
                  {pair.length === 2 ? (
                    <>
                      <p>
                        {pair[0].table} − {pair[1].table}
                        <button
                          className="text-button"
                          onClick={() => setComparison([comparison[1], comparison[0]])}
                        >
                          交換
                        </button>
                      </p>
                      <div className="comparison-value">
                        <strong>{signed(imps(sideScore(pair[0], side) - sideScore(pair[1], side)))}</strong>
                        <span>IMP</span>
                        <small>{side.toUpperCase()} 得分差 {signed(sideScore(pair[0], side) - sideScore(pair[1], side))}</small>
                      </div>
                    </>
                  ) : (
                    <p className="muted">勾選兩桌，查看它們之間的原始分差與 IMP 差。</p>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
        <footer>
          <span>
            <AppVersion /> <span className="muted">／ 由臺灣大學橋藝社自主研發</span>
          </span>
          <button
            className="text-button"
            onClick={() => {
              load(demoDataset());
              history.replaceState(null, '', location.pathname + location.search);
              setNotice('牌局來源：示範牌局。本機儲存的檢討未變更。');
            }}
          >
            開啟示範
          </button>
        </footer>
      </main>
      {modal && (
        <Modal
          title={
            {
              import: '匯入檢討資料',
              export: '匯出檢討資料',
              share: `分享第 ${board?.number ?? ''} 副`,
              remove: '移除此牌',
              help: '從比較到試打',
            }[modal]
          }
          close={() => setModal(null)}
        >
          {modal === 'remove' && board && (
            <>
              <p>移除{board.group ? `「${board.group}」的` : ''}第 {board.number} 副牌及其 {results.length} 筆成績？</p>
              <p className="muted">剩餘檢討會一併儲存至此瀏覽器，取代先前的本機儲存。移除後無法復原，需要保留時請先匯出。</p>
              <div className="button-row">
                <button onClick={() => setModal(null)}>保留此牌</button>
                <button className="remove-board-button" onClick={() => {
                  try {
                    const next = removeAndSaveBoard(data, board.id, localStorage);
                    load(next);
                    history.replaceState(null, '', location.pathname + location.search);
                    setModal(null);
                    setNotice(next.boards.length ? '已移除此牌，剩餘檢討已儲存。' : '已移除最後一副牌，本機檢討已清空。');
                  } catch {
                    setPopupError('無法更新本機儲存，此牌尚未移除。請確認瀏覽器允許儲存後再試。');
                  }
                }}><Trash2 size={15} />確認移除</button>
              </div>
            </>
          )}
          {modal === 'import' && (
            <>
              <p className="muted">
                先匯入 PBN 牌型，再加入成績；檢討 JSON 可一次載入兩者。資料不會上傳至伺服器。
              </p>
              <label className="field">
                匯入類型
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setSource('');
                    setPreview(undefined);
                    setPopupError('');
                  }}
                >
                  <option value="pbn">牌局 PBN</option>
                  <option value="csv">成績 CSV</option>
                  <option value="json">檢討 JSON</option>
                </select>
              </label>
              <label className="field">
                選擇檔案（最多 2 MB）
                <input
                  type="file"
                  accept={kind === 'pbn' ? '.pbn,.txt' : kind === 'csv' ? '.csv,.txt' : '.json'}
                  onChange={(e) => void readFile(e.target.files?.[0])}
                />
              </label>
              <label className="field">
                或貼上內容
                <textarea
                  rows={7}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setPreview(undefined);
                  }}
                  placeholder={
                    kind === 'pbn'
                      ? '[Board "1"]\n[Dealer "N"]\n[Vulnerable "None"]\n[Deal "N:..."]'
                      : kind === 'csv'
                        ? csvHeader
                        : '{ "version": 1, "boards": [...], "results": [...] }'
                  }
                />
              </label>
              {kind === 'csv' && (
                <p className="muted small">
                  必填：board（或 boardId）、level、strain、doubled、declarer、tricks。status 可填
                  cancelled，且可省略合約。N/E/S/W 為選手姓名；nsScore
                  可填裁判調整後原始分。匯入會取代整份成績清單，未列出的成績將移除。
                </p>
              )}
              <div className="button-row">
                <button onClick={verifyImport} disabled={!source.trim()}>
                  驗證並預覽
                </button>
                {kind === 'csv' && (
                  <button
                    onClick={() =>
                      download(
                        'results-template.csv',
                        exportResultsCsv(
                          demoDataset()
                            .results.filter((r) => r.board === 1)
                            .map((r) => ({ ...r, boardId: '' })),
                        ),
                        'text/csv',
                      )
                    }
                  >
                    下載範例 CSV
                  </button>
                )}
              </div>
              {preview && (
                <div className="import-preview">
                  <h3>
                    <Check size={18} />
                    資料驗證完成
                  </h3>
                  <p>
                    {preview.boards.length} 副完整牌型 · {preview.results.length} 筆成績 ·{' '}
                    {preview.results.filter((r) => r.status === 'cancelled').length} 筆 Cancelled
                  </p>
                  <p className="muted">
                    {preview.boards
                      .slice(0, 8)
                      .map((b) => `${b.group ? b.group + ' · ' : ''}第 ${b.number} 副`)
                      .join('、')}
                    {preview.boards.length > 8 ? '…' : ''}
                  </p>
                  <p className="small">
                    確認後將取代目前開啟的{kind === 'csv' ? '成績清單' : '檢討資料'}
                    。需要保留時，請先匯出檢討檔。
                  </p>
                  <button
                    className="share-button"
                    onClick={() => {
                      load(preview);
                      history.replaceState(null, '', location.pathname + location.search);
                      setModal(null);
                      setSource('');
                      setNotice('匯入完成。可儲存至瀏覽器到本機，或匯出完整檢討檔。');
                    }}
                  >
                    確認匯入
                  </button>
                </div>
              )}
            </>
          )}
          {modal === 'export' && (
            <>
              <p className="muted">檢討 JSON 包含全部牌型與成績，適合保存或交給其他人繼續檢討。</p>
              <div className="export-options">
                <button
                  onClick={() =>
                    download(
                      'valet-review.json',
                      JSON.stringify(snapshot(), null, 2),
                      'application/json',
                    )
                  }
                >
                  <Download size={18} />
                  完整檢討 JSON
                </button>
                <button onClick={() => download('boards.pbn', exportPbn(data.boards))}>
                  全部牌型 PBN
                </button>
                <button disabled={!board} onClick={() => board && download(`board-${board.number}.pbn`, exportPbn([board]))}>
                  目前單副 PBN
                </button>
                <button
                  disabled={!data.results.length}
                  onClick={() =>
                    download('results.csv', exportResultsCsv(data.results), 'text/csv')
                  }
                >
                  全部成績 CSV
                </button>
              </div>
              <p className="small muted">
                PBN 匯出只包含牌型；如需保留桌次、姓名與成績，請使用完整檢討
                JSON。試打不會改動原始成績。
              </p>
            </>
          )}
          {modal === 'share' && (
            <>
              <p>以網址分享這一副牌，對方開啟即可查看手牌、比較與試打。</p>
              <label className="field">
                分享內容
                <select
                  value={shareScope}
                  onChange={(e) => {
                    setShareScope(e.target.value as typeof shareScope);
                    setLink('');
                  }}
                >
                  <option value="all">牌型與全部桌次</option>
                  <option value="selected" disabled={!selected}>
                    牌型與選定桌次
                  </option>
                  <option value="none">只分享牌型</option>
                </select>
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={includeNames}
                  onChange={(e) => {
                    setIncludeNames(e.target.checked);
                    setLink('');
                  }}
                />
                包含選手姓名與原始桌名
              </label>
              <div className="share-note">
                <Info size={19} />
                <p>
                  連結包含四家完整手牌。隱藏視角不會隱藏連結裡的資料。試打步驟不包含在分享連結中。
                </p>
              </div>
              <button className="share-button" disabled={working} onClick={() => void makeLink()}>
                {working ? '產生中…' : '產生分享連結'}
              </button>
              {link && (
                <>
                  <label className="field">
                    分享網址
                    <textarea rows={3} readOnly value={link} onFocus={(e) => e.target.select()} />
                  </label>
                  <div className="button-row">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setNotice('已複製分享連結。');
                        } catch {
                          setPopupError('無法自動複製，請選取上方網址後手動複製。');
                        }
                      }}
                    >
                      複製連結
                    </button>
                    <a className="button" href={link} target="_blank" rel="noreferrer">
                      開啟連結
                    </a>
                  </div>
                  {/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (
                    <p className="small muted">
                      目前是本機網址；部署到公開網站後產生的連結，其他人才能從自己的裝置開啟。
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {modal === 'help' && (
            <div className="help-content">
              <h3>看牌與試打</h3>
              <p>
                選擇牌號，再點一桌成績載入合約。點手牌或下方卡牌出牌，系統會限制輪流與跟花。可以回上一步，或點本墩的牌退回該步。
              </p>
              <p>
                鍵盤可按牌面點數（2–9、T、J、Q、K、A）；同點數有多張時，先按花色 S／H／D／C，再按點數，例如 HT。Esc 清除花色選擇。Backspace
                回上一步。點方位切換單家視角，首攻後顯示夢家。
              </p>
              <h3>同副比較</h3>
              <p>
                全部指標依所選 NS／EW 方向計算，不平衡得分採該方向獲判結果。Butler 以該方向有效桌次平均分四捨五入至 10
                分為基準（含該桌、不去頭尾）。Cross IMP 是與其他有效桌次逐一換算 IMP 的平均。
              </p>
              <p>
                MP 勝一桌 2 分、平手 1 分；百分比為得分除以最高可得分。Cancelled
                不參與任何比較。少於兩桌有效成績時不顯示比較分。
              </p>
              <p>勾選兩桌顯示「第一桌 NS 分數 − 第二桌 NS 分數」的 IMP 差，與全場 Butler 分開。</p>
              <h3>分析資料</h3>
              <p>
                最佳墩數、Par 與 LoTT
                使用本機雙夢家引擎。它知道四家牌型；單家視角仍是檢討工具。沒有實際出牌紀錄時，這裡的出牌是自行試打，並非比賽重播。
              </p>
              <h3>保存與分享</h3>
              <p>
                匯入只在瀏覽器處理。按「儲存至瀏覽器」保留到這台裝置；匯出 JSON
                可完整備份。網址分享只包含當前單副與選擇的桌次，無需帳號或資料庫。若牌號重複，請用
                PBN BridgeboardGroup 或 JSON boardId 區分。
              </p>
            </div>
          )}
          {popupError && (
            <p role="alert" className="error-banner">
              {popupError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
