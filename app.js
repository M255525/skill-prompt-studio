/* AI 技能提示詞工坊 — 主程式（規則式技能產生＋BYOK AI 產生／逆向工程） */
(function () {
  'use strict';
  var D = window.SPS;
  var $ = function (id) { return document.getElementById(id); };
  var LS = { prefs: 'skillPromptPrefs', draft: 'skillPromptDraft', history: 'skillPromptHistory', warn: 'skillPromptWarnSeen' };

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return list[0]; }
  function fillSelect(sel, list, cur, label) {
    sel.innerHTML = list.map(function (x) { var v = x.id != null ? x.id : x; return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label ? label(x) : (x.zh || x.label || x)) + '</option>'; }).join('');
  }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function lines(s) { return String(s || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function period(s) { s = String(s || '').trim(); return !s || /[。．.！!？?」]$/.test(s) ? s : s + '。'; }

  var PLATFORMS = [
    { id: 'claude', label: 'SKILL.md（Claude／通用）', tip: '標準技能檔格式。<b>Claude</b>：按「下載 Claude 技能 ZIP」，到 claude.ai「設定 → 功能 → 技能」上傳；Claude Code 則放到 <code>~/.claude/skills/名稱/SKILL.md</code>。<b>ChatGPT／Gemini</b> 也可以整段貼到 GPT／Gem 或專案的「指示」欄位。' },
    { id: 'chatgpt', label: 'ChatGPT 自訂 GPT', tip: 'ChatGPT →「探索 GPT」→「建立」→「設定」：名稱、說明、指示、對話啟動器分別貼到對應欄位（也可整段貼到「專案 → 指示」）。' },
    { id: 'gemini', label: 'Gemini Gem', tip: 'Gemini →「Gem 管理工具」→「新增 Gem」：名稱貼到名稱欄，【指示】以下整段貼到「指示」欄位。' },
    { id: 'generic', label: '通用系統提示詞', tip: '適用 Copilot、Grok、DeepSeek、Perplexity、Claude 專案等：貼到「自訂指令／系統提示詞」，或直接當對話第一句送出。' }
  ];
  var REV_FMTS = {
    image: [
      { id: 'universal', label: '通用（中英對照）', tip: '中文版給 Gemini、ChatGPT、Copilot；English 版給 Midjourney、DALL·E、Leonardo 等。' },
      { id: 'gemini', label: 'Gemini／ChatGPT 生圖', tip: '中文自然語言，直接貼到 Gemini（Nano Banana）或 ChatGPT 生圖；可再上傳原圖當參考。' },
      { id: 'mj', label: 'Midjourney', tip: '英文提示詞＋--ar 比例（依原圖自動計算）＋版本參數，不想要的元素放在 --no。' },
      { id: 'sd', label: 'Stable Diffusion／Flux', tip: '逗號分隔的英文標籤＋負面提示詞（Negative prompt），貼到 WebUI、ComfyUI 等。' }
    ],
    text: [
      { id: 'zh', label: '中文提示詞', tip: '【】括起來的是可替換的變數，換成你的主題即可重複使用。' },
      { id: 'en', label: 'English prompt', tip: 'English version of the reverse-engineered writing prompt.' },
      { id: 'struct', label: '結構化（角色／任務／格式）', tip: '依解析細項組成的結構化提示詞，適合再做成技能或 GPT。' }
    ]
  };
  var EL_LABELS = {
    image: [['subject', '主體與動作'], ['style', '畫風／媒材'], ['composition', '構圖與鏡頭'], ['lighting', '光線'], ['color', '色彩與色調'], ['background', '背景與場景'], ['mood', '氛圍'], ['details', '細節與圖中文字']],
    text: [['role', '作者角色'], ['task', '任務'], ['audience', '目標讀者'], ['tone', '語氣風格'], ['structure', '結構'], ['length', '長度'], ['format', '格式特徵'], ['keywords', '必備元素']]
  };

  var DEF_PREFS = { platform: 'claude', detail: 'std', lang: 'zh-TW', prefix: 'user:', head: 'en', revFmt: 'universal', theme: 'system',
    aiProvider: 'gemini', aiModel: '', aiModelCustom: '', aiBase: '', aiKey: '' };
  var prefs = Object.assign({}, DEF_PREFS, lsGet(LS.prefs, {}));

  var state = {
    main: 'skill', text: '', images: [], skill: null, source: '', platform: prefs.platform,
    settings: { detail: prefs.detail, lang: prefs.lang, tone: 'auto', prefix: prefs.prefix, head: prefs.head },
    edits: {},
    rev: { image: null, text: '', kind: '', result: null, meta: '', fmt: { image: prefs.revFmt, text: 'zh' }, edits: {} }
  };

  /* ================= 規則式技能產生 ================= */
  function kwMatch(text, kw) {
    if (/^[a-z0-9 .\-]+$/i.test(kw)) return new RegExp('(^|[^a-z])' + kw.replace(/[.\-]/g, '\\$&') + '([^a-z]|$)', 'i').test(text);
    return text.toLowerCase().indexOf(kw.toLowerCase()) >= 0;
  }
  function detectCategory(text) {
    var best = null, bestScore = 0;
    D.CATEGORIES.forEach(function (c) {
      var s = c.kw.filter(function (k) { return kwMatch(text, k); }).length;
      if (s > bestScore) { best = c; bestScore = s; }
    });
    return best;
  }
  function detectPlatforms(text) { return D.PLATFORM_TONES.filter(function (p) { return p.kw.some(function (k) { return kwMatch(text, k); }); }); }
  function cleanGoal(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var prev;
    do { prev = t; t = t.replace(/^(我想要|我想|我要|我需要|請你|請|麻煩|幫我|幫忙|(?:做|建立|新增|設計|產生|弄)(?=\s*(?:一個|個))|一個|個)\s*/, ''); } while (t !== prev);
    t = t.replace(/(的)?\s*(skill|技能|助手|機器人|工具|gpt|gem)\s*[。.!！]*$/i, '');
    return t.trim();
  }

  function ruleSkill(text, hasImage) {
    var cat = detectCategory(text);
    var imgHint = hasImage || D.IMAGE_KW.some(function (k) { return text.indexOf(k) >= 0; });
    if (!cat) cat = imgHint && !text.trim() ? byId(D.CATEGORIES, 'image-analysis') : byId(D.CATEGORIES, 'generic');
    if (!cat.kw.length && imgHint && !text.trim()) cat = byId(D.CATEGORIES, 'image-analysis');
    var plats = detectPlatforms(text);
    var platNames = plats.length ? plats.map(function (p) { return p.label; }).join('、') : (cat.plat || '');
    var tonePlats = plats.length ? plats : (cat.id === 'social-post' ? [byId(D.PLATFORM_TONES, 'ig'), byId(D.PLATFORM_TONES, 'fb')] : cat.id === 'video-script' ? [byId(D.PLATFORM_TONES, 'tiktok')] : []);

    var steps = [];
    cat.steps.forEach(function (s) {
      if (s.indexOf('{tones}') >= 0) {
        steps.push(s.replace('{tones}', '').trim());
        tonePlats.forEach(function (p) { steps.push('- **' + p.label + '**：' + p.tone); });
      } else steps.push(s);
    });
    var inputs = cat.inputs.slice();
    if (imgHint && ['image-analysis', 'receipt-ocr'].indexOf(cat.id) < 0 && steps[0].indexOf('圖片') < 0) {
      steps.unshift(D.IMAGE_STEP);
      if (!inputs.some(function (x) { return x.indexOf('圖') >= 0; })) inputs.push('參考圖片或截圖（選填）');
    }

    var goal = cleanGoal(text), desc, overview = cat.overview;
    if ((goal.length >= 12 || (cat.id === 'generic' && goal.length >= 4)) && goal.length <= 160) desc = period(goal);
    else desc = cat.desc.replace('{plat}', platNames);
    if (cat.id === 'generic' && desc === period(goal) && !/^(協助|幫助|根據|把|將)/.test(goal)) desc = '協助使用者' + desc;
    if (cat.id === 'generic' && goal) overview = '這個技能協助使用者' + period(goal.replace(/^(能夠|可以|能)/, ''));

    return { name: cat.slug, title: cat.en, zh: cat.zh, desc: desc, overview: overview, steps: steps, inputs: inputs,
      output: cat.output.slice(), rules: cat.rules.slice(), example: cat.example || '', starters: cat.starters.slice(), cat: cat.id };
  }

  // 貼上既有 SKILL.md 時直接解析
  function looksLikeSkillMd(t) { return /^\s*---\s*\n[\s\S]*?\bname\s*:[\s\S]*?\n---/.test(t); }
  function parseSkillMd(md) {
    var m = md.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    var fm = m[1], body = m[2];
    function fmv(k) { var r = fm.match(new RegExp('^' + k + '\\s*:\\s*(.*)$', 'm')); return r ? r[1].trim().replace(/^["']|["']$/g, '') : ''; }
    var sk = { name: fmv('name').replace(/^user:/, ''), title: '', zh: '', desc: fmv('description'), overview: '', steps: [], inputs: [], output: [], rules: [], example: '', starters: [] };
    var t = body.match(/^#\s+(.+)$/m); sk.title = t ? t[1].trim() : sk.name;
    sk.zh = sk.title;
    var secs = body.split(/^##\s+/m).slice(1);
    var other = [];
    secs.forEach(function (sec) {
      var nl = sec.indexOf('\n'), head = (nl < 0 ? sec : sec.slice(0, nl)).trim(), content = nl < 0 ? '' : sec.slice(nl + 1).trim();
      var items = content.split('\n').filter(function (x) { return x.trim(); }).map(function (x) {
        if (/^\s{2,}[-*]\s+/.test(x)) return '- ' + x.replace(/^\s*[-*]\s+/, '');
        return x.trim().replace(/^(\d+[.)、]|[-*])\s+/, '');
      });
      var h = head.toLowerCase();
      if (/overview|概述|簡介|說明/.test(h)) sk.overview = content;
      else if (/instruction|步驟|流程|指示/.test(h)) sk.steps = items;
      else if (/input|輸入/.test(h)) sk.inputs = items;
      else if (/output|輸出|格式/.test(h)) sk.output = items;
      else if (/guideline|rule|constraint|注意|限制|規則/.test(h)) sk.rules = items;
      else if (/example|範例/.test(h)) sk.example = content;
      else other.push('## ' + head + '\n' + content);
    });
    if (other.length) sk.rules = sk.rules.concat(other.join('\n').split('\n').filter(Boolean));
    if (!sk.steps.length) sk.steps = ['依使用者需求執行本技能。'];
    return sk;
  }

  /* ================= 各平台輸出 ================= */
  function heads() {
    return state.settings.head === 'zh'
      ? { ov: '概述', inp: '輸入資料', ins: '步驟', out: '輸出格式', rules: '注意事項', ex: '範例' }
      : { ov: 'Overview', inp: 'Inputs', ins: 'Instructions', out: 'Output Format', rules: 'Guidelines', ex: 'Examples' };
  }
  function isSub(l) { return /^[-－•*]\s*/.test(l); }
  function stepsMd(steps, indent) {
    var n = 0, pad = indent || '   ';
    return steps.map(function (l) { return isSub(l) ? pad + '- ' + l.replace(/^[-－•*]\s*/, '') : (++n) + '. ' + l; }).join('\n');
  }
  function bullets(arr) { return arr.map(function (x) { return '- ' + x.replace(/^[-－•*]\s*/, ''); }).join('\n'); }
  function extraRules() {
    var r = [byId(D.LANGS, state.settings.lang).rule];
    var tone = byId(D.TONES, state.settings.tone); if (tone.rule) r.push(tone.rule);
    return r;
  }
  function allRules(sk) { return sk.rules.concat(extraRules()); }
  function yamlVal(s) {
    s = String(s || '').replace(/\n+/g, ' ').trim();
    return /: |#|^[\[\]{}>|*&!%@`'"-]/.test(s) ? '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : s;
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/^user:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'my-skill'; }

  function buildClaude(sk) {
    var H = heads(), d = state.settings.detail, out = [];
    out.push('---', 'name: ' + state.settings.prefix + slug(sk.name), 'description: ' + yamlVal(sk.desc), '---', '', '# ' + (sk.title || sk.zh), '');
    out.push('## ' + H.ov, sk.overview || sk.desc, '');
    if (d === 'full' && sk.inputs.length) out.push('## ' + H.inp, bullets(sk.inputs), '');
    var steps = sk.steps.slice();
    if (d === 'lite') steps.push(extraRules()[0] + '。');
    out.push('## ' + H.ins, stepsMd(steps), '');
    if (d !== 'lite') {
      if (sk.output.length) out.push('## ' + H.out, bullets(sk.output), '');
      out.push('## ' + H.rules, bullets(allRules(sk)), '');
    }
    if (d === 'full' && sk.example.trim()) out.push('## ' + H.ex, sk.example.trim(), '');
    return out.join('\n').trim() + '\n';
  }
  function buildChatGPT(sk) {
    var d = state.settings.detail, out = [];
    out.push('【GPT 名稱】' + sk.zh, '【說明】' + sk.desc, '', '【指示】（以下貼到「設定 → 指示」）', '# 角色', '你是「' + sk.zh + '」。' + (sk.overview || ''), '');
    if (d === 'full' && sk.inputs.length) out.push('# 使用者會提供', bullets(sk.inputs), '');
    out.push('# 工作流程', stepsMd(sk.steps), '');
    if (d !== 'lite' && sk.output.length) out.push('# 輸出格式', bullets(sk.output), '');
    var rules = d === 'lite' ? extraRules() : allRules(sk);
    out.push('# 注意事項', bullets(rules.concat(['使用者提供的資訊不足時，先用 1～3 個問題確認，再開始產出'])), '');
    if (d === 'full' && sk.example.trim()) out.push('# 範例', sk.example.trim(), '');
    if (sk.starters.length) out.push('【對話啟動器】', bullets(sk.starters));
    return out.join('\n').trim() + '\n';
  }
  function buildGemini(sk) {
    var d = state.settings.detail, out = [];
    out.push('【Gem 名稱】' + sk.zh, '【說明】' + sk.desc, '', '【指示】（以下貼到 Gem 的「指示」欄位）', '## 角色（Persona）', '你是「' + sk.zh + '」。' + (sk.overview || ''), '',
      '## 任務（Task）', sk.desc, '');
    if (d !== 'lite' && sk.inputs.length) out.push('## 背景與輸入（Context）', '使用者會提供：', bullets(sk.inputs), '');
    out.push('## 執行步驟', stepsMd(sk.steps), '');
    if (d !== 'lite' && sk.output.length) out.push('## 輸出格式（Format）', bullets(sk.output), '');
    out.push('## 限制', bullets(d === 'lite' ? extraRules() : allRules(sk)), '');
    if (d === 'full' && sk.example.trim()) out.push('## 範例', sk.example.trim(), '');
    if (sk.starters.length && d === 'full') out.push('【可以這樣開始】', bullets(sk.starters));
    return out.join('\n').trim() + '\n';
  }
  function buildGeneric(sk) {
    var d = state.settings.detail, out = [];
    out.push('你是一個專門負責「' + sk.zh + '」的 AI 助理。' + (sk.overview || ''), '', '【任務】' + sk.desc, '');
    if (d === 'full' && sk.inputs.length) out.push('【我會提供】', bullets(sk.inputs), '');
    out.push('【執行步驟】', stepsMd(sk.steps), '');
    if (d !== 'lite' && sk.output.length) out.push('【輸出格式】', bullets(sk.output), '');
    out.push('【規則】', bullets(d === 'lite' ? extraRules() : allRules(sk)), '');
    if (d === 'full' && sk.example.trim()) out.push('【範例】', sk.example.trim(), '');
    out.push('準備好後，請用一句話向我打招呼，並詢問需要處理的內容。');
    return out.join('\n').trim() + '\n';
  }
  var BUILDERS = { claude: buildClaude, chatgpt: buildChatGPT, gemini: buildGemini, generic: buildGeneric };
  function buildPrompt(pid) { return state.skill ? BUILDERS[pid || state.platform](state.skill) : ''; }
  function finalPrompt(pid) { pid = pid || state.platform; return state.edits[pid] != null ? state.edits[pid] : buildPrompt(pid); }

  /* ================= 技能畫面 ================= */
  var FIELD_MAP = [['fName', 'name'], ['fTitle', 'title'], ['fZh', 'zh'], ['fDesc', 'desc'], ['fOverview', 'overview'], ['fExample', 'example']];
  var LIST_MAP = [['fSteps', 'steps'], ['fInputs', 'inputs'], ['fOutput', 'output'], ['fRules', 'rules'], ['fStarters', 'starters']];
  function renderFields() {
    var sk = state.skill || {};
    FIELD_MAP.forEach(function (f) { $(f[0]).value = sk[f[1]] || ''; });
    LIST_MAP.forEach(function (f) { $(f[0]).value = (sk[f[1]] || []).join('\n'); });
  }
  function readFields() {
    if (!state.skill) state.skill = { name: '', title: '', zh: '', desc: '', overview: '', steps: [], inputs: [], output: [], rules: [], example: '', starters: [] };
    FIELD_MAP.forEach(function (f) { state.skill[f[1]] = $(f[0]).value; });
    LIST_MAP.forEach(function (f) { state.skill[f[1]] = lines($(f[0]).value); });
  }
  function renderTabs() {
    $('platformTabs').innerHTML = PLATFORMS.map(function (p) { return '<button type="button" role="tab" class="tab' + (p.id === state.platform ? ' on' : '') + '" aria-selected="' + (p.id === state.platform) + '" data-pf="' + p.id + '">' + esc(p.label) + '</button>'; }).join('');
    $('platformTip').innerHTML = byId(PLATFORMS, state.platform).tip;
  }
  function renderOutput() {
    var txt = finalPrompt(), ed = state.edits[state.platform] != null;
    $('skillOut').value = txt;
    $('skillEdited').hidden = !ed; $('btnResetOut').hidden = !ed;
    $('outLen').textContent = txt ? txt.length + ' 字' : '';
    $('srcBadge').textContent = state.skill ? (state.source || '手動') : '尚未產生';
    $('btnDownZip').disabled = $('btnDownMd').disabled = !state.skill;
  }
  function renderOpts() {
    fillSelect($('optDetail'), D.DETAILS, state.settings.detail);
    fillSelect($('optLang'), D.LANGS, state.settings.lang);
    fillSelect($('optTone'), D.TONES, state.settings.tone);
    $('optPrefix').value = state.settings.prefix; $('optHead').value = state.settings.head;
  }
  function saveDraft() { lsSet(LS.draft, { text: state.text, skill: state.skill, source: state.source, settings: state.settings, platform: state.platform, edits: state.edits }); }

  function setSkill(sk, source) {
    state.skill = sk; state.source = source; state.edits = {};
    renderFields(); renderOutput(); saveDraft();
  }
  function generateRule(silent) {
    var text = state.text.trim();
    if (!text && !state.images.length) { toast('請先描述技能，或放一張參考圖片'); return; }
    if (looksLikeSkillMd(text)) {
      setSkill(parseSkillMd(text), '匯入 SKILL.md');
      setStatus('genStatus', '✓ 偵測到既有 SKILL.md，已匯入，可切換分頁轉成 ChatGPT／Gemini 格式。', 'ok'); return;
    }
    var sk = ruleSkill(text, state.images.length > 0);
    setSkill(sk, '規則式');
    if (!silent) setStatus('genStatus', '✓ 已用規則式產生（判定類型：' + byId(D.CATEGORIES, sk.cat).zh + '）。想要更貼近需求、或要 AI 真的看圖，請按「🤖 AI 產生」。', 'ok');
  }
  function setStatus(id, msg, cls) { var el = $(id); el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : ''); }

  /* ================= 圖片處理 ================= */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('不是圖片檔')); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight, max = 1536, s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL('image/jpeg', 0.88);
          resolve({ name: file.name || '貼上的圖片', mime: 'image/jpeg', dataUrl: url, b64: url.split(',')[1], w: w, h: h });
        };
        img.onerror = function () { reject(new Error('圖片無法讀取')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('檔案讀取失敗')); };
      fr.readAsDataURL(file);
    });
  }
  function renderThumbs() {
    $('skillThumbs').innerHTML = state.images.map(function (im, i) { return '<div class="thumb"><img src="' + im.dataUrl + '" alt="' + esc(im.name) + '"><button type="button" data-rmimg="' + i + '" aria-label="移除圖片">✕</button></div>'; }).join('');
    var r = state.rev.image;
    $('revThumbs').innerHTML = r ? '<div class="thumb big"><img src="' + r.dataUrl + '" alt="要反推的圖片"><button type="button" data-rmrev="1" aria-label="移除圖片">✕</button></div><span class="note">' + r.w + ' × ' + r.h + '（比例約 ' + nearRatio(r.w, r.h) + '）</span>' : '';
  }
  function addFiles(files, target) {
    var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) return;
    if (target === 'reverse') {
      loadImage(arr[0]).then(function (im) { state.rev.image = im; renderThumbs(); toast('已放入圖片，按「🤖 AI 反推提示詞」'); }).catch(function (e) { toast(e.message); });
      return;
    }
    var room = 4 - state.images.length;
    if (room <= 0) { toast('最多 4 張參考圖片'); return; }
    Promise.all(arr.slice(0, room).map(loadImage)).then(function (ims) { state.images = state.images.concat(ims); renderThumbs(); toast('已加入 ' + ims.length + ' 張參考圖片'); }).catch(function (e) { toast(e.message); });
  }
  function nearRatio(w, h) {
    var R = [[1, 1], [4, 3], [3, 4], [3, 2], [2, 3], [16, 9], [9, 16], [21, 9], [4, 5], [5, 4]], r = w / h, best = R[0];
    R.forEach(function (x) { if (Math.abs(Math.log(x[0] / x[1] / r)) < Math.abs(Math.log(best[0] / best[1] / r))) best = x; });
    return best[0] + ':' + best[1];
  }
  function bindDrop(dropId, fileId, target) {
    var dz = $(dropId), fi = $(fileId);
    dz.addEventListener('click', function () { fi.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', function () { addFiles(fi.files, target); fi.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files, target); });
  }

  /* ================= BYOK AI ================= */
  var PROVIDERS = {
    gemini: { label: 'Gemini（Google AI Studio）', vision: true, models: [['gemini-3.5-flash', 'Gemini 3.5 Flash（均衡，推薦）'], ['gemini-3.5-pro', 'Gemini 3.5 Pro（最強）'], ['gemini-2.5-flash', 'Gemini 2.5 Flash（快速省錢）']] },
    openai: { label: 'OpenAI', vision: true, url: 'https://api.openai.com/v1/chat/completions', models: [['gpt-5-mini', 'GPT-5 mini（均衡，推薦）'], ['gpt-5', 'GPT-5（最強）'], ['gpt-4o-mini', 'GPT-4o mini（快速省錢）']] },
    claude: { label: 'Claude（Anthropic）', vision: true, models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5（均衡，推薦）'], ['claude-opus-5-5', 'Claude Opus 5.5（最強）'], ['claude-haiku-5-5', 'Claude Haiku 5.5（快速省錢）']] },
    openrouter: { label: 'OpenRouter', vision: true, url: 'https://openrouter.ai/api/v1/chat/completions', models: [['openai/gpt-4o-mini', 'OpenAI GPT-4o mini（推薦）'], ['google/gemini-2.5-flash', 'Google Gemini 2.5 Flash'], ['anthropic/claude-sonnet-4.5', 'Anthropic Claude Sonnet 4.5']] },
    xai: { label: 'xAI Grok', vision: true, url: 'https://api.x.ai/v1/chat/completions', models: [['grok-4', 'Grok 4'], ['grok-3-mini', 'Grok 3 mini（快速省錢，不支援看圖）']] },
    deepseek: { label: 'DeepSeek（只支援文字）', vision: false, url: 'https://api.deepseek.com/chat/completions', models: [['deepseek-chat', 'DeepSeek Chat（推薦）'], ['deepseek-reasoner', 'DeepSeek Reasoner（推理）']] },
    custom: { label: '自訂（OpenAI 相容端點，例如 Ollama、LM Studio）', vision: true, models: [] }
  };
  function aiModel() { return (prefs.aiModelCustom || '').trim() || prefs.aiModel || ((PROVIDERS[prefs.aiProvider] || PROVIDERS.gemini).models[0] || [''])[0]; }
  function customUrl(base) { base = (base || '').trim().replace(/\/+$/, ''); return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'; }
  function aiReady() { return prefs.aiProvider === 'custom' ? !!(prefs.aiBase || '').trim() && !!aiModel() : !!prefs.aiKey; }
  function needAi() { toast('請先在 ⚙ 常用設定填入 AI 金鑰（自訂端點需填網址與模型）'); openSettings(); }

  async function callLLM(prompt, images, wantJson, statusId) {
    var provider = prefs.aiProvider, model = aiModel(), apiKey = prefs.aiKey, url, headers, body, extract;
    images = (PROVIDERS[provider] || {}).vision === false ? [] : (images || []);
    if (provider === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      var content = images.map(function (im) { return { type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } }; });
      content.push({ type: 'text', text: prompt });
      body = { model: model, max_tokens: 4000, messages: [{ role: 'user', content: content }] };
      extract = function (d) { return (d.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(''); };
    } else if (provider !== 'gemini') {
      url = provider === 'custom' ? customUrl(prefs.aiBase) : PROVIDERS[provider].url;
      headers = { 'content-type': 'application/json' };
      if (apiKey) headers.authorization = 'Bearer ' + apiKey;
      var msg = images.length ? [{ type: 'text', text: prompt }].concat(images.map(function (im) { return { type: 'image_url', image_url: { url: im.dataUrl } }; })) : prompt;
      body = { model: model, messages: [{ role: 'user', content: msg }] };
      extract = function (d) { return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content; };
    } else {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
      var parts = images.map(function (im) { return { inline_data: { mime_type: im.mime, data: im.b64 } }; });
      parts.push({ text: prompt });
      body = { contents: [{ parts: parts }] };
      if (wantJson) body.generationConfig = { responseMimeType: 'application/json' };
      extract = function (d) { var ps = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []; return ps.map(function (p) { return p.text || ''; }).join(''); };
    }
    for (var attempt = 1; attempt <= 3; attempt++) {
      var resp = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
      var raw = await resp.text();
      if (resp.ok) { var t = extract(JSON.parse(raw)); if (!t) throw new Error('回應中沒有文字內容'); return t; }
      var em = raw.slice(0, 200);
      try { var e = JSON.parse(raw); em = (e.error && e.error.message) || e.message || em; } catch (x) {}
      if ({ 429: 1, 500: 1, 503: 1, 529: 1 }[resp.status] && attempt < 3) {
        if (statusId) setStatus(statusId, '服務忙碌（' + resp.status + '），' + attempt * 6 + ' 秒後重試…');
        await new Promise(function (r) { setTimeout(r, attempt * 6000); }); continue;
      }
      throw new Error('HTTP ' + resp.status + '：' + em);
    }
  }
  function parseJsonObj(txt) {
    var s = txt.indexOf('{'), e = txt.lastIndexOf('}');
    if (s < 0 || e < s) throw new Error('AI 回傳的不是 JSON');
    return JSON.parse(txt.slice(s, e + 1));
  }
  function arr(v) { return Array.isArray(v) ? v.map(String).filter(Boolean) : lines(v); }
  function visionWarn(n) { return n && (PROVIDERS[prefs.aiProvider] || {}).vision === false ? '（' + PROVIDERS[prefs.aiProvider].label + ' 不能看圖，圖片未送出）' : ''; }

  function aiSkillPrompt() {
    var n = state.images.length;
    return '你是 AI 技能（Claude Skill、ChatGPT 自訂 GPT、Gemini Gem）設計專家。請依使用者的需求描述' + (n ? '與附上的 ' + n + ' 張圖片' : '') + '，設計一個可重複使用、指令清楚的技能。\n' +
      (n ? '先判斷圖片是「技能要處理的輸入範例」還是「想要的輸出樣式／範本」，把觀察到的重點（版面、欄位、風格、語氣）具體寫進步驟與輸出格式。\n' : '') +
      '規則：\n- 全部使用繁體中文（台灣用語），name 與 title 用英文\n- steps 4～7 個具體可執行的步驟；若某步驟需要分項說明，用「- **項目**：說明」寫成獨立元素並放在該步驟後面\n- description 一句話（120 字內），寫清楚「做什麼」與「什麼時候用」\n- 不要編造使用者沒提到的品牌、數據\n' +
      '只輸出 JSON 物件（不要 Markdown、不要說明）：\n{"name":"英文小寫連字號 2～4 個字","title":"English Title Case","zh":"中文名稱","description":"…","overview":"1～2 句概述","inputs":["使用者需提供的資料"],"steps":["…"],"output":["輸出格式要點"],"rules":["注意事項與限制"],"example":"簡短的輸入→輸出範例","starters":["3～4 句對話開場白"]}\n\n' +
      '需求描述：\n"""\n' + (state.text.trim() || '（使用者只提供了圖片，請依圖片推測最可能需要的技能）') + '\n"""';
  }
  async function generateAi() {
    if (!state.text.trim() && !state.images.length) { toast('請先描述技能，或放一張參考圖片'); return; }
    if (!aiReady()) { needAi(); return; }
    if (looksLikeSkillMd(state.text)) { generateRule(); return; }
    var btn = $('btnAi'); btn.disabled = true; setStatus('genStatus', 'AI 設計技能中…' + visionWarn(state.images.length));
    try {
      var j = parseJsonObj(await callLLM(aiSkillPrompt(), state.images, true, 'genStatus'));
      var sk = { name: slug(j.name), title: j.title || '', zh: j.zh || j.title || '', desc: j.description || '', overview: j.overview || '',
        inputs: arr(j.inputs), steps: arr(j.steps), output: arr(j.output), rules: arr(j.rules), example: String(j.example || ''), starters: arr(j.starters) };
      if (!sk.steps.length) throw new Error('AI 沒有回傳步驟');
      setSkill(sk, 'AI（' + aiModel() + '）');
      setStatus('genStatus', '✓ AI 產生完成（' + aiModel() + '）' + visionWarn(state.images.length) + '，可在 ④ 微調內容。', 'ok');
    } catch (err) {
      generateRule(true);
      setStatus('genStatus', '⚠ AI 失敗，已改用規則式：' + err.message, 'bad');
    } finally { btn.disabled = false; }
  }

  /* ================= 逆向工程 ================= */
  function revKind() { return state.rev.image ? 'image' : ($('revText').value.trim() ? 'text' : ''); }
  function detailRule(kind) {
    var d = $('revDetail').value;
    if (kind === 'image') return d === 'short' ? '提示詞精簡：中文約 40 字、英文約 40 words' : d === 'rich' ? '提示詞非常詳細：中文 200～300 字、英文 150～220 words，涵蓋材質、鏡頭、光線、細節' : '提示詞詳細度適中：中文 100～160 字、英文 70～120 words';
    return d === 'short' ? '提示詞精簡，100 字以內' : d === 'rich' ? '提示詞非常詳細，含結構、段落、語氣與範例句型' : '提示詞詳細度適中';
  }
  function revAiPrompt(kind) {
    var extra = $('revExtra').value.trim();
    if (kind === 'image') return '你是專業的 AI 生圖提示詞逆向工程師。請仔細分析這張圖片，反推出能用 AI 生圖工具（Midjourney、DALL·E、Gemini、Stable Diffusion）重現它的提示詞。\n' +
      '- ' + detailRule('image') + '\n- 圖中若有文字，原樣寫進提示詞並用引號標出\n- 圖中若有真實人物，只描述外觀、服裝與姿勢，不要指認身分或姓名\n- 不要提到任何在世藝術家的名字，改用畫風描述\n' +
      (extra ? '- 使用者的修改要求（要反映在提示詞中）：' + extra + '\n' : '') +
      'elements 的值用繁體中文。只輸出 JSON 物件（不要 Markdown）：\n{"summary":"一句話描述這張圖","elements":{"subject":"主體與動作","style":"畫風／媒材","composition":"構圖與鏡頭角度","lighting":"光線","color":"色彩與色調","background":"背景與場景","mood":"氛圍","details":"細節、材質、圖中文字"},"prompt_zh":"繁體中文完整提示詞","prompt_en":"English full prompt","tags_en":"comma separated Stable Diffusion tags, most important first","negative_en":"negative prompt, comma separated"}';
    return '你是提示詞逆向工程師。分析下面這段文字的寫作角色、任務、讀者、語氣、結構、長度與格式，反推出「能讓 AI 寫出同樣風格與結構內容」的提示詞。\n' +
      '- 主題相關的具體內容改成【變數】（例如【產品名稱】【目標客群】），讓提示詞可以重複使用\n- ' + detailRule('text') + '\n' + (extra ? '- 使用者的修改要求：' + extra + '\n' : '') +
      'elements 的值用繁體中文。只輸出 JSON 物件（不要 Markdown）：\n{"summary":"一句話描述這段文字","elements":{"role":"作者角色","task":"任務","audience":"目標讀者","tone":"語氣風格","structure":"段落結構","length":"長度","format":"格式特徵（表情符號、條列、Hashtag…）","keywords":"必備元素"},"prompt_zh":"繁體中文提示詞","prompt_en":"English prompt"}\n\n文字：\n"""\n' + $('revText').value.trim() + '\n"""';
  }
  function revMetaPrompt(kind) {
    var extra = $('revExtra').value.trim();
    if (kind === 'image') return '請你擔任 AI 生圖提示詞逆向工程師，仔細分析我附上的圖片，反推出能重現它的提示詞。\n\n' +
      '一、先用條列分析：主體與動作、畫風／媒材、構圖與鏡頭角度、光線、色彩與色調、背景與場景、氛圍、細節與圖中文字。\n' +
      '二、再分別輸出：\n1. 繁體中文完整提示詞（給 Gemini／ChatGPT 生圖）\n2. 英文完整提示詞（給 Midjourney／DALL·E），結尾加上 --ar 原圖比例\n3. Stable Diffusion 英文標籤（逗號分隔）與 Negative prompt\n\n' +
      '要求：' + detailRule('image') + '；圖中文字原樣保留並加引號；若有真實人物只描述外觀，不要指認身分。' + (extra ? '\n另外：' + extra : '') + '\n\n（請記得在送出前附上圖片）';
    return '請你擔任提示詞逆向工程師。分析下面這段文字的作者角色、任務、目標讀者、語氣風格、段落結構、長度與格式特徵，然後反推出一段能讓 AI 寫出同樣風格與結構內容的提示詞；主題相關的內容請改成【變數】方便重複使用。' + (extra ? '\n另外：' + extra : '') + '\n\n文字：\n"""\n' + $('revText').value.trim() + '\n"""';
  }
  // AI 有時會自己附上 --ar 等 Midjourney 參數，統一拿掉再依原圖補
  function stripParams(t) { return String(t || '').replace(/\s*--[a-z]+(\s+[^-\s][^-]*)?/gi, '').trim(); }
  function revBuild(fmt) {
    var r = state.rev.result; if (!r) return '';
    var el = r.elements || {};
    if (r.kind === 'image') {
      var dims = state.rev.image || state.rev.dims, ratio = dims ? nearRatio(dims.w, dims.h) : '1:1';
      if (fmt === 'gemini') return r.prompt_zh + (r.prompt_zh.indexOf('比例') < 0 ? '\n\n圖片比例 ' + ratio + '，高畫質，不要浮水印。' : '');
      if (fmt === 'mj') {
        var niji = /動漫|日系|anime|漫畫|二次元/i.test((el.style || '') + r.prompt_en);
        var no = (r.negative_en || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6).join(', ');
        return '/imagine prompt: ' + stripParams(r.prompt_en) +' --ar ' + ratio + (niji ? ' --niji 6' : ' --v 7') + (no ? ' --no ' + no : '');
      }
      if (fmt === 'sd') {
        var w = dims ? dims.w : 1024, h = dims ? dims.h : 1024, s = 1024 / Math.max(w, h);
        return 'Prompt:\n' + (r.tags_en || r.prompt_en) + '\n\nNegative prompt:\n' + (r.negative_en || 'lowres, blurry, bad anatomy, watermark, text artifacts') + '\n\n建議尺寸：' + Math.round(w * s / 64) * 64 + ' × ' + Math.round(h * s / 64) * 64;
      }
      return '【中文提示詞】\n' + r.prompt_zh + '\n\n【English Prompt】\n' + stripParams(r.prompt_en) +(r.negative_en ? '\n\n【負面提示 Negative】\n' + r.negative_en : '') + '\n\n【比例】' + ratio;
    }
    if (fmt === 'en') return r.prompt_en || r.prompt_zh;
    if (fmt === 'struct') {
      var L = EL_LABELS.text, out = [];
      L.forEach(function (x) { if (el[x[0]]) out.push('# ' + x[1] + '\n' + el[x[0]]); });
      return out.join('\n\n') + '\n\n請依以上設定，針對【主題】撰寫一篇內容。';
    }
    return r.prompt_zh;
  }
  function revFmtList() { return REV_FMTS[state.rev.result ? state.rev.result.kind : (revKind() || 'image')]; }
  function renderRev() {
    var rv = state.rev, kind = rv.result ? rv.result.kind : (revKind() || 'image'), fmts = REV_FMTS[kind];
    var cur = rv.fmt[kind]; if (!fmts.some(function (f) { return f.id === cur; })) cur = rv.fmt[kind] = fmts[0].id;
    $('revTabs').hidden = !!rv.meta;
    $('revTabs').innerHTML = fmts.map(function (f) { return '<button type="button" role="tab" class="tab' + (f.id === cur ? ' on' : '') + '" aria-selected="' + (f.id === cur) + '" data-rf="' + f.id + '">' + esc(f.label) + '</button>'; }).join('');
    var txt, key = kind + ':' + cur;
    if (rv.meta) { txt = rv.edits.meta != null ? rv.edits.meta : rv.meta; key = 'meta'; $('revTip').innerHTML = '這是<b>反推指令</b>：複製後貼到 ChatGPT、Gemini、Claude 等聊天 AI，' + (kind === 'image' ? '<b>並附上同一張圖片</b>，' : '') + '它就會幫你反推提示詞。'; }
    else { txt = rv.edits[key] != null ? rv.edits[key] : revBuild(cur); $('revTip').innerHTML = byId(fmts, cur).tip; }
    $('revOut').value = txt || '';
    var ed = rv.edits[key] != null;
    $('revEdited').hidden = !ed; $('btnRevReset').hidden = !ed;
    $('revBadge').textContent = rv.meta ? '反推指令（免金鑰）' : rv.result ? (rv.result.model === '範例' ? '範例（預先解析）' : 'AI（' + rv.result.model + '）') : '尚未產生';
    $('revLen').textContent = txt ? txt.length + ' 字' : '';
    // 解析細項
    $('revElCard').hidden = !rv.result || !!rv.meta;
    if (rv.result && !rv.meta) {
      $('revSummary').textContent = rv.result.summary ? '📝 ' + rv.result.summary : '';
      var el = rv.result.elements || {};
      $('revElements').innerHTML = EL_LABELS[rv.result.kind].map(function (x) { return '<label class="fld"><span>' + x[1] + '</span><textarea data-el="' + x[0] + '" rows="2">' + esc(el[x[0]] || '') + '</textarea></label>'; }).join('');
    }
  }
  function revKey() { var rv = state.rev; if (rv.meta) return 'meta'; var k = rv.result ? rv.result.kind : (revKind() || 'image'); return k + ':' + rv.fmt[k]; }

  async function reverseAi() {
    var kind = revKind();
    if (!kind) { toast('請先貼上或上傳一張圖片，或貼上一段文字'); return; }
    if (!aiReady()) { needAi(); return; }
    if (kind === 'image' && (PROVIDERS[prefs.aiProvider] || {}).vision === false) { toast(PROVIDERS[prefs.aiProvider].label + ' 不能看圖，請在 ⚙ 改用 Gemini、OpenAI、Claude 等'); openSettings(); return; }
    var btn = $('btnRevAi'); btn.disabled = true; setStatus('revStatus', 'AI 分析' + (kind === 'image' ? '圖片' : '文字') + '中…');
    try {
      var j = parseJsonObj(await callLLM(revAiPrompt(kind), kind === 'image' ? [state.rev.image] : [], true, 'revStatus'));
      if (!j.prompt_zh && !j.prompt_en) throw new Error('AI 沒有回傳提示詞');
      state.rev.result = { kind: kind, model: aiModel(), summary: j.summary || '', elements: j.elements || {}, prompt_zh: j.prompt_zh || j.prompt_en, prompt_en: j.prompt_en || j.prompt_zh, tags_en: j.tags_en || '', negative_en: j.negative_en || '' };
      state.rev.meta = ''; state.rev.edits = {}; state.rev.dims = kind === 'image' ? { w: state.rev.image.w, h: state.rev.image.h } : null;
      renderRev();
      setStatus('revStatus', '✓ 反推完成（' + aiModel() + '）。可直接修改右側提示詞，或改「解析細項」後按「🔁 依細項重組」。', 'ok');
    } catch (err) {
      setStatus('revStatus', '⚠ AI 反推失敗：' + err.message + '。可改按「📝 產生反推指令」貼到聊天 AI 使用。', 'bad');
    } finally { btn.disabled = false; }
  }
  function loadRevExample(i) {
    var ex = D.REV_EXAMPLES[i], rv = state.rev;
    function done() {
      rv.result = JSON.parse(JSON.stringify(ex.result)); rv.result.kind = ex.image ? 'image' : 'text'; rv.result.model = '範例';
      rv.meta = ''; rv.edits = {}; rv.dims = ex.image ? { w: ex.w, h: ex.h } : null;
      renderThumbs(); renderRev();
      setStatus('revStatus', '✓ 已載入範例「' + ex.label.replace(/^\S+\s/, '') + '」與預先解析的結果；填好 AI 金鑰後按「🤖 AI 反推提示詞」可重新分析。', 'ok');
    }
    $('revText').value = ex.text || ''; rv.image = null;
    if (!ex.image) { done(); return; }
    fetch(ex.image).then(function (r) { return r.blob(); })
      .then(function (b) { return loadImage(new File([b], ex.image.split('/').pop(), { type: 'image/svg+xml' })); })
      .then(function (im) { im.w = ex.w; im.h = ex.h; rv.image = im; done(); })
      .catch(function (e) { toast('範例載入失敗：' + e.message); });
  }
  function reverseMeta() {
    var kind = revKind();
    if (!kind) { toast('請先貼上或上傳一張圖片，或貼上一段文字'); return; }
    state.rev.meta = revMetaPrompt(kind); state.rev.result = null; state.rev.edits = {};
    renderRev();
    setStatus('revStatus', '✓ 已產生反推指令：複製後貼到 ChatGPT／Gemini' + (kind === 'image' ? '，並附上同一張圖片' : '') + '。', 'ok');
  }
  async function revRebuild() {
    var r = state.rev.result; if (!r) return;
    $('revElements').querySelectorAll('[data-el]').forEach(function (t) { r.elements[t.dataset.el] = t.value.trim(); });
    var el = r.elements, keys = EL_LABELS[r.kind].map(function (x) { return x[0]; });
    if (!aiReady()) {
      r.prompt_zh = keys.map(function (k) { return el[k]; }).filter(Boolean).join('，') + '。';
      state.rev.edits = {}; renderRev(); toast('已用細項重組中文提示詞（英文版需 AI 金鑰才能重組）'); return;
    }
    var btn = $('btnRevRebuild'); btn.disabled = true; setStatus('revStatus', 'AI 依細項重組中…');
    try {
      var p = '依下列細項，重新寫出' + (r.kind === 'image' ? '生圖' : '寫作') + '提示詞。' + detailRule(r.kind) + '。只輸出 JSON：{"prompt_zh":"繁體中文提示詞","prompt_en":"English prompt"' + (r.kind === 'image' ? ',"tags_en":"SD tags","negative_en":"negative prompt"' : '') + '}\n\n' +
        EL_LABELS[r.kind].map(function (x) { return x[1] + '：' + (el[x[0]] || '（無）'); }).join('\n');
      var j = parseJsonObj(await callLLM(p, [], true, 'revStatus'));
      ['prompt_zh', 'prompt_en', 'tags_en', 'negative_en'].forEach(function (k) { if (j[k]) r[k] = j[k]; });
      state.rev.edits = {}; renderRev(); setStatus('revStatus', '✓ 已依細項重組提示詞。', 'ok');
    } catch (err) { setStatus('revStatus', '⚠ 重組失敗：' + err.message, 'bad'); }
    finally { btn.disabled = false; }
  }

  /* ================= 複製／下載／ZIP ================= */
  function copyText(t) {
    if (!t) { toast('沒有內容可以複製'); return Promise.resolve(false); }
    var fallback = function () { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok; };
    var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t).then(function () { return true; }, fallback) : Promise.resolve(fallback());
    return p.then(function (ok) { toast(ok ? '✓ 已複製，貼到 AI 平台即可使用' : '複製失敗，請手動選取文字'); return ok; });
  }
  function download(name, data, type) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // 不壓縮（store）的最小 ZIP，檔名用 UTF-8
  function makeZip(files) {
    var enc = new TextEncoder(), local = [], central = [], offset = 0;
    var d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      local.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (s, x) { return s + x.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(local.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }
  function skillMd() {
    // ZIP／SKILL.md 一律用 SKILL.md 格式（有手動修改就用修改版）
    return state.edits.claude != null ? state.edits.claude : buildClaude(state.skill);
  }

  /* ================= 歷史／專案 ================= */
  function pushHistory(kind) {
    var h = lsGet(LS.history, []), item;
    if (kind === 'rev') {
      var rv = state.rev; if (!rv.result && !rv.meta) return;
      item = { time: Date.now(), kind: 'rev', title: '🔍 ' + (rv.result ? (rv.result.summary || '反推提示詞') : '反推指令').slice(0, 40), data: { result: rv.result, meta: rv.meta, text: $('revText').value, edits: rv.edits, fmt: rv.fmt, ratio: rv.dims || null } };
    } else {
      if (!state.skill) return;
      item = { time: Date.now(), kind: 'skill', title: '🧩 ' + (state.skill.zh || state.skill.name), data: projectData() };
    }
    h = h.filter(function (x) { return x.title !== item.title || x.kind !== item.kind; });
    h.unshift(item); lsSet(LS.history, h.slice(0, 20));
  }
  function projectData() { return { app: 'skill-prompt-studio', version: 1, text: state.text, skill: state.skill, source: state.source, settings: state.settings, platform: state.platform, edits: state.edits }; }
  function loadProject(d) {
    state.text = d.text || ''; $('srcText').value = state.text;
    state.settings = Object.assign({}, state.settings, d.settings || {}); renderOpts();
    if (d.platform) state.platform = d.platform; renderTabs();
    state.skill = d.skill || null; state.source = d.source || ''; state.edits = d.edits || {};
    renderFields(); renderOutput(); saveDraft();
  }
  function renderHistory() {
    var h = lsGet(LS.history, []);
    $('historyList').innerHTML = h.length ? h.map(function (x, i) {
      return '<li><button type="button" class="hist-item" data-hi="' + i + '"><b>' + esc(x.title) + '</b><small>' + new Date(x.time).toLocaleString('zh-TW') + '</small></button><button type="button" class="mini" data-hdel="' + i + '" aria-label="刪除這筆">✕</button></li>';
    }).join('') : '<li class="empty">還沒有紀錄。複製或下載時會自動存一筆。</li>';
  }
  function loadHistory(x) {
    if (x.kind === 'rev') {
      switchMain('reverse');
      var d = x.data; state.rev.result = d.result; state.rev.meta = d.meta || ''; state.rev.edits = d.edits || {}; state.rev.fmt = d.fmt || state.rev.fmt;
      state.rev.image = null; state.rev.dims = d.ratio; $('revText').value = d.text || '';
      renderThumbs(); renderRev();
    } else { switchMain('skill'); loadProject(x.data); }
    closeModal('historyModal'); toast('已載入紀錄');
  }

  /* ================= 設定／彈窗 ================= */
  function applyTheme() { var r = document.documentElement; if (prefs.theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', prefs.theme); }
  function renderProviderModels() {
    var key = $('setAiProvider').value, pv = PROVIDERS[key] || PROVIDERS.gemini, cur = prefs.aiProvider === key ? prefs.aiModel : '';
    $('setAiModel').innerHTML = pv.models.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === cur ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') || '<option value="">（請在下方填模型名稱）</option>';
    $('aiBaseWrap').hidden = key !== 'custom';
    $('visionNote').textContent = pv.vision ? '✓ 這個服務商支援看圖（逆向工程、AI 產生技能可上傳圖片）。自訂端點請選擇有視覺能力的模型（例如 llava、qwen2.5-vl）。' : '⚠ 這個服務商只支援文字：技能產生仍可用，但圖片不會送出，逆向工程圖片請改用其他服務商。';
  }
  function openSettings() {
    fillSelect($('setPlatform'), PLATFORMS, prefs.platform, function (p) { return p.label; });
    fillSelect($('setDetail'), D.DETAILS, prefs.detail);
    fillSelect($('setLang'), D.LANGS, prefs.lang);
    fillSelect($('setRevFmt'), REV_FMTS.image, prefs.revFmt, function (p) { return p.label; });
    $('setPrefix').value = prefs.prefix; $('setHead').value = prefs.head; $('setTheme').value = prefs.theme;
    $('setAiProvider').innerHTML = Object.keys(PROVIDERS).map(function (k) { return '<option value="' + k + '"' + (k === prefs.aiProvider ? ' selected' : '') + '>' + PROVIDERS[k].label + '</option>'; }).join('');
    renderProviderModels();
    $('setAiKey').value = prefs.aiKey || ''; $('setAiModelCustom').value = prefs.aiModelCustom || ''; $('setAiBase').value = prefs.aiBase || ''; $('aiTestStatus').textContent = '';
    openModal('settings');
  }
  function saveSettings() {
    prefs.platform = $('setPlatform').value; prefs.detail = $('setDetail').value; prefs.lang = $('setLang').value; prefs.revFmt = $('setRevFmt').value;
    prefs.prefix = $('setPrefix').value; prefs.head = $('setHead').value; prefs.theme = $('setTheme').value;
    prefs.aiProvider = $('setAiProvider').value; prefs.aiModel = $('setAiModel').value; prefs.aiKey = $('setAiKey').value.trim();
    prefs.aiModelCustom = $('setAiModelCustom').value.trim(); prefs.aiBase = $('setAiBase').value.trim();
    lsSet(LS.prefs, prefs); applyTheme();
  }
  var lastFocus = null;
  function openModal(id) { lastFocus = document.activeElement; var m = $(id); m.classList.add('show'); var f = m.querySelector('button, select, input'); if (f) f.focus(); }
  function closeModal(id) { $(id).classList.remove('show'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openAbout(focusCreator) { openModal('about'); if (focusCreator) $('creatorBox').scrollIntoView({ block: 'center' }); }
  function closeAbout() { lsSet(LS.warn, 1); closeModal('about'); }

  function switchMain(id) {
    state.main = id;
    document.querySelectorAll('.mtab').forEach(function (b) { var on = b.dataset.main === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('paneSkill').hidden = id !== 'skill'; $('paneReverse').hidden = id !== 'reverse';
  }

  /* ================= 事件 ================= */
  function init() {
    applyTheme();
    $('exampleChips').innerHTML = D.EXAMPLES.map(function (x, i) { return '<button type="button" class="chip" data-ex="' + i + '">' + esc(x.label) + '</button>'; }).join('');
    var dr = lsGet(LS.draft, null);
    if (dr) { state.text = dr.text || ''; state.skill = dr.skill || null; state.source = dr.source || ''; state.settings = Object.assign(state.settings, dr.settings || {}); state.platform = dr.platform || state.platform; state.edits = dr.edits || {}; }
    $('srcText').value = state.text;
    renderOpts(); renderTabs(); renderFields(); renderOutput(); renderThumbs(); renderRev();

    document.querySelectorAll('.mtab').forEach(function (b) { b.addEventListener('click', function () { switchMain(b.dataset.main); }); });
    $('exampleChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-ex]'); if (!c) return;
      state.text = D.EXAMPLES[+c.dataset.ex].text; $('srcText').value = state.text; generateRule();
    });
    $('srcText').addEventListener('input', function () { state.text = $('srcText').value; saveDraft(); });
    $('btnRule').addEventListener('click', function () { generateRule(); });
    $('btnAi').addEventListener('click', generateAi);
    $('btnClear').addEventListener('click', function () { state.text = ''; $('srcText').value = ''; state.images = []; renderThumbs(); setSkill(null, ''); });
    bindDrop('skillDrop', 'skillFile', 'skill');
    bindDrop('revDrop', 'revFile', 'reverse');
    $('skillThumbs').addEventListener('click', function (e) { var b = e.target.closest('[data-rmimg]'); if (b) { state.images.splice(+b.dataset.rmimg, 1); renderThumbs(); } });
    $('revThumbs').addEventListener('click', function (e) { if (e.target.closest('[data-rmrev]')) { state.rev.image = null; renderThumbs(); } });
    document.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (!items.length || !Array.prototype.some.call(items, function (f) { return /^image\//.test(f.type); })) return;
      if (document.querySelector('.modal.show')) return;
      e.preventDefault(); addFiles(items, state.main);
    });

    ['optDetail', 'optLang', 'optTone', 'optPrefix', 'optHead'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var k = { optDetail: 'detail', optLang: 'lang', optTone: 'tone', optPrefix: 'prefix', optHead: 'head' }[id];
        state.settings[k] = $(id).value; state.edits = {}; renderOutput(); saveDraft();
      });
    });
    FIELD_MAP.concat(LIST_MAP).forEach(function (f) {
      $(f[0]).addEventListener('input', function () { readFields(); if (!state.source) state.source = '手動'; state.edits = {}; renderOutput(); saveDraft(); });
    });
    $('platformTabs').addEventListener('click', function (e) { var t = e.target.closest('[data-pf]'); if (!t) return; state.platform = t.dataset.pf; renderTabs(); renderOutput(); saveDraft(); });
    $('skillOut').addEventListener('input', function () { if (!state.skill) return; state.edits[state.platform] = $('skillOut').value; $('skillEdited').hidden = false; $('btnResetOut').hidden = false; $('outLen').textContent = $('skillOut').value.length + ' 字'; saveDraft(); });
    $('btnResetOut').addEventListener('click', function () { delete state.edits[state.platform]; renderOutput(); saveDraft(); });
    $('btnCopy').addEventListener('click', function () { copyText($('skillOut').value).then(function (ok) { if (ok) pushHistory('skill'); }); });
    $('btnDownMd').addEventListener('click', function () { if (!state.skill) return; download('SKILL.md', skillMd(), 'text/markdown;charset=utf-8'); pushHistory('skill'); });
    $('btnDownZip').addEventListener('click', function () {
      if (!state.skill) return;
      var n = slug(state.skill.name);
      download(n + '.zip', makeZip([{ name: n + '/SKILL.md', data: skillMd() }])); pushHistory('skill');
      toast('已下載 ' + n + '.zip，到 Claude 設定 → 技能上傳');
    });
    $('btnSaveJson').addEventListener('click', function () { if (!state.skill) { toast('請先產生技能'); return; } download(slug(state.skill.name) + '.skill.json', JSON.stringify(projectData(), null, 2), 'application/json'); pushHistory('skill'); });
    $('btnOpenJson').addEventListener('click', function () { $('fileJson').click(); });
    $('fileJson').addEventListener('change', function () {
      var f = $('fileJson').files[0]; if (!f) return;
      f.text().then(function (t) { var d = JSON.parse(t); if (d.app !== 'skill-prompt-studio') throw new Error('不是本工具的專案檔'); loadProject(d); toast('已開啟專案'); }).catch(function (e) { toast('開啟失敗：' + e.message); });
      $('fileJson').value = '';
    });
    $('btnHistory').addEventListener('click', function () { renderHistory(); openModal('historyModal'); });
    $('historyList').addEventListener('click', function (e) {
      var h = lsGet(LS.history, []), a = e.target.closest('[data-hi]'), d = e.target.closest('[data-hdel]');
      if (a) loadHistory(h[+a.dataset.hi]);
      if (d) { h.splice(+d.dataset.hdel, 1); lsSet(LS.history, h); renderHistory(); }
    });

    // 逆向工程
    $('revExampleChips').innerHTML = D.REV_EXAMPLES.map(function (x, i) { return '<button type="button" class="chip" data-rex="' + i + '">' + esc(x.label) + '</button>'; }).join('');
    $('revExampleChips').addEventListener('click', function (e) { var c = e.target.closest('[data-rex]'); if (c) loadRevExample(+c.dataset.rex); });
    $('btnRevAi').addEventListener('click', reverseAi);
    $('btnRevMeta').addEventListener('click', reverseMeta);
    $('btnRevClear').addEventListener('click', function () { state.rev.image = null; state.rev.result = null; state.rev.meta = ''; state.rev.edits = {}; $('revText').value = ''; $('revExtra').value = ''; renderThumbs(); renderRev(); });
    $('revText').addEventListener('input', function () { if (!state.rev.result && !state.rev.meta) renderRev(); });
    $('revTabs').addEventListener('click', function (e) { var t = e.target.closest('[data-rf]'); if (!t) return; var k = state.rev.result ? state.rev.result.kind : (revKind() || 'image'); state.rev.fmt[k] = t.dataset.rf; renderRev(); });
    $('revOut').addEventListener('input', function () { if (!state.rev.result && !state.rev.meta) return; state.rev.edits[revKey()] = $('revOut').value; $('revEdited').hidden = false; $('btnRevReset').hidden = false; $('revLen').textContent = $('revOut').value.length + ' 字'; });
    $('btnRevReset').addEventListener('click', function () { delete state.rev.edits[revKey()]; renderRev(); });
    $('btnRevCopy').addEventListener('click', function () { copyText($('revOut').value).then(function (ok) { if (ok) pushHistory('rev'); }); });
    $('btnRevDown').addEventListener('click', function () { if (!$('revOut').value) { toast('沒有內容'); return; } download('reverse-prompt.txt', $('revOut').value); pushHistory('rev'); });
    $('btnRevRebuild').addEventListener('click', revRebuild);
    $('btnRevToSkill').addEventListener('click', function () {
      var t = $('revOut').value.trim(); if (!t) { toast('請先產生提示詞'); return; }
      var img = state.rev.result ? state.rev.result.kind === 'image' : !!state.rev.image;
      state.text = (img ? '建立一個技能：使用者給主題時，產生跟下面這段生圖提示詞同樣畫風、構圖與細節程度的提示詞。\n參考提示詞：\n' : '建立一個技能：使用者給主題時，寫出跟下面這段提示詞同樣風格與結構的內容。\n參考提示詞：\n') + t;
      $('srcText').value = state.text; switchMain('skill'); saveDraft();
      setStatus('genStatus', '已帶入逆向工程的提示詞，建議按「🤖 AI 產生」做成完整技能。'); $('srcText').focus();
    });

    // 設定與彈窗
    $('settingsBtn').addEventListener('click', openSettings);
    $('setAiProvider').addEventListener('change', renderProviderModels);
    $('settingsSave').addEventListener('click', function () { saveSettings(); closeModal('settings'); toast('已儲存常用設定'); });
    $('settingsApply').addEventListener('click', function () {
      saveSettings();
      state.settings.detail = prefs.detail; state.settings.lang = prefs.lang; state.settings.prefix = prefs.prefix; state.settings.head = prefs.head;
      state.platform = prefs.platform; state.rev.fmt.image = prefs.revFmt; state.edits = {};
      renderOpts(); renderTabs(); renderOutput(); renderRev(); saveDraft(); closeModal('settings'); toast('已儲存並套用');
    });
    $('settingsReset').addEventListener('click', function () { var k = prefs.aiKey; prefs = Object.assign({}, DEF_PREFS, { aiKey: k }); lsSet(LS.prefs, prefs); openSettings(); toast('已恢復預設（金鑰保留）'); });
    $('clearKey').addEventListener('click', function () { prefs.aiKey = ''; $('setAiKey').value = ''; lsSet(LS.prefs, prefs); toast('已清除金鑰'); });
    $('testAi').addEventListener('click', async function () {
      saveSettings();
      if (!aiReady()) { $('aiTestStatus').textContent = '請先填金鑰（自訂端點需填網址與模型）'; return; }
      $('aiTestStatus').textContent = '連線中…';
      try { var t = await callLLM('請只回覆「OK」兩個字母。', [], false); $('aiTestStatus').textContent = '✓ 連線成功（' + aiModel() + '）：' + String(t).trim().slice(0, 30); }
      catch (err) { $('aiTestStatus').textContent = '⚠ ' + err.message + (/Failed to fetch|NetworkError/i.test(err.message) ? '（可能是網址錯誤，或該服務不允許瀏覽器直接呼叫 CORS）' : ''); }
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-open-about]');
      if (a) { if (a.closest('#settings')) closeModal('settings'); openAbout(a.dataset.openAbout === 'creator'); }
      var ins = e.target.closest('[data-install]'); if (ins) $('installBtn').click();
      var x = e.target.closest('[data-close]'); if (x) closeModal(x.dataset.close);
    });
    $('aboutBtn').addEventListener('click', function () { openAbout(false); });
    $('aboutClose').addEventListener('click', closeAbout);
    $('aboutOk').addEventListener('click', closeAbout);
    document.querySelectorAll('.modal').forEach(function (m) { m.addEventListener('click', function (e) { if (e.target === m) { if (m.id === 'about') closeAbout(); else closeModal(m.id); } }); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var m = document.querySelector('.modal.show'); if (!m) return;
      if (m.id === 'about') closeAbout(); else closeModal(m.id);
    });
    if (!lsGet(LS.warn, 0)) setTimeout(function () { openAbout(false); }, 400);
  }

  window.__skillPrompt = { state: state, ruleSkill: ruleSkill, generateRule: generateRule, buildPrompt: buildPrompt, parseSkillMd: parseSkillMd, makeZip: makeZip, revBuild: revBuild, renderRev: renderRev, nearRatio: nearRatio, switchMain: switchMain, loadRevExample: loadRevExample, revMetaPrompt: revMetaPrompt, aiSkillPrompt: aiSkillPrompt, revAiPrompt: revAiPrompt };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
