// AI 技能提示詞工坊：規則式引擎用的技能類型、平台語氣、範例
window.SPS = (function () {
  'use strict';

  // 社群／影音平台語氣（偵測到平台名稱時插入步驟的子項）
  var PLATFORM_TONES = [
    { id: 'ig', label: 'IG / Threads', kw: ['ig', 'instagram', 'threads', '脆'], tone: '親切、活潑、多用表情符號與 Hashtags，段落短、適合手機閱讀。' },
    { id: 'fb', label: 'Facebook', kw: ['fb', 'facebook', '臉書', '粉專'], tone: '專業、結構清晰，適合詳細介紹並引導點擊連結或留言。' },
    { id: 'line', label: 'LINE 官方帳號', kw: ['line'], tone: '口語、簡短，開頭一句講重點，附明確的行動按鈕文字。' },
    { id: 'xhs', label: '小紅書', kw: ['小紅書'], tone: '第一人稱分享、清單式重點、標題帶數字與情緒詞。' },
    { id: 'linkedin', label: 'LinkedIn', kw: ['linkedin', '領英'], tone: '專業、有觀點，用經驗與數據支撐，避免過度推銷。' },
    { id: 'yt', label: 'YouTube', kw: ['youtube', 'yt'], tone: '標題吸睛、前 3 秒鉤子、說明欄附時間軸與關鍵字。' },
    { id: 'tiktok', label: 'TikTok / Reels / Shorts', kw: ['tiktok', '抖音', 'reels', 'shorts', '短影音'], tone: '節奏快、口語化，前 3 秒拋出衝突或好處。' }
  ];

  var IMAGE_STEP = '先仔細觀察使用者上傳的圖片：辨識主體、圖中文字、顏色、場景與重要細節；圖片不清楚時，請使用者補充說明。';
  var IMAGE_KW = ['圖片', '照片', '截圖', '拍照', '上傳圖', '看圖', '影像'];

  // {plat} 會被替換成偵測到的平台（沒有偵測到就用 fallback）
  var CATEGORIES = [
    { id: 'social-post', zh: '社群貼文產生器', en: 'Social Post Generator', slug: 'social-post',
      kw: ['貼文', '社群', 'hashtag', '小編', '粉專', 'po文', '發文', '行銷貼文'],
      plat: 'Facebook、IG、Threads',
      desc: '根據上傳的產品圖片或主題，自動生成符合指定社群平台（如 {plat}）風格的行銷貼文與 Hashtags。',
      overview: '這個技能協助使用者將產品圖片或核心賣點轉化為吸引人的社群行銷貼文。',
      inputs: ['產品圖片或產品／活動主題', '目標社群平台（可多選）', '品牌語氣或特別要強調的賣點（選填）'],
      steps: ['分析使用者上傳的圖片或產品主題，找出 1～3 個最打動人的賣點。', '根據使用者指定的社群平台風格調整語氣：{tones}', '結構應包含：吸睛標題、內文重點、行動呼籲（CTA）及標籤（Hashtags）。', '每個平台各產出一版；使用者沒指定平台時，先詢問要發在哪裡。'],
      output: ['依平台分段，每段標明平台名稱', '標題一行、內文 3～6 行、CTA 一行、Hashtags 5～10 個', '最後附 1 句「可替換的開頭」備案'],
      rules: ['不誇大療效或做出無法證實的承諾', '不使用未經授權的品牌名稱或他人照片描述', 'Hashtags 中英文混用時，中文在前'],
      starters: ['幫我把這張產品照寫成 IG 貼文', '這週新品上市，寫 FB 與 Threads 各一篇', '把這段活動資訊改成社群貼文'],
      example: '輸入：一張手沖咖啡豆包裝照片，平台 IG\n輸出：☕ 早晨的第一口，就該是花香！\n衣索比亞耶加雪菲，淺焙帶出茉莉與柑橘調……\n👉 限時 9 折，點主頁連結搶先試喝\n#手沖咖啡 #耶加雪菲 #咖啡日常 #coffeetime' },

    { id: 'product-copy', zh: '商品文案產生器', en: 'Product Copywriter', slug: 'product-copy',
      kw: ['文案', '商品', '產品介紹', '賣點', '電商', 'listing', '商品頁', '產品描述', '標題', '蝦皮', 'momo', 'amazon'],
      desc: '根據商品規格、照片與目標客群，產出電商商品頁可直接使用的標題、賣點條列與商品描述。',
      overview: '這個技能協助使用者把零散的商品資料整理成有說服力、易讀的電商文案。',
      inputs: ['商品名稱、規格與材質', '商品照片（選填）', '目標客群與銷售平台'],
      steps: ['整理商品的規格、功能與使用情境，列出事實清單。', '把功能轉成「顧客得到的好處」，挑出最重要的 5 個賣點。', '撰寫商品標題：品牌＋核心關鍵字＋主要規格＋最大賣點，控制在平台字數限制內。', '撰寫五點賣點（每點以粗體短句開頭）與 150～300 字商品描述。', '最後提供 5 個搜尋關鍵字建議。'],
      output: ['## 商品標題（2 個版本）', '## 五點賣點', '## 商品描述', '## 關鍵字建議'],
      rules: ['只使用使用者提供或圖片中可確認的規格，不自行編造數據', '避免「最好」「第一」等違反廣告法規的絕對用語', '資訊不足時列出缺少的欄位請使用者補充'],
      starters: ['幫我寫這個保溫瓶的商品頁文案', '把這段規格整理成五點賣點', '這張商品照幫我寫標題'],
      example: '輸入：不鏽鋼保溫瓶 500ml、真空雙層、保冷 24 小時\n輸出：## 商品標題\n品牌名 真空保溫瓶 500ml｜保冷 24 小時・316 不鏽鋼・一鍵彈蓋\n## 五點賣點\n- **整天都冰涼**：真空雙層，冰飲 24 小時不退冰……' },

    { id: 'email-reply', zh: 'Email 回覆助手', en: 'Email Reply Assistant', slug: 'email-reply',
      kw: ['email', 'e-mail', 'mail', '回信', '回覆信', '客訴', '客服', '信件', '寫信'],
      desc: '閱讀使用者貼上的來信（或信件截圖），判斷對方需求與情緒，產出得體、可直接寄出的回覆信草稿。',
      overview: '這個技能協助使用者快速回覆工作信件與客戶來信，兼顧禮貌、同理與明確的下一步。',
      inputs: ['來信內容或信件截圖', '想表達的立場或可提供的解決方案', '寄件人身分與公司名稱（選填）'],
      steps: ['閱讀來信，摘要對方的需求、問題與情緒（1～3 句）。', '判斷回信類型：回答問題、處理客訴、婉拒、確認事項或跟進。', '依「感謝／同理 → 回應重點 → 具體方案或下一步 → 結尾致意」的結構撰寫回信。', '提供「正式」與「親切」兩種語氣版本，讓使用者挑選。'],
      output: ['先列「來信重點摘要」', '再列「回信主旨」與兩個版本的回信內文', '最後列需要使用者確認或補充的資訊'],
      rules: ['不承諾使用者沒有提供的補償、退款或時程', '不在回信中洩漏內部資訊或其他客戶資料', '本技能只產生草稿，由使用者確認後自行寄出'],
      starters: ['幫我回這封客訴信', '這封合作邀約我想婉拒，幫我寫回信', '把這段重點寫成正式的確認信'],
      example: '輸入：客戶來信抱怨商品延遲 5 天未到\n輸出：主旨：關於您訂單延遲配送的說明與處理\n○○ 您好，非常抱歉讓您久等了……我們已聯繫物流加急，預計明天送達……' },

    { id: 'meeting-notes', zh: '會議紀錄整理', en: 'Meeting Notes Summarizer', slug: 'meeting-notes',
      kw: ['會議', '紀錄', '記錄', '逐字稿', '開會', '會議記錄', '待辦', '決議', '摘要'],
      desc: '把會議逐字稿、筆記或白板照片整理成結構化的會議紀錄，包含重點摘要、決議事項與待辦清單。',
      overview: '這個技能協助使用者把冗長、零散的會議內容快速整理成可以直接寄出的會議紀錄。',
      inputs: ['會議逐字稿、手寫筆記或白板照片', '會議名稱、日期、與會者（選填）'],
      steps: ['通讀內容，辨識會議主題、與會者與討論的議題。', '每個議題整理成 2～4 句重點摘要，保留關鍵數字與日期。', '分別列出「決議事項」與「待辦事項」，待辦要寫明負責人與期限。', '標出沒有結論、需要下次再討論的事項。'],
      output: ['會議資訊（名稱／日期／與會者）', '議題重點摘要（條列）', '決議事項', '待辦清單表格：事項｜負責人｜期限', '待追蹤事項'],
      rules: ['不自行補上逐字稿裡沒有的決議或負責人，找不到時標示「待確認」', '保留原始數字與專有名詞，不任意改寫', '敏感發言或私人資訊不寫入紀錄'],
      starters: ['幫我整理這份會議逐字稿', '這是白板照片，整理成會議紀錄', '只列出這次會議的待辦清單'],
      example: '輸出：## 決議事項\n1. 新品上市日訂為 11/15\n## 待辦清單\n| 事項 | 負責人 | 期限 |\n|---|---|---|\n| 完成包裝設計 | 小陳 | 10/31 |' },

    { id: 'translate-polish', zh: '翻譯潤稿助手', en: 'Translation & Proofreading', slug: 'translate-polish',
      kw: ['翻譯', '潤稿', '校稿', '改寫', '英文', '日文', '語法', '修稿', '潤飾', 'translate'],
      desc: '把使用者提供的文字翻譯成指定語言或潤飾成更通順專業的版本，並說明主要修改處。',
      overview: '這個技能協助使用者翻譯與潤飾文字，讓內容自然、道地且符合使用情境。',
      inputs: ['原文（文字或截圖）', '目標語言與使用情境（商務信、簡報、社群…）'],
      steps: ['判斷原文語言、文體與使用情境。', '依目標語言翻譯或潤飾，保持原意，調整成當地人自然的說法。', '專有名詞、品牌名、數字與單位維持正確，不確定的詞標註原文。', '列出 3～5 個主要修改處與原因，幫助使用者學習。'],
      output: ['## 修改後全文', '## 主要修改說明（條列：原句 → 新句｜原因）'],
      rules: ['不增加原文沒有的資訊', '使用台灣繁體中文用語（例如「影片」而非「視頻」）', '原文有錯字或語意不清時，先指出再提供建議'],
      starters: ['把這封信翻成商務英文', '幫我潤飾這段自我介紹', '這段日文說明翻成繁體中文'],
      example: '輸入：I want to know the price of your product.\n輸出：Could you please share the pricing details for your product?\n修改說明：want to know → Could you please share（更有禮貌的商務用語）' },

    { id: 'slide-outline', zh: '簡報大綱產生器', en: 'Presentation Outliner', slug: 'slide-outline',
      kw: ['簡報', '投影片', 'ppt', 'powerpoint', '大綱', 'slides', '報告'],
      desc: '根據主題、聽眾與時間長度，產出逐頁簡報大綱，包含每頁標題、重點與講者備註。',
      overview: '這個技能協助使用者在幾分鐘內規劃出結構完整、有說服力的簡報。',
      inputs: ['簡報主題與目的', '聽眾對象與報告時間', '既有資料或數據（選填）'],
      steps: ['確認簡報目的（說服、報告、教學）與聽眾關心的問題。', '用「開場鉤子 → 問題 → 解方 → 證據 → 行動呼籲」設計故事線。', '依時間估算頁數（約每頁 1～2 分鐘），逐頁寫出標題、3 個以內重點與建議視覺。', '每頁附 2～3 句講者備註。'],
      output: ['頁數總覽表：頁碼｜標題｜目的', '逐頁內容：標題、重點條列、建議圖表或圖片、講者備註'],
      rules: ['每頁重點不超過 3 點、每點不超過 20 字', '標題寫成結論句，不只是名詞', '使用者提供的數據要標明出處欄位'],
      starters: ['幫我規劃 15 分鐘的新品提案簡報', '把這份報告整理成 10 頁簡報大綱', '給主管看的月報簡報要怎麼排'],
      example: '輸出：第 1 頁｜三個月內把回購率提高 20%\n- 重點：現況回購率 12%、目標 32%\n- 視覺：前後對比長條圖\n- 備註：先用一個客戶故事開場……' },

    { id: 'lesson-plan', zh: '課程教案設計', en: 'Lesson Plan Designer', slug: 'lesson-plan',
      kw: ['課程', '教案', '教學', '講義', '學習單', '考題', '測驗', '上課', '學生', '老師', '培訓'],
      desc: '根據課程主題、對象與時數，設計包含學習目標、活動流程、教材與評量的完整教案。',
      overview: '這個技能協助講師與老師快速設計結構清楚、互動性高的課程教案。',
      inputs: ['課程主題', '學員對象與人數', '課程時數與上課形式（實體／線上）'],
      steps: ['寫出 3 個可衡量的學習目標（學完後學員能做到什麼）。', '把時數切成段落，安排講述、示範、練習、討論交錯進行，每段註明時間。', '設計 1～2 個互動活動或實作練習，說明步驟與所需教材。', '設計課後評量：5 題選擇題（附答案）與 1 題實作題。'],
      output: ['## 學習目標', '## 課程流程表：時間｜單元｜教學方式｜教材', '## 活動設計', '## 課後評量（含答案）'],
      rules: ['活動要符合學員程度，避免過多專有名詞', '每段講述不超過 20 分鐘', '評量題目要對應學習目標'],
      starters: ['幫我設計 3 小時的 ChatGPT 入門課教案', '給高中生的 50 分鐘理財課', '把這份講義改成課程流程表'],
      example: '輸出：| 時間 | 單元 | 教學方式 |\n|---|---|---|\n| 0:00-0:15 | 破冰：你用過哪些 AI？ | 小組討論 |' },

    { id: 'receipt-ocr', zh: '單據資料擷取', en: 'Document Data Extractor', slug: 'document-extractor',
      kw: ['發票', '收據', '名片', '單據', '表單', '擷取', 'ocr', '報帳', '帳單', '明細', '證件'],
      desc: '從上傳的發票、收據、名片或表單照片中擷取關鍵欄位，整理成表格或 JSON 方便貼到試算表。',
      overview: '這個技能協助使用者把紙本單據照片轉成結構化資料，省去手動打字。',
      inputs: ['單據照片或截圖（可多張）', '想要擷取的欄位（選填，預設依單據類型判斷）'],
      steps: ['判斷單據類型（發票、收據、名片、報名表等）。', '依類型擷取欄位，例如發票：日期、店家、統一編號、品項、數量、單價、總金額。', '看不清楚的欄位標示「無法辨識」，不要猜測。', '多張單據時每張一列，最後計算金額總和。'],
      output: ['Markdown 表格（每張單據一列）', '表格下方附 JSON 版本，方便程式匯入', '最後列出無法辨識或需人工確認的欄位'],
      rules: ['不猜測模糊的數字與文字', '金額保留原始幣別與小數位', '身分證字號、卡號等敏感資料只顯示末 4 碼'],
      starters: ['把這三張發票整理成報帳表', '擷取這張名片的聯絡資料', '這張報名表幫我轉成表格'],
      example: '輸出：| 日期 | 店家 | 品項 | 金額 |\n|---|---|---|---|\n| 2026/10/20 | 好咖啡 | 拿鐵×2 | 240 |' },

    { id: 'video-script', zh: '短影音腳本產生器', en: 'Short Video Scriptwriter', slug: 'video-script',
      kw: ['影片', '短影音', '腳本', 'reels', 'shorts', 'tiktok', '抖音', 'youtube', '分鏡', '口播'],
      plat: 'Reels、Shorts、TikTok',
      desc: '把主題、文章或產品資訊改寫成 30～90 秒的短影音腳本，含分鏡、口白與字幕。',
      overview: '這個技能協助使用者把想法快速變成可以直接拍攝的短影音腳本。',
      inputs: ['影片主題、文章或產品資訊', '影片長度與發布平台', '是否露臉、拍攝條件（選填）'],
      steps: ['用一句話定義影片要觀眾記住的重點。', '設計前 3 秒的鉤子（提問、反差或驚人數字）。', '依平台調整節奏：{tones}', '依秒數拆成分鏡表，每鏡寫出畫面、口白、字幕與音效。', '結尾加入行動呼籲（追蹤、留言、點連結）。'],
      output: ['影片標題 3 個', '分鏡表：秒數｜畫面｜口白｜字幕', '貼文說明文字與 Hashtags'],
      rules: ['口白要口語化，一句不超過 15 字', '不使用未授權音樂或他人影片片段的描述', '總長度符合使用者指定秒數'],
      starters: ['把這篇文章改成 60 秒 Reels 腳本', '新品開箱短影音怎麼拍', '寫一支不露臉的知識型 Shorts 腳本'],
      example: '輸出：| 秒數 | 畫面 | 口白 |\n|---|---|---|\n| 0-3 | 手拿咖啡杯特寫 | 你的咖啡可能一直泡錯了！ |' },

    { id: 'code-review', zh: '程式碼審查助手', en: 'Code Review Assistant', slug: 'code-review',
      kw: ['程式', 'code', 'bug', '除錯', 'debug', 'review', '函式', 'python', 'javascript', 'sql', '程式碼'],
      desc: '審查使用者貼上的程式碼或錯誤截圖，找出錯誤、資安風險與可改善處，並提供修正後的程式碼。',
      overview: '這個技能協助使用者快速找出程式問題，並用容易理解的方式說明如何修正。',
      inputs: ['程式碼片段或錯誤訊息截圖', '程式語言與執行環境（選填）', '預期行為與實際行為'],
      steps: ['先說明這段程式在做什麼（2～3 句）。', '依嚴重程度列出問題：錯誤 → 資安風險 → 效能 → 可讀性。', '每個問題說明發生原因、影響與修正方式。', '提供修正後的完整程式碼，並標註修改處。'],
      output: ['## 程式說明', '## 問題清單（依嚴重程度排序）', '## 修正後程式碼（程式碼區塊）', '## 測試建議'],
      rules: ['不確定的地方明確說「需要確認」，不要假裝確定', '不要求使用者提供密碼、金鑰等機密', '修正時保持原本的命名與風格'],
      starters: ['幫我看這段 Python 為什麼出錯', '檢查這段 SQL 有沒有資安問題', '這張錯誤截圖是什麼意思'],
      example: '輸出：## 問題清單\n1. 【錯誤】第 12 行 list 索引超出範圍：迴圈條件應為 i < len(items)……' },

    { id: 'data-analysis', zh: '資料分析解說員', en: 'Data Insight Analyst', slug: 'data-insight',
      kw: ['數據', '資料', '報表', 'excel', 'csv', '圖表', '分析', '銷售', '趨勢', '統計', '試算表'],
      desc: '分析使用者提供的表格資料或報表截圖，找出趨勢、異常與重點，並用白話說明與給出建議。',
      overview: '這個技能協助非數據背景的使用者看懂資料，快速得到可以行動的結論。',
      inputs: ['表格資料、CSV 內容或報表／圖表截圖', '想回答的問題或分析目的'],
      steps: ['確認資料欄位、期間與筆數，指出缺漏或異常值。', '計算關鍵指標（總計、平均、成長率、占比），列出前 3 名與後 3 名。', '找出 3 個最重要的發現，每個發現附上支持數字。', '依發現提出 3 個具體可執行的建議，並建議適合的圖表類型。'],
      output: ['## 資料概況', '## 三大發現（附數字）', '## 建議行動', '## 建議圖表'],
      rules: ['所有結論都要能回推到資料中的數字', '樣本太少或資料不完整時要提醒限制', '不編造資料中沒有的數字'],
      starters: ['幫我分析這份月銷售表', '這張報表截圖有什麼重點', '找出這份資料的異常值'],
      example: '輸出：## 三大發現\n1. 10 月營收較 9 月成長 18%，主要來自 A 商品（占成長的 64%）……' },

    { id: 'resume-career', zh: '履歷求職教練', en: 'Resume & Career Coach', slug: 'resume-coach',
      kw: ['履歷', '自傳', '面試', '求職', '應徵', 'cv', 'resume', '工作經歷'],
      desc: '根據使用者的經歷與目標職缺，健檢並改寫履歷、自傳，並產生面試可能問題與回答建議。',
      overview: '這個技能協助求職者把經歷寫成雇主看得懂、有成果的履歷內容。',
      inputs: ['目前的履歷或經歷條列（文字或截圖）', '目標職缺的職務說明'],
      steps: ['比對履歷與職缺需求，列出符合與缺少的能力。', '用「動詞＋做了什麼＋量化成果」改寫每段經歷。', '撰寫 150 字左右的個人摘要。', '列出 5 個面試可能被問的問題與回答方向。'],
      output: ['## 履歷健檢（符合／缺少）', '## 改寫後經歷', '## 個人摘要', '## 面試準備'],
      rules: ['不捏造使用者沒有的經歷或證照', '量化數字由使用者提供，缺少時以［數字］標示請使用者填寫', '提醒使用者移除身分證字號等不必要的個資'],
      starters: ['幫我健檢這份履歷', '針對這個職缺改寫我的經歷', '模擬這個職位的面試問題'],
      example: '改寫前：負責社群經營\n改寫後：經營品牌 IG，6 個月內追蹤數從 2,000 成長到［數字］，貼文平均互動率提升［數字］%' },

    { id: 'business-plan', zh: '企劃提案助手', en: 'Business Proposal Planner', slug: 'proposal-planner',
      kw: ['企劃', '提案', '計畫書', '營運', 'swot', '商業模式', '創業', '行銷企劃', '活動企劃', '策略'],
      desc: '根據使用者的想法與資源，產出結構完整的企劃提案，包含目標、分析、執行計畫、預算與成效指標。',
      overview: '這個技能協助使用者把一個點子整理成可以拿去提案或申請的企劃書架構。',
      inputs: ['企劃主題或點子', '目標、預算與時程（選填）', '目標客群與既有資源'],
      steps: ['用一句話寫出企劃要解決的問題與目標。', '做簡要的現況分析（SWOT 或目標客群分析）。', '列出執行策略與分階段時程表。', '估算預算項目，並訂出 3～5 個可衡量的成效指標（KPI）。', '列出主要風險與因應方式。'],
      output: ['## 企劃摘要', '## 現況分析', '## 執行計畫與時程', '## 預算概估', '## KPI', '## 風險與因應'],
      rules: ['預算與數據不足時標示假設條件', 'KPI 要可衡量、有期限', '不保證投資報酬或補助一定通過'],
      starters: ['幫我把這個活動點子寫成企劃', '做一份咖啡店開幕行銷企劃', '幫這個創業想法做 SWOT'],
      example: '輸出：## KPI\n- 活動期間新增會員 500 人\n- 兩週內社群觸及 30,000 次' },

    { id: 'image-analysis', zh: '圖片解讀助手', en: 'Image Insight Assistant', slug: 'image-insight',
      kw: ['看圖', '圖片說明', '描述圖片', '圖像', '辨識', '照片解說'],
      desc: '解讀使用者上傳的圖片，說明圖中內容、重點與可以怎麼運用，並依需求產出文字描述。',
      overview: '這個技能協助使用者快速看懂並善用圖片內容，例如寫替代文字、整理圖中資訊或給改善建議。',
      inputs: ['圖片（照片、截圖、海報、圖表等）', '想從圖片得到什麼（選填）'],
      steps: ['描述圖片整體：類型、主體、場景與氛圍。', '列出圖中的文字與重要細節。', '依使用者目的提供延伸內容：替代文字、說明文字、改善建議或資訊整理。'],
      output: ['## 圖片概述', '## 細節與文字', '## 延伸運用'],
      rules: ['不辨識或推測真實人物的身分', '看不清楚的部分如實說明', '不對圖中人物做外貌評價'],
      starters: ['這張圖在說什麼', '幫這張商品照寫替代文字', '這張海報有什麼可以改進的'],
      example: '輸出：## 圖片概述\n一張咖啡店吧台的照片，暖色燈光，桌上有三杯拿鐵……' },

    { id: 'generic', zh: '自訂 AI 助手', en: 'Custom AI Assistant', slug: 'custom-assistant',
      kw: [],
      desc: '依使用者的需求執行指定任務，先釐清目標與條件，再產出結構清楚、可直接使用的結果。',
      overview: '這個技能協助使用者用一致、可重複的方式完成指定任務。',
      inputs: ['任務內容與目標', '相關資料、文字或圖片', '輸出格式或長度要求（選填）'],
      steps: ['確認使用者的目標、對象與限制條件；資訊不足時先提出 1～3 個問題。', '依任務拆成步驟逐一完成，保留使用者提供的重要資訊。', '用清楚的標題與條列整理結果。', '最後提供 1～2 個可以進一步優化的建議。'],
      output: ['使用 Markdown 標題與條列', '重要結論放在最前面'],
      rules: ['不編造使用者沒有提供的事實或數據', '不確定時明確說明', '使用台灣繁體中文用語'],
      starters: ['開始吧', '我先給你資料', '請先問我需要的資訊'],
      example: '' }
  ];

  var EXAMPLES = [
    { label: '社群貼文', text: '根據上傳的產品圖片或主題，自動生成符合指定社群平台（如 Facebook、IG、Threads）風格的行銷貼文與 Hashtags。' },
    { label: '會議紀錄', text: '把會議逐字稿或白板照片整理成重點摘要、決議事項與待辦清單，待辦要有負責人和期限。' },
    { label: '客訴回信', text: '收到客訴 Email 後，產生有同理心、提出解決方案的回覆信，要有正式和親切兩種版本。' },
    { label: '商品文案', text: '輸入商品規格或商品照片，寫出蝦皮與 momo 商品頁的標題、五點賣點與商品描述。' },
    { label: '發票報帳', text: '上傳發票或收據照片，擷取日期、店家、品項、金額，整理成報帳表格並計算總額。' },
    { label: '短影音腳本', text: '把一篇文章改寫成 60 秒 Reels 與 Shorts 短影音腳本，含分鏡、口白與字幕。' },
    { label: '課程教案', text: '輸入課程主題與學員對象，產生 3 小時課程教案、互動活動與課後測驗。' },
    { label: '簡報大綱', text: '給一個主題和報告時間，產生逐頁簡報大綱，每頁有標題、重點與講者備註。' },
    { label: '資料分析', text: '上傳銷售報表截圖或 CSV，找出趨勢與異常，用白話說明並給三個建議。' },
    { label: '商務翻譯', text: '把中文信件翻譯成道地的商務英文，並說明主要修改的地方。' },
    { label: '履歷健檢', text: '根據我的履歷和目標職缺，改寫工作經歷並準備面試問題。' },
    { label: '程式除錯', text: '檢查使用者貼上的 Python 程式碼或錯誤截圖，指出錯誤與資安風險並給修正後程式碼。' }
  ];

  var TONES = [
    { id: 'auto', zh: '依技能類型自動' },
    { id: 'pro', zh: '專業嚴謹', rule: '語氣專業、用詞精準，避免口語與表情符號' },
    { id: 'friendly', zh: '親切溫暖', rule: '語氣親切溫暖，像朋友一樣說明' },
    { id: 'lively', zh: '活潑有趣', rule: '語氣活潑有趣，可適度使用表情符號' },
    { id: 'concise', zh: '簡潔俐落', rule: '回答簡潔俐落，先給結論，省略不必要的鋪陳' },
    { id: 'teacher', zh: '老師教學', rule: '用老師講解的方式，循序漸進並舉例說明' }
  ];

  var LANGS = [
    { id: 'zh-TW', zh: '繁體中文（台灣用語）', rule: '一律使用繁體中文（台灣用語）回覆' },
    { id: 'follow', zh: '跟隨使用者的語言', rule: '使用與使用者相同的語言回覆' },
    { id: 'en', zh: 'English', rule: 'Always respond in English' },
    { id: 'ja', zh: '日本語', rule: '常に日本語で回答する' }
  ];

  var DETAILS = [
    { id: 'lite', zh: '精簡（只有概述＋步驟）' },
    { id: 'std', zh: '標準（＋輸出格式＋注意事項）' },
    { id: 'full', zh: '完整（＋輸入資料＋範例）' }
  ];

  // 逆向工程預設範例：圖片為本工具自繪 SVG；result 是預先寫好的解析結果，免金鑰即可看效果
  var REV_EXAMPLES = [
    { label: '🌅 夕陽湖景插畫', image: 'examples/sunset-lake.svg', w: 1600, h: 900,
      result: { summary: '扁平風格的夕陽湖景插畫，紫粉橘漸層天空、層疊山脈與湖面倒影。',
        elements: { subject: '落在山谷間的大太陽、三隻飛鳥', style: '扁平向量插畫（flat illustration），無描邊、色塊分明', composition: '水平對稱構圖，太陽置中，寬銀幕 16:9 遠景', lighting: '逆光夕照，太陽為唯一光源，湖面有水平條紋倒影', color: '深藍→洋紅→橘→淡黃的漸層天空，山脈為紫色系兩層', background: '層疊山脈、平靜湖面、前景深紫色岸邊與松樹剪影', mood: '寧靜、溫暖、黃昏的放鬆感', details: '湖面倒影由短橫條組成，前景左右各有兩棵三角形松樹' },
        prompt_zh: '扁平向量插畫風格的夕陽湖景：一顆淡黃色大太陽落在兩層紫色山脈之間，天空由深藍漸層到洋紅、橘色與淡黃，平靜的湖面映出由短橫條組成的太陽倒影，前景是深紫色湖岸與三角形松樹剪影，天空有三隻簡筆飛鳥。水平對稱構圖、色塊分明無描邊、寧靜溫暖的黃昏氛圍，16:9 寬幅。',
        prompt_en: 'flat vector illustration of a sunset over a mountain lake, a large pale yellow sun setting between two layers of purple mountains, gradient sky from deep indigo to magenta, orange and soft yellow, calm lake with a striped sun reflection, dark purple foreground shore with triangular pine tree silhouettes, three simple birds in the sky, symmetrical horizontal composition, clean color blocks, no outlines, serene warm dusk mood',
        tags_en: 'flat illustration, vector art, sunset, mountain lake, gradient sky, purple mountains, sun reflection, pine silhouettes, minimalist, symmetrical composition, warm dusk, clean shapes',
        negative_en: 'photorealistic, 3d render, text, watermark, noise, blurry, people, cluttered' } },
    { label: '☕ 極簡咖啡海報', image: 'examples/coffee-poster.svg', w: 900, h: 1200,
      result: { summary: '米色背景的極簡咖啡海報，線稿咖啡杯配上 MORNING BREW 標題。',
        elements: { subject: '一個冒著三縷蒸氣的白色咖啡杯（粗線稿）', style: '極簡平面設計海報、單線線稿＋少量色塊', composition: '直式 3:4，杯子置中偏上、背後一個大圓，下方置中大標題', lighting: '無明顯光影，平面設計', color: '米白與奶茶色底、深咖啡線條、焦橘色重點字', background: '素色米色背景加一個淺奶茶色大圓', mood: '溫暖、清爽、文青早晨感', details: '圖中文字："MORNING"（深咖啡）、"BREW"（焦橘）、小字 "SINCE 2026 · HAND DRIP"，襯線字體、字距寬' },
        prompt_zh: '極簡風格的咖啡店海報，直式 3:4。米色背景中央有一個淺奶茶色大圓，圓內是用深咖啡色粗線條畫的白色咖啡杯，杯口冒出三縷彎曲蒸氣。下方置中襯線大標題 "MORNING"（深咖啡色）與 "BREW"（焦橘色），最下方一行小字 "SINCE 2026 · HAND DRIP"，字距寬。平面設計、乾淨留白、溫暖文青的早晨氛圍。',
        prompt_en: 'minimalist coffee shop poster, beige background with a large soft latte-colored circle, a white coffee cup drawn in bold dark brown line art with three curly steam lines, centered serif headline "MORNING" in dark brown and "BREW" in burnt orange, small wide-tracked caption "SINCE 2026 · HAND DRIP", flat graphic design, generous negative space, warm cozy morning vibe',
        tags_en: 'minimalist poster, coffee cup line art, beige background, flat design, serif typography, burnt orange accent, negative space, cafe branding, cozy',
        negative_en: 'photo, 3d, gradient mesh, clutter, misspelled text, watermark, extra objects' } },
    { label: '🌆 霓虹復古城市', image: 'examples/neon-city.svg', w: 1200, h: 1200,
      result: { summary: '合成器浪潮（synthwave）風格的復古未來城市，條紋落日與霓虹格線地面。',
        elements: { subject: '帶水平條紋的黃粉漸層大太陽、城市大樓剪影', style: '80 年代合成器浪潮（synthwave／retrowave）向量插畫', composition: '正方形 1:1、單點透視，太陽置中、地平線在下方三分之二處，格線向消失點匯聚', lighting: '霓虹自發光，太陽與格線發亮，夜晚', color: '深紫夜空、桃紅霓虹格線、黃到桃紅的太陽漸層、青色窗燈', background: '有幾顆星星的深紫夜空、兩側高低錯落的大樓', mood: '懷舊、夢幻、復古未來感', details: '太陽下半部有逐漸變粗的水平切割條紋；大樓窗戶為零星青色方塊' },
        prompt_zh: '80 年代合成器浪潮風格的復古未來城市夜景，正方形構圖。深紫色夜空點綴少量星星，正中央一顆由黃色漸層到桃紅色的大太陽，下半部有逐漸變粗的水平條紋切割；兩側是深紫色大樓剪影，窗戶亮著零星青色燈光；地平線以下是黑紫色地面與發光的桃紅色霓虹透視格線，向中央消失點匯聚。懷舊、夢幻的 retrowave 氛圍，向量插畫。',
        prompt_en: '1980s synthwave retro-futuristic city at night, square composition, deep purple starry sky, a huge sun with yellow to hot pink gradient and horizontal stripe cuts on the lower half, dark purple skyscraper silhouettes on both sides with scattered cyan windows, glowing hot pink neon perspective grid floor converging to a central vanishing point, nostalgic dreamy retrowave vibe, vector illustration',
        tags_en: 'synthwave, retrowave, 80s aesthetic, neon grid, striped sun, city silhouette, purple night sky, hot pink, cyan lights, vector art, vanishing point',
        negative_en: 'daylight, realistic photo, people, text, watermark, blurry, muddy colors' } },
    { label: '📱 IG 新品貼文', text: '☕️ 秋天限定｜桂花烏龍拿鐵上市啦！\n\n一口喝到清甜桂花香 🌼\n再接著烏龍茶的焙火尾韻\n鮮奶溫柔包住每一層味道～\n\n📍 全門市 10/30 開賣\n⏰ 前 3 天買一送一（限內用）\n\n你最期待哪個秋天口味？留言告訴我們 👇\n\n#秋季限定 #桂花烏龍 #拿鐵 #咖啡廳 #新品上市',
      result: { summary: '咖啡店秋季新品的 IG 上市貼文，活潑、短句、表情符號多，結尾留言互動。',
        elements: { role: '咖啡連鎖品牌的社群小編', task: '宣傳季節限定新品上市與開賣優惠', audience: '20～35 歲、喜歡嘗鮮的咖啡廳客群', tone: '活潑親切、口語，帶感官描寫', structure: '標題行 → 三行口味描寫 → 開賣資訊 → 互動提問 → Hashtags', length: '約 120 字，每行 15 字內', format: '每段開頭有表情符號、📍⏰ 標示資訊、5 個中文 Hashtags', keywords: '季節感、口味層次、限時優惠、留言互動' },
        prompt_zh: '你是【品牌名稱】的社群小編，請為新品【新品名稱】寫一篇 IG 上市貼文。\n- 第一行：表情符號＋【季節／檔期】限定＋新品名稱＋「上市啦！」\n- 用三行短句描寫口味層次（香氣 → 主體 → 尾韻），每行 15 字內，加入感官形容\n- 用 📍 寫開賣日期與地點、⏰ 寫優惠：【優惠內容】\n- 結尾用一個問句邀請粉絲留言\n- 最後附 5 個中文 Hashtags\n語氣活潑親切、口語化，全文約 120 字，適當使用表情符號。',
        prompt_en: 'You are the social media manager of [Brand]. Write an Instagram launch post for the new item [Product Name]. Line 1: emoji + [Season] limited + product name + "is here!". Then three short lines (under 15 characters each) describing the flavor layers (aroma → body → finish) with sensory words. Use 📍 for launch date and location, ⏰ for the promotion: [Offer]. End with a question inviting comments, then 5 hashtags. Lively, friendly, conversational, about 120 characters, with emojis.' } },
    { label: '🛒 電商商品描述', text: '【一手掌握的輕量保溫瓶】\n上班通勤、健身運動都適合的 350ml 小容量設計，重量只有 180g，放進包包幾乎感覺不到。\n\n✔ 真空雙層結構：保冷 12 小時、保溫 6 小時\n✔ 316 醫療級不鏽鋼內膽：不殘味、好清洗\n✔ 一鍵彈蓋＋安全鎖：單手就能喝，不怕漏水\n✔ 霧面防滑塗層：手汗也不滑手\n\n規格｜容量 350ml／重量 180g／尺寸 6.5 × 19 cm\n※ 不適用碳酸飲料與牛奶長時間存放',
      result: { summary: '電商平台的保溫瓶商品描述：標題＋情境段落＋勾選賣點＋規格與注意事項。',
        elements: { role: '電商文案撰稿人', task: '撰寫商品頁的商品描述', audience: '通勤上班族與運動族群', tone: '清楚、實用、帶一點生活情境', structure: '【】標題 → 使用情境段落 → 4 點 ✔ 賣點（功能＋好處）→ 規格列 → ※ 注意事項', length: '約 200 字', format: '✔ 條列、｜與／分隔規格、※ 標示注意事項', keywords: '容量重量數字、材質、保溫保冷時數、使用限制' },
        prompt_zh: '你是電商文案撰稿人，請為【商品名稱】寫一段商品頁描述，目標客群是【目標客群】。\n1. 第一行用【】寫一句點出最大特色的標題\n2. 一段 2 句的使用情境，帶出容量、重量等關鍵數字\n3. 4 點以 ✔ 開頭的賣點，每點格式「功能：帶來的好處」\n4. 一行規格，用「｜」與「／」分隔：【規格】\n5. 最後以 ※ 寫使用限制或注意事項\n語氣清楚實用，約 200 字，只使用我提供的規格，不要誇大。',
        prompt_en: 'You are an e-commerce copywriter. Write a product description for [Product Name] targeting [Target Customers]. 1) A headline in 【】 highlighting the key feature. 2) A two-sentence usage scenario including key numbers such as capacity and weight. 3) Four ✔ bullet points in the format "Feature: benefit". 4) One spec line separated by | and /: [Specs]. 5) End with a ※ note about usage limitations. Clear and practical, about 200 words, use only the specs provided and avoid exaggeration.' } }
  ];

  return { REV_EXAMPLES: REV_EXAMPLES, PLATFORM_TONES: PLATFORM_TONES, IMAGE_STEP: IMAGE_STEP, IMAGE_KW: IMAGE_KW, CATEGORIES: CATEGORIES, EXAMPLES: EXAMPLES, TONES: TONES, LANGS: LANGS, DETAILS: DETAILS };
})();
