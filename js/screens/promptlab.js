// ============================================================
//  screens/promptlab.js — Prompt Lab (admin-only)
//  หน้าแยกสำหรับทีมแอดมินทดสอบพร้อมพต์ Gemini Live 3 แบบ (A/B/C จาก
//  js/prompt-lab-variants.js) ผ่านเสียงจริง แล้วเก็บฟีดแบ็คเป็นข้อความ
//  ไปที่ Firestore /promptLabFeedback เพื่อเอาไปจูน prompt ต่อ
//
//  ไม่ผ่าน flow เต็มของนักศึกษา (chat.js) — ไม่มี session/results, ไม่มี
//  rate limit, ไม่มีการเลือกยาเอง (Step 3 สมมุติว่าจ่าย first-line ถูกแล้ว)
// ============================================================

let _plCases       = [];   // ทุกเคส (รวม isActive:false) — จาก getAllCasesForAdmin()
let _plDrugs       = [];   // จาก getDrugs()
let _plFeedback    = [];   // ประวัติฟีดแบ็ค — จาก getPromptLabFeedback()

let _plClient      = null; // GeminiLiveClient ปัจจุบัน (null = ไม่ได้เชื่อมต่อ)
let _plConnecting  = false;
let _plConnected   = false;
let _plTranscript  = [];   // [{ role: 'pharmacist'|'patient', text, interrupted? }]
let _plRunCaseData = null; // caseData ที่สุ่มแล้ว ณ ตอนเริ่มคุยรอบนี้
let _plRunStep     = null; // 'history' | 'counseling' — ของรอบที่กำลัง/เพิ่งจบ
let _plRunVariant  = null; // 'A' | 'B' | 'C'
let _plRunPrompt   = '';   // system prompt เต็มที่ใช้จริงรอบนี้ (snapshot)
let _plRunDrugs    = [];   // dispensedDrugs ของรอบนี้ (เฉพาะ step: counseling)
let _plRunDone     = false; // จบการสนทนาแล้ว รอกรอกฟีดแบ็ค
let _plStatusText  = '';   // ข้อความสถานะปัจจุบัน — เก็บแยกแทนอ่านจาก DOM ตอน re-render

let _plFilterCase    = '';
let _plFilterStep    = '';
let _plFilterVariant = '';

// ตัวเลือกที่แอดมินกำลังตั้งค่าไว้ (ก่อนกด "เริ่มคุย") — เก็บแยกจาก DOM เพื่อไม่ให้
// รีเซ็ตกลับค่า default ทุกครั้งที่ _plRenderBody() ถูกเรียกจากส่วนอื่น (เช่น เปลี่ยนตัวกรองประวัติ)
let _plSelCaseId  = '';
let _plSelStep    = 'history';
let _plSelVariant = 'A';

async function renderPromptLab(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container-lg fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="pl-back-btn">← กลับ</button>
        <div>
          <h2>🧪 Prompt Lab</h2>
          <p class="text-dim text-sm">ทดสอบพร้อมพต์ Gemini Live 3 แบบผ่านเสียงจริง แล้วเก็บฟีดแบ็คไปจูนต่อ</p>
        </div>
      </div>
      <div id="pl-body"><div class="text-center p-3"><span class="spinner"></span></div></div>
    </div>`;

  document.getElementById('pl-back-btn').addEventListener('click', () => {
    if (_plConnected && !confirm('กำลังคุยอยู่ ออกจากหน้านี้เลยไหมครับ? (การสนทนาจะถูกตัด)')) return;
    _plTeardownClient();
    Router.go('admin');
  });

  [_plCases, _plDrugs, _plFeedback] = await Promise.all([
    getAllCasesForAdmin(), getDrugs(), getPromptLabFeedback(),
  ]);
  if (!_plSelCaseId && _plCases.length) _plSelCaseId = _plCases[0].id;
  _plRenderBody();
}

function _plRenderBody() {
  const host = document.getElementById('pl-body');
  if (!host) return;

  const showSession = _plClient || _plConnecting || _plRunDone;
  host.innerHTML = `
    ${_plRenderSetupCard()}
    ${showSession ? _plRenderSessionCard() : ''}
    ${_plRenderHistoryCard()}
  `;
  _plBindSetupCard();
  if (showSession) _plBindSessionCard();
  _plBindHistoryCard();
}

// ── Setup card: เลือกเคส / step / variant / เริ่มคุย ──────────
function _plRenderSetupCard() {
  const caseOptions = _plCases.length
    ? _plCases.map(c => `<option value="${escapeHtml(c.id)}" ${_plSelCaseId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}${c.isActive ? '' : ' — ปิดใช้งาน (กำลังจูน)'}</option>`).join('')
    : '<option value="">— ยังไม่มีเคสในระบบ —</option>';

  const variantOptions = Object.entries(PROMPT_LAB_VARIANTS)
    .map(([id, v]) => `<option value="${id}" ${_plSelVariant === id ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('');

  const busy = _plConnecting || _plConnected;

  return `
    <div class="card mb-3">
      <h3 class="mb-2">ตั้งค่ารอบทดสอบ</h3>
      <div class="grid gap-2" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
        <div>
          <label class="input-label">เคส</label>
          <select class="input" id="pl-case" ${busy ? 'disabled' : ''}>${caseOptions}</select>
        </div>
        <div>
          <label class="input-label">ขั้นตอนที่ทดสอบ</label>
          <select class="input" id="pl-step" ${busy ? 'disabled' : ''}>
            <option value="history"    ${_plSelStep === 'history'    ? 'selected' : ''}>ซักประวัติ (Step 1)</option>
            <option value="counseling" ${_plSelStep === 'counseling' ? 'selected' : ''}>ให้คำแนะนำหลังจ่ายยา (Step 3)</option>
          </select>
        </div>
        <div>
          <label class="input-label">พร้อมพต์ที่จะทดสอบ</label>
          <select class="input" id="pl-variant" ${busy ? 'disabled' : ''}>${variantOptions}</select>
        </div>
      </div>
      <p class="text-dim text-xs mt-2" id="pl-step-note"></p>
      <div class="mt-2">
        <button class="btn btn-primary" id="pl-start-btn" ${busy || !_plCases.length ? 'disabled' : ''}>
          ${_plConnecting ? '⏳ กำลังเชื่อมต่อ…' : '🎙️ เริ่มคุย'}
        </button>
      </div>
    </div>`;
}

function _plBindSetupCard() {
  const caseSel = document.getElementById('pl-case');
  const stepSel = document.getElementById('pl-step');
  const varSel  = document.getElementById('pl-variant');
  const note    = document.getElementById('pl-step-note');
  const syncNote = () => {
    note.textContent = stepSel.value === 'counseling'
      ? 'โหมดนี้จะสมมุติว่าเภสัชกรจ่ายยา first-line ที่ถูกต้องของเคสไปแล้ว ไม่ต้องเลือกยาเอง'
      : 'ผู้ป่วยจะรอให้เภสัชกรทักก่อน แล้วซักประวัติตามปกติ';
  };
  syncNote();
  caseSel?.addEventListener('change', (e) => { _plSelCaseId  = e.target.value; });
  stepSel?.addEventListener('change', (e) => { _plSelStep    = e.target.value; syncNote(); });
  varSel?.addEventListener('change',  (e) => { _plSelVariant = e.target.value; });

  document.getElementById('pl-start-btn')?.addEventListener('click', _plStartSession);
}

// ── Session card: สถานะ + transcript + จบ/ฟีดแบ็ค ─────────────
function _plRenderSessionCard() {
  const statusLine = _plRunDone
    ? '⏹ จบการสนทนาแล้ว — กรอกฟีดแบ็คด้านล่าง'
    : (_plStatusText || '⏳ กำลังเชื่อมต่อ…');

  const meta = _plRunCaseData
    ? `เคส: ${escapeHtml(_plRunCaseData.title || '')} · variant ${escapeHtml(_plRunVariant || '')} ·
       ${_plRunStep === 'counseling' ? 'ให้คำแนะนำหลังจ่ายยา' : 'ซักประวัติ'}
       ${_plRunStep === 'counseling' && _plRunDrugs.length ? ' · ยาที่จ่าย: ' + escapeHtml(_plRunDrugs.map(d => `${d.name} ${d.strength}`).join(', ')) : ''}`
    : '';

  return `
    <div class="card mb-3">
      <div class="flex items-center gap-2 mb-2">
        <h3>บทสนทนา</h3>
        ${!_plRunDone ? `<button class="btn btn-red btn-sm" id="pl-end-btn" style="margin-left:auto;">⏹ จบการสนทนา</button>` : ''}
      </div>
      <p class="text-dim text-sm mb-1">${meta}</p>
      <p class="text-sm mb-2" id="pl-status">${statusLine}</p>
      <div class="transcript-wrap" style="max-height:320px;overflow-y:auto;">
        <div id="pl-transcript"></div>
      </div>
      ${_plRunDone ? `
        <div class="mt-3" style="border-top:1px solid var(--glass-border);padding-top:0.75rem;">
          <label class="input-label">ฟีดแบ็ค — มีปัญหาอะไร / ชอบ-ไม่ชอบตรงไหน</label>
          <textarea class="input" id="pl-feedback-text" rows="4" placeholder="เช่น ผู้ป่วยเผลอบอกโรคประจำตัวเองก่อนถูกถาม / น้ำเสียงเป็นธรรมชาติดี / ตอบยาวเกินไปสำหรับโหมดเสียง"></textarea>
          <div id="pl-feedback-alert" class="hidden mb-2 mt-2"></div>
          <button class="btn btn-primary mt-2" id="pl-save-feedback-btn">💾 บันทึกฟีดแบ็ค</button>
        </div>` : ''}
    </div>`;
}

function _plBindSessionCard() {
  _plRenderTranscript();
  document.getElementById('pl-end-btn')?.addEventListener('click', _plEndSession);
  document.getElementById('pl-save-feedback-btn')?.addEventListener('click', _plSaveFeedback);
}

function _plRenderTranscript() {
  const wrap = document.getElementById('pl-transcript');
  if (!wrap) return;
  wrap.innerHTML = _plTranscript.map(m => {
    const role  = m.role === 'pharmacist' ? 'user' : 'patient';
    const label = m.role === 'pharmacist' ? 'คุณ (เภสัชกร)' : (_plRunCaseData?.name || 'ผู้ป่วย');
    const text  = escapeHtmlBr(m.text) + (m.interrupted ? ' <span class="text-dim text-xs">(ถูกพูดแทรก)</span>' : '');
    return `<div class="msg msg-${role}"><div class="msg-name">${escapeHtml(label)}</div><div>${text}</div></div>`;
  }).join('') || '<p class="text-dim text-sm">ยังไม่มีบทสนทนา</p>';
  wrap.scrollTop = wrap.scrollHeight;
}

function _plSetStatus(text) {
  _plStatusText = text;
  const el = document.getElementById('pl-status');
  if (el) el.textContent = text;
}

// ── เริ่ม/จบ การเชื่อมต่อ Gemini Live ──────────────────────────
async function _plStartSession() {
  const caseId  = _plSelCaseId;
  const step    = _plSelStep;
  const variant = _plSelVariant;
  const rawCase = _plCases.find(c => c.id === caseId);
  if (!rawCase) { alert('กรุณาเลือกเคส'); return; }

  const apiKey = getGeminiKey();
  if (!apiKey) { alert('ยังไม่ได้โหลด Gemini API key — ลองรีเฟรชหน้าใหม่'); return; }

  const caseData = randomizePatientData(rawCase);
  let dispensedDrugs = [];
  if (step === 'counseling') {
    const firstLine = Array.isArray(caseData.drugAnswer?.firstLine) ? caseData.drugAnswer.firstLine : [];
    dispensedDrugs = firstLine
      .map(code => typeof code === 'string' ? code : null)
      .filter(Boolean)
      .map(code => {
        const d = _plDrugs.find(x => x.id === code);
        return d ? { name: d.name, strength: d.strength, form: d.form } : { name: code, strength: '', form: '' };
      });
  }

  const variantConf = PROMPT_LAB_VARIANTS[variant];
  const systemPrompt = step === 'counseling'
    ? variantConf.buildCounseling(caseData, dispensedDrugs, true)
    : variantConf.buildHistory(caseData, true);
  const voiceName = caseData.gender === 'male' ? 'Puck' : 'Aoede';

  _plTranscript  = [];
  _plRunCaseData = caseData;
  _plRunStep     = step;
  _plRunVariant  = variant;
  _plRunPrompt   = systemPrompt;
  _plRunDrugs    = dispensedDrugs;
  _plRunDone     = false;
  _plConnecting  = true;
  _plStatusText  = '⏳ กำลังเชื่อมต่อ…';
  _plRenderBody();

  const client = new GeminiLiveClient();
  client.audioEnabled = false; // เงียบไว้ก่อนจนกว่าเภสัชกร(ทดสอบ)จะพูดก่อน — เหมือนของจริงใน chat.js
  let pharmacistSpoke = false;

  client.onStateChange = (state) => {
    const labels = {
      connecting:    '⏳ กำลังเชื่อมต่อ…',
      ready:         '🎙️ พร้อมแล้ว — พูดได้เลยครับ',
      'ai-speaking': '🔊 ผู้ป่วยกำลังพูด…',
      listening:     '🎙️ กำลังฟัง…',
      disconnected:  '🔌 ตัดการเชื่อมต่อแล้ว',
    };
    _plSetStatus(labels[state] || state);
  };
  client.onUserSpeechStart = () => {
    if (!pharmacistSpoke) { pharmacistSpoke = true; client.audioEnabled = true; }
  };
  client.onUserTranscript = (text) => {
    const t = (text || '').trim();
    if (!t) return;
    _plTranscript.push({ role: 'pharmacist', text: t });
    _plRenderTranscript();
  };
  client.onModelTranscript = (text, meta) => {
    if (!text) return;
    _plTranscript.push({ role: 'patient', text, interrupted: !!meta?.interrupted });
    _plRenderTranscript();
  };
  client.onError = (errMsg) => {
    _plSetStatus('❌ ' + errMsg);
  };

  try {
    await client.connect(apiKey, systemPrompt, voiceName);
    await client.startMic();
    _plClient     = client;
    _plConnected  = true;
    _plConnecting = false;
    _plRenderBody();
  } catch (e) {
    _plConnecting = false;
    try { client.disconnect(); } catch (_) {}
    alert('เชื่อมต่อ Gemini Live ไม่สำเร็จ: ' + e.message);
    _plRenderBody();
  }
}

function _plEndSession() {
  _plTeardownClient();
  _plRunDone   = true;
  _plConnected = false;
  _plRenderBody();
}

function _plTeardownClient() {
  if (_plClient) { try { _plClient.disconnect(); } catch (_) {} _plClient = null; }
  _plConnected  = false;
  _plConnecting = false;
}

async function _plSaveFeedback() {
  const alertEl = document.getElementById('pl-feedback-alert');
  const text    = document.getElementById('pl-feedback-text')?.value.trim() || '';
  if (!text) {
    alertEl.className   = 'alert alert-error mb-2 mt-2';
    alertEl.textContent = 'กรุณาพิมพ์ฟีดแบ็คก่อนบันทึก';
    return;
  }

  const profile = getUserProfile();
  const btn = document.getElementById('pl-save-feedback-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก…'; }

  try {
    await savePromptLabFeedback({
      caseId:         _plRunCaseData?.id || null,
      caseTitle:      _plRunCaseData?.title || '',
      step:           _plRunStep,
      variantId:      _plRunVariant,
      promptText:     _plRunPrompt,
      dispensedDrugs: _plRunDrugs,
      voiceName:      _plRunCaseData?.gender === 'male' ? 'Puck' : 'Aoede',
      transcript:     _plTranscript,
      feedbackText:   text,
      testerUid:      getCurrentUser()?.uid || null,
      testerLabel:    profile?.participantId || getCurrentUser()?.email || '',
    });

    // เคลียร์รอบทดสอบ กลับไปตั้งค่ารอบใหม่ + รีเฟรชประวัติฟีดแบ็ค
    _plRunDone     = false;
    _plTranscript  = [];
    _plRunCaseData = null;
    _plFeedback    = await getPromptLabFeedback();
    _plRenderBody();
  } catch (e) {
    alertEl.className   = 'alert alert-error mb-2 mt-2';
    alertEl.textContent = 'บันทึกไม่สำเร็จ: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึกฟีดแบ็ค'; }
  }
}

// ── History card: ฟีดแบ็คที่ผ่านมา (กรองตามเคส/step/variant) ──
function _plRenderHistoryCard() {
  const caseFilterOptions = ['<option value="">ทุกเคส</option>']
    .concat(_plCases.map(c => `<option value="${escapeHtml(c.id)}" ${_plFilterCase === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`))
    .join('');
  const variantFilterOptions = ['<option value="">ทุก variant</option>']
    .concat(Object.keys(PROMPT_LAB_VARIANTS).map(id => `<option value="${id}" ${_plFilterVariant === id ? 'selected' : ''}>${id}</option>`))
    .join('');

  const filtered = _plFeedback.filter(f =>
    (!_plFilterCase    || f.caseId === _plFilterCase) &&
    (!_plFilterStep    || f.step === _plFilterStep) &&
    (!_plFilterVariant || f.variantId === _plFilterVariant)
  );

  const rows = filtered.length
    ? filtered.map(_plRenderFeedbackRow).join('')
    : '<p class="text-dim text-sm p-2">ยังไม่มีฟีดแบ็คตามตัวกรองนี้</p>';

  return `
    <div class="card">
      <h3 class="mb-2">ฟีดแบ็คที่ผ่านมา (${filtered.length})</h3>
      <div class="flex gap-2 mb-2" style="flex-wrap:wrap;">
        <select class="input" id="pl-filter-case" style="max-width:220px;">${caseFilterOptions}</select>
        <select class="input" id="pl-filter-step" style="max-width:220px;">
          <option value="">ทุกขั้นตอน</option>
          <option value="history"    ${_plFilterStep === 'history'    ? 'selected' : ''}>ซักประวัติ</option>
          <option value="counseling" ${_plFilterStep === 'counseling' ? 'selected' : ''}>ให้คำแนะนำ</option>
        </select>
        <select class="input" id="pl-filter-variant" style="max-width:160px;">${variantFilterOptions}</select>
      </div>
      <div>${rows}</div>
    </div>`;
}

function _plRenderFeedbackRow(f) {
  const when = f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString('th-TH') : '';
  const stepLabel = f.step === 'counseling' ? 'ให้คำแนะนำ' : 'ซักประวัติ';
  const transcriptHtml = (f.transcript || []).map(m => {
    const role  = m.role === 'pharmacist' ? 'user' : 'patient';
    const label = m.role === 'pharmacist' ? 'เภสัชกร' : 'ผู้ป่วย';
    return `<div class="msg msg-${role}"><div class="msg-name">${escapeHtml(label)}</div><div>${escapeHtmlBr(m.text)}</div></div>`;
  }).join('');

  return `
    <details class="mb-2" style="border:1px solid var(--glass-border);border-radius:8px;padding:0.5rem 0.75rem;">
      <summary style="cursor:pointer;">
        <b>${escapeHtml(f.variantId || '?')}</b> · ${escapeHtml(stepLabel)} · ${escapeHtml(f.caseTitle || f.caseId || '')}
        <span class="text-dim text-xs"> — ${escapeHtml(f.testerLabel || '')} · ${escapeHtml(when)}</span>
      </summary>
      <p class="mt-2" style="white-space:pre-wrap;">${escapeHtmlBr(f.feedbackText || '')}</p>
      <details class="mt-2"><summary class="text-dim text-sm" style="cursor:pointer;">ดู transcript (${(f.transcript || []).length} ข้อความ)</summary>
        <div class="mt-2">${transcriptHtml || '<p class="text-dim text-sm">ไม่มี transcript</p>'}</div>
      </details>
    </details>`;
}

function _plBindHistoryCard() {
  document.getElementById('pl-filter-case')?.addEventListener('change', (e) => {
    _plFilterCase = e.target.value; _plRenderBody();
  });
  document.getElementById('pl-filter-step')?.addEventListener('change', (e) => {
    _plFilterStep = e.target.value; _plRenderBody();
  });
  document.getElementById('pl-filter-variant')?.addEventListener('change', (e) => {
    _plFilterVariant = e.target.value; _plRenderBody();
  });
}
