# CLAUDE.md — skill-prompt-studio（AI 技能提示詞工坊）

輸入一段文字或圖片 → 產出可直接建立技能的提示詞：SKILL.md（Claude／通用，`name: user:xxx` 格式），以及 ChatGPT／Gemini／通用 AI 三種「直接貼進對話就註冊成技能」的格式（`namedSkill()`：技能名稱、`/前綴+名稱`（如 `/user:social-post`，依 name 前綴設定）呼叫指令、呼叫規則、「已記住技能」確認回覆，最後附改建 GPT／Gem 的填法）。另有「🔍 逆向工程」分頁：貼上／上傳圖片（或貼文字）→ AI 反推生圖（或寫作）提示詞，可在框內修改、一鍵複製。無框架、無建置、無序號授權。2026-10-29 建立。

## 檔案
- `data.js`：`window.SPS`。`CATEGORIES` 15 種技能類型（kw 關鍵字、desc、overview、inputs、steps、output、rules、starters、example；步驟中的 `{tones}` 會展開成偵測到的平台語氣子項）、`PLATFORM_TONES`（IG／FB／LINE／小紅書／LinkedIn／YouTube／TikTok）、`EXAMPLES` 12 個技能範例、`REV_EXAMPLES` 5 個逆向工程範例（3 張自繪 SVG `examples/*.svg`＋2 段文字，附預先寫好的解析結果，免金鑰可看）、`TONES`／`LANGS`／`DETAILS`。
- `app.js`：
  - 規則式 `ruleSkill()`：英數關鍵字用字界比對（避免 design 命中 ig），中文用包含；`cleanGoal()` 迴圈去掉「我想要／幫我／一個」等請求語（建立類動詞只在後面接「一個」時才去掉）；需求原文 12～160 字直接當 description。
  - 貼上既有 SKILL.md 會由 `parseSkillMd()` 解析（可轉其他平台格式）。
  - 四個 `build*` 產生器依 `state.settings`（detail lite/std/full、lang、tone、prefix、head en/zh）組裝；右側輸出框可直接改，`state.edits[平台]` 各自保留，改左側欄位或設定會清掉。
  - 下載 Claude 技能 ZIP：自寫 store-only ZIP（`makeZip`，UTF-8 檔名旗標）→ `<name>/SKILL.md`。
  - 逆向工程：`loadImage()` 縮到 1536px JPEG；AI 回傳 JSON `{summary, elements, prompt_zh, prompt_en, tags_en, negative_en}`；`revBuild()` 依格式組：通用中英／Gemini・ChatGPT／Midjourney（`nearRatio` 依原圖算 --ar、動漫風用 --niji 6、`stripParams` 先清掉 AI 自帶的 -- 參數）／SD（標籤＋負面＋64 倍數尺寸）；文字則中文／English／結構化。`rev.edits['kind:fmt']` 保留手動修改；「🔁 依細項重組」有金鑰走 AI、沒金鑰只重組中文；「📝 產生反推指令」免金鑰。
  - 全域 `paste` 事件：Ctrl+V 圖片依目前分頁送到技能參考圖（最多 4 張）或逆向工程。
  - 測試 hook `window.__skillPrompt`。
- AI 連線 `PROVIDERS`：gemini／openai／claude／openrouter／xai／deepseek（`vision:false`，圖片不送）／custom（OpenAI 相容，`aiBase` 補 /chat/completions）。圖片格式三家各不同（Gemini `inline_data`、OpenAI 相容 `image_url` data URL、Claude `image.source.base64`）。網站公開，**金鑰一律 BYOK 存使用者瀏覽器，不可寫進程式碼**。
- localStorage：`skillPromptPrefs`（含金鑰）、`skillPromptDraft`、`skillPromptHistory`（20 筆，逆向工程不存圖，只存比例）、`skillPromptWarnSeen`、`skillPromptMarquee`。

## 配套
- ✅ 標準五件套：📖 `manual.html`、⚠ 使用警語（頁面警語列＋「ℹ 關於」首訪自動跳出）、👤 創作者資訊、📲 加入主畫面（PWA，`service-worker.js` network-first，改 js 記得 `CACHE_NAME` +1；`icons/` PIL 自畫拼圖圖示）、訪客計數器 `page_id=m255525.skillpromptstudio`
- ✅ 頂部跑馬燈（共用 Apps Script 端點、滑鼠移入暫停）＋ ⚙ 常用設定（底部「關於本工具」集中入口）
- ✅ RWD：≤980px 單欄且 `.col{display:contents}`＋`order` 讓輸出區排在微調前；375px 無橫向捲動；亮／暗色
- ❌ 序號授權
- ✅ GitHub Pages（2026-10-29 上線）：公開 repo <https://github.com/M255525/skill-prompt-studio>，網址 <https://m255525.github.io/skill-prompt-studio/>，`master`＋`.github/workflows/deploy-pages.yml`；程式牆與 github-dashboard 的 REPO_META 已登記

## 注意
- 逆向工程範例圖必須是自繪或可授權素材，不可放他人作品；AI 反推提示詞要求不指認真人身分、不寫在世藝術家名字。
- name 前綴預設 `user:`（使用者給的範例格式）；Claude 官方規格不允許冒號，manual 有說明可改「無前綴」。

## Port／測試
- port **8839**（`.claude/launch.json` 的 `skill-prompt-studio`）
- 驗證：Playwright 對 `SPS.EXAMPLES` 逐一 `ruleSkill` 檢查類型；`parseSkillMd(buildPrompt('claude'))` 來回；`loadRevExample(0..4)` 檢查四／三個格式分頁；375px `scrollWidth===clientWidth`。
