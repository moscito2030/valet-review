# Valet Review

**English** | [繁體中文](README.zh-TW.md)

Turn “Why were the scores so different?” into a deal you can explore yourself.

Valet Review is a standalone bridge post-game review tool. View all four hands, compare results from different tables playing the same board, and try alternative lines of play. Share a single board through a link—no account or connection to the original tournament database required.

## What you can do

- **Review a collection of boards:** import one or more deals from PBN, switch board numbers, and distinguish boards from different sessions using groups.
- **Compare results across tables:** inspect contracts, opening leads and raw scores; switch between Butler IMP, Cross IMP and Matchpoints. Select two tables for a direct score and IMP comparison. Select a table to see its player names on the deal viewer.
- **Explore the play:** start from a table's contract, play legal cards, undo moves and switch viewing perspectives. Trial play never changes the recorded result.
- **Check ideas with analysis:** double-dummy tricks, Par and the Law of Total Tricks (LoTT) are calculated in a browser worker. All-hands trial play can show double-dummy outcomes for available cards.
- **Share a board:** include all table results, a selected table, or just the deal. Names and original table labels are omitted by default.
- **Keep your review:** save locally, back up the full collection as JSON, or export deals as PBN and results as CSV.

Data is processed in the browser. There is no account system, database or upload endpoint. A first visit without saved data or a share link opens three playable example boards. The application interface currently uses Traditional Chinese; these language links switch the documentation only.

## Get started

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3001`. This leaves port 3000 available for Valet.

1. Choose **Import (匯入)**, select PBN, validate the preview, then confirm.
2. Import a results CSV, or load a complete review JSON instead.
3. Select a table result to load its contract and player names.
4. Click cards to play, click a seat header to change perspective, or choose a declarer and strain from the double-dummy table.
5. Use **Share this board (分享此副)** to create a link, or **Export (匯出)** to keep a file.

## Saving and removing boards

Use **Save review (儲存檢討)** to save explicitly to browser local storage. Saved data belongs to that browser and website origin. Trial-play steps are temporary and are not saved.

Importing PBN or JSON replaces the open collection. Importing CSV replaces the entire results list while retaining the deals. Export JSON first if you need to keep another review.

**Remove this board (移除此牌)** sits beside Save review. After confirmation, it removes the current deal and all its results, then saves the remaining collection locally, replacing the previous save. Removing the last board leaves an empty review that stays empty after reloading. If the browser rejects the save, removal does not take effect.

## Results CSV

```csv
board,table,level,strain,doubled,declarer,tricks,lead,status,N,E,S,W
1,Table 1,4,S,1,N,10,H2,played,North,East,South,West
1,Table 2,3,NT,1,S,9,,played,,,,
1,Table 3,,,,,,,cancelled,,,,
```

- `board`: board number. For repeated numbers, supply `boardId` or distinguish them using `group`. Exported CSV and JSON include board IDs.
- `level`: 0–7. For a passed-out board, use `level=0`, `tricks=0` and `doubled=1`.
- `strain`: S, H, D, C or NT. `doubled`: 1, 2 or 4. `declarer`: N, E, S or W.
- `tricks`: declarer's total tricks, from 0 to 13. `lead`: optional opening lead such as SA or HT.
- `status`: played or cancelled. Cancelled rows may omit contract fields and are excluded from scoring comparisons. Legacy `average` values are read as `cancelled`; exports consistently use `cancelled`.
- `nsScore`: optional. If omitted, the score is calculated from the contract and vulnerability. If supplied, it is treated as the table's assigned NS raw score.
- `assignmentId` and `id`: optional identifiers from the source system. N/E/S/W contain player names.
- CSV, PBN and review JSON files are limited to 2 MB. A collection supports up to 256 boards and 10,000 results.

## PBN and JSON

Review JSON uses the versioned `version: 1` format, including `boards`, `results` and optional board/table selection. Legacy `title` metadata is optional and is not displayed; the toolbar shows board and result counts without a source heading. Export a complete review JSON for a directly reusable example. Validation is defined in [src/lib/model.ts](src/lib/model.ts).

PBN supports complete Deal, Board, Dealer, Vulnerable and BridgeboardGroup tags, plus Contract, Declarer, Result and player names per record. Repeated board records with the same deal are merged while retaining their results. Different deals with the same board number require different groups. PBN export contains deals only; use JSON to preserve all results.

## Comparison formulas

Choose NS or EW to compare the awarded scores in that direction. Split adjustments remain one table; each direction has its own datum. Cancelled results are excluded. Comparison scores are not shown when fewer than two valid results are available.

| Metric | Calculation |
| --- | --- |
| Butler IMP | Average all valid raw scores and round to the nearest 10 for the datum; convert each table's difference from that datum to IMPs. Includes the table itself; no trimming. |
| Cross IMP | Convert the difference against each other table to IMPs, then average. |
| Matchpoints | Two points for each lower score, one for a tie; divide by the maximum available points for the percentage. |
| Head-to-head | Subtract the second table's score in the selected direction from the first, then convert to IMPs. |

## Trial play and analysis

Trial play is temporary exploration, not a replay of the recorded game. Press 2–9, T, J, Q, K or A to play when exactly one legal card matches. If several cards share a rank, enter the suit S/H/D/C first, then the rank—for example, HT. Esc clears the suit prefix; Backspace undoes a move.

In a single-seat perspective, dummy becomes visible after the opening lead. Both single-seat and all-hands views retain played cards in their original positions, faded and disabled.

Double-dummy analysis uses `bridge-dds` and knows all four hands. Hiding hands is a review feature, not an access-control boundary. The engine's license is included in the build at `vendor/dds/LICENSE`.

## Sharing and deployment

Share links carry gzip-compressed single-board data in the URL fragment (`#review=1.…`), without server-side storage or expiry. Anyone with the link can access all four hands. Names, original table labels, collection titles and group names are omitted by default. Trial-play steps are not included. If a link exceeds the length limit, share fewer results, share only the deal, or export JSON.

```sh
npm run build
npm run preview
```

Deploy `dist/` to a static host. For Vercel, use the Vite preset, `npm run build` as the build command and `dist` as the output directory. Review needs no environment variables or database. Commit `vendor/` and `package-lock.json` along with the source so the pinned viewer package is available during installation.

Relative asset paths support hosting under a subdirectory, including GitHub Pages. Use the deployed public HTTPS URL for sharing; a 127.0.0.1 link only works on the recipient's own computer.

## Architecture and checks

React + TypeScript + Vite, delivered as a static frontend.

| Module | Responsibility |
| --- | --- |
| `src/lib/model.ts` | Board/result models and import/share validation |
| `src/lib/imports.ts` | PBN, CSV and JSON conversion |
| `src/lib/scoring.ts` | Contract scores, IMPs and cross-table comparisons |
| `src/lib/play.ts` | Re-exports shared Viewer play rules |
| `src/lib/share.ts` | Single-board snapshots, identity removal, compression and size limits |
| `src/components/deal-explorer.tsx` | Re-exports the shared Viewer component |
| `public/dds-worker.js` | Double-dummy worker copied from the Viewer package |

```sh
npm test
npm run typecheck
npm run build
```

Full auction/play-record replay and account-based cloud sync are not currently supported. Valet exports include both sides of split-contract adjustments. Review JSON, share links and CSV preserve these awards. CSV accepts a `split` JSON object with `ns` and `ew` contracts, or Valet’s paired `splitNS` / `splitEW` columns. Each contract stores `nsScore` in NS coordinates. The viewer shows a rounded datum with an asterisk for split awards; click it for the unrounded NS and EW means.

## Shared deal viewer

The independent **Valet Viewer** repository maintains `@valet/deal-viewer`. Review installs a pinned archive from `vendor/`; it has no local link to another repository and can be installed, built and deployed independently.

Make viewer changes in Valet Viewer, bump its version, then run:

```sh
npm run sync -- ../alternative_online_bridge ../valet-review
```

Run this command from Valet Viewer. Validate all three projects and commit each repository. Pushes remain a separate, explicitly authorized step.
