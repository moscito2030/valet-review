# Valet Review

[English](README.md) | **繁體中文**

把賽後的「為什麼差這麼多分？」變成可以親手探索的牌局。

Valet Review 是獨立的橋牌賽後檢討工具。在瀏覽器裡看四家手牌、比較同一副牌的各桌成績，再選一份合約重新試打。單副牌可透過網址分享，對方不用登入，也不用連接原比賽的資料庫。

## 能做什麼

- **集中檢討一整組牌**：匯入單副或多副 PBN，切換牌號；不同場次相同牌號可以分組管理。
- **找出同副成績的差異**：查看桌次、選手、合約、首攻、原始分，切換 Butler IMP、Cross IMP、MP；勾選兩桌直接比較分差與 IMP。
- **從結果回到出牌**：選擇一桌合約開始試打，依輪次與跟花規則出牌，回上一步、重打或切換方位視角。原始成績保持不變。
- **用分析檢查想法**：雙夢家最佳墩數、Par 與 LoTT 在瀏覽器的背景執行緒計算；出牌時顯示後續最佳墩數。
- **分享一副值得討論的牌**：連結可包含全部桌次、選定桌次或只有牌型；預設移除姓名與原始桌名。
- **保留自己的檢討資料**：本機儲存、完整 JSON 備份、PBN 牌型與成績 CSV 匯出。

資料在瀏覽器處理，沒有帳號、資料庫或上傳端點。首次開啟且沒有儲存資料或分享連結時，提供三副可操作的示範牌局。介面目前仍使用繁體中文；頂端語言連結只切換文件。

## 開始使用

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

開啟 `http://127.0.0.1:3001`。不會占用 Valet 使用的 3000 埠。

1. 按「匯入」，選擇 PBN，驗證預覽後確認。
2. 再匯入成績 CSV，或直接匯入一份完整檢討 JSON。
3. 在成績列表選擇桌次，載入該桌的合約與姓名。
4. 點牌出牌；點方位切換視角；點最佳墩數表可自選合約花色與莊家。
5. 按「分享此副」，產生連結；或「匯出」保存完整資料。

本機儲存需主動按「儲存檢討」，資料屬於目前瀏覽器與網站來源；試打步驟不會儲存。匯入會取代目前開啟的資料；CSV 只取代整份成績清單，牌型保留。需要保留另一份檢討時，請先匯出 JSON。

「移除此牌」位於「儲存檢討」旁。確認後移除目前牌型與其各桌成績，並將剩餘檢討一併儲存到本機（取代原先的儲存）。移除最後一副後保留空白檢討，重新開啟也不會自動載回示範牌。若瀏覽器拒絕儲存，移除不會生效。

## 成績 CSV

基本範例：

```csv
board,table,level,strain,doubled,declarer,tricks,lead,status,N,E,S,W
1,第1桌,4,S,1,N,10,H2,played,北家,東家,南家,西家
1,第2桌,3,NT,1,S,9,,played,,,,
1,第3桌,,,,,,,cancelled,,,,
```

- `board` 是牌號；重複牌號需填 `boardId`，或加上 `group` 區分。`boardId` 可從匯出的 CSV／JSON 取得。
- `level`：0–7；Pass 填 0，`tricks=0`、`doubled=1`。
- `strain`：S、H、D、C、NT；`doubled`：1、2、4；`declarer`：N、E、S、W。
- `tricks`：莊家實得墩數 0–13。`lead` 可空白，或填如 SA、HT。
- `status`：played 或 cancelled。Cancelled 可不填合約欄位，不參與計分比較。舊檔的 average 會讀成 cancelled，匯出統一使用 cancelled。
- `nsScore` 選填；未提供時依合約與身價計算，提供時視為該桌獲判的 NS 原始分。
- `assignmentId`、`id` 可保存原系統的識別碼；N/E/S/W 可帶入入座姓名。
- CSV、PBN 與檢討 JSON 檔案上限皆為 2 MB。每份資料最多 256 副、10,000 筆成績。

完整 JSON 是版本化的 `version: 1` 格式，包含 `boards`、`results` 及選定牌局／桌次。舊檔案的 `title` 為選填相容資料，不在介面顯示；上方僅保留牌數、成績筆數與操作按鈕，不區分牌局來源標題。請用「匯出完整檢討 JSON」取得可直接重匯的範例；驗證規則在 `src/lib/model.ts`。

PBN 支援完整 Deal、Board、Dealer、Vulnerable、BridgeboardGroup，以及每筆紀錄的 Contract／Declarer／Result 與四家姓名。相同牌型的重複 Board 紀錄會合併，成績各自保留；相同牌號但不同牌型需有不同分組。PBN 匯出只保存牌型，保存全部結果請用 JSON。

## 比較公式

可切換 NS／EW，以該方向的獲判得分比較。不平衡得分仍只算一桌，兩方向各有自己的 Datum；Cancelled 排除。少於兩筆有效成績時不顯示比較分。

| 項目 | 計算方式 |
| --- | --- |
| Butler IMP | 全部有效桌次平均原始分，四捨五入至 10 分，作為 Datum；各桌與 Datum 的差轉為 IMP。含本桌、不去頭尾。 |
| Cross IMP | 與其他每一桌逐一轉為 IMP，再取平均。 |
| MP | 勝一桌 2 分、平手 1 分；百分比除以可得最高分。 |
| 兩桌對照 | 依所選方向，第一桌獲判分減第二桌獲判分，再換算 IMP。 |

## 試打與分析

試打是獨立的暫存狀態，並非實際比賽的出牌重播。鍵盤可按 2–9、T、J、Q、K、A；只有一張合法牌符合該點數時才出牌。同點數有多張時，先按花色 S／H／D／C，再按點數（例如 HT）；Esc 清除花色選擇，Backspace 回上一步。單家視角首攻後顯示夢家；單家與全手牌視角都保留已出牌位置並淡化表示，已出牌不可再次點選。

雙夢家分析使用 `bridge-dds`。引擎知道四家牌型；視角隱藏是檢討功能，不是安全隔離。下載的依賴授權一併保留於建置輸出的 `vendor/dds/LICENSE`。牌桌、試打與基本計分程式源自 Valet，本專案可獨立執行，不需原倉庫。

## 分享與部署

連結使用網址 fragment（`#review=1.…`）攜帶 gzip 壓縮的單副資料，沒有伺服器儲存期限。任何拿到連結的人都能讀取其中四家手牌；預設不含姓名、原桌名、集合名稱與分組名稱。試打步驟不包含於連結。超過長度上限可改分享單桌、僅牌型，或改用 JSON 檔。

```sh
npm run build
npm run preview
```

將 `dist/` 部署至靜態網站主機即可。Vercel 選 Vite，建置指令 `npm run build`、輸出資料夾 `dist`；不需要環境變數或資料庫。部署時請一併提交 `vendor/` 與 `package-lock.json`，確保可安裝固定版本的檢視器套件。相對路徑資源也可放在子目錄，包含 GitHub Pages。正式分享請使用部署後的公開 HTTPS 網址；127.0.0.1 連結只適用本機。

## 架構與檢查

React + TypeScript + Vite，純前端靜態網站。

| 模組 | 職責 |
| --- | --- |
| `src/lib/model.ts` | 牌局與結果模型、匯入／分享邊界驗證 |
| `src/lib/imports.ts` | PBN、CSV、JSON 轉換 |
| `src/lib/scoring.ts` | 合約分、IMP、跨桌比較 |
| `src/lib/play.ts` | 轉出共用 Viewer 的試打規則 |
| `src/lib/share.ts` | 單副快照、姓名移除、壓縮與大小限制 |
| `src/components/deal-explorer.tsx` | 轉出共用 Viewer 的牌局檢視器 |
| `public/dds-worker.js` | 從 Viewer 套件複製的背景雙夢家計算 Worker |

```sh
npm test
npm run typecheck
npm run build
```

目前不處理叫牌／出牌紀錄的完整重播與帳號雲端同步。Valet 輸出、檢討 JSON、分享連結與 CSV 皆可保留不平衡得分。CSV 可使用含 ns／ew 合約的 split JSON 欄，或 Valet 的 splitNS／splitEW 雙欄；合約內 nsScore 皆以 NS 方向儲存。檢視器顯示取整至十位的 Datum，有不平衡得分時加上星號，點擊可查看 NS／EW 未取整至十位的平均分。

## 共用牌局檢視器

本專案使用獨立 Valet Viewer 倉庫維護的 `@valet/deal-viewer`，透過 vendor/ 內固定版本打包檔安裝。沒有指向其他倉庫的本機連結，因此可獨立 npm ci、建置與部署。

修改檢視器請到 Valet Viewer，升版並執行 `npm run sync -- ../alternative_online_bridge ../valet-review`。三個專案都需驗證並各自 commit，未經使用者指定不 push。

頁尾顯示部署 commit 前七碼，可點擊查看 GitHub 提交；滑鼠停留可看完整 hash 與 commit message。版本資訊由 Vercel 在建置時注入，本機顯示「本機開發版」，部署缺少 Git 資訊時顯示「版本資訊未提供」。

開啟 Review 時會顯示可關閉的牌局來源提示：網址分享、本機儲存或示範牌局。網址資料優先於本機儲存；沒有儲存資料或讀取失敗時顯示示範牌局，讀取失敗會另說明原因。
