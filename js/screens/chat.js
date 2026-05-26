// ============================================================
//  screens/chat.js — 4-step session flow
//  Step 1: History Taking → Step 2: Drug Dispensing →
//  Step 3: Counseling → Step 4: OSPE Evaluation
// ============================================================

// Module-level state (reset on each renderChat call)
let _caseData          = null;
let _session           = null;
let _step              = 1;
let _chatHistory       = [];   // [{role:'user'|'model', text}]
let _counselingHistory = [];
let _dispensedDrugs    = [];
let _aiTyping          = false;
let _ttsEnabled        = false;
let _recognition       = null;

const _synth = window.speechSynthesis || null;

// ── Entry Point ────────────────────────────────────────────────

async function renderChat(container, params = {}) {
  const { caseId } = params;
  const user    = getCurrentUser();
  const profile = getUserProfile();
  const pid     = profile?.participantId || user?.email?.split('@')[0].toUpperCase();

  if (!caseId) { Router.go('groups'); return; }

  // Reset all state
  _recognition?.stop();
  _synth?.cancel();
  _caseData = null; _session = null; _step = 1;
  _chatHistory = []; _counselingHistory = []; _dispensedDrugs = [];
  _aiTyping = false; _ttsEnabled = false; _recognition = null;

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in" style="max-width:720px;">
      <div class="text-center p-3"><span class="spinner"></span> กำลังโหลดเคส…</div>
    </div>`;

  try {
    const rawCase = await getCaseById(caseId);
    if (!rawCase) { Router.go('groups'); return; }

    _caseData = randomizePatientData(rawCase);

    // Rate-limit double-check before consuming a slot
    const count = await getTodaySessionCount(user.uid);
    if (count >= 5) {
      container.innerHTML = `
        ${renderNavbar(pid)}
        <div class="container fade-in" style="max-width:720px;">
          <div class="alert alert-warning">⚠️ คุณใช้ครบ 5 ครั้งสำหรับวันนี้แล้ว สามารถกลับมาฝึกใหม่ได้พรุ่งนี้</div>
          <button class="btn btn-ghost btn-sm mt-2" onclick="Router.go('dashboard')">← กลับหน้าหลัก</button>
        </div>`;
      return;
    }

    _session = await createSession(user.uid, _caseData);
    _renderChatUI(container, pid);
    await _initConversation();

  } catch (e) {
    container.innerHTML = `
      ${renderNavbar(pid)}
      <div class="container fade-in" style="max-width:720px;">
        <div class="alert alert-error">โหลดเคสล้มเหลว: ${_esc(e.message)}</div>
        <button class="btn btn-ghost btn-sm mt-2" onclick="Router.go('groups')">← กลับ</button>
      </div>`;
  }
}

// ── Render UI ─────────────────────────────────────────────────

function _renderChatUI(container, pid) {
  const c = _caseData;
  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in" style="max-width:720px;">

      <!-- Case info bar -->
      <div class="flex items-center gap-1 mb-2" style="flex-wrap:wrap;">
        <span class="font-bold">${_esc(c.title || c.id)}</span>
        <span class="difficulty-badge difficulty-${c.difficulty || 'easy'}">${diffLabel(c.difficulty)}</span>
        <span class="text-dim text-sm">${c.gender === 'male' ? 'ชาย' : 'หญิง'} ${c.age} ปี${c.occupation ? ' · ' + _esc(c.occupation) : ''}</span>
      </div>

      <!-- Stepper -->
      <div class="stepper mb-3">
        <div class="step active" id="step-1"><div class="step-circle">1</div><div class="step-label">ซักประวัติ</div></div>
        <div class="step-line" id="line-1"></div>
        <div class="step" id="step-2"><div class="step-circle">2</div><div class="step-label">จ่ายยา</div></div>
        <div class="step-line" id="line-2"></div>
        <div class="step" id="step-3"><div class="step-circle">3</div><div class="step-label">ให้คำแนะนำ</div></div>
        <div class="step-line" id="line-3"></div>
        <div class="step" id="step-4"><div class="step-circle">4</div><div class="step-label">ประเมินผล</div></div>
      </div>

      <!-- ═══ Panel 1: History Taking ═══ -->
      <div id="panel-1">
        <div class="chat-wrap" style="border:1px solid var(--glass-border);border-radius:var(--radius);background:rgba(255,255,255,0.03);">
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input-row">
            <input class="input chat-input" id="chat-input" type="text"
              placeholder="พิมพ์ข้อความหรือกดไมค์…" autocomplete="off" />
            <button class="btn-mic" id="mic-btn" title="Push to Talk (กดพูด)">🎤</button>
            <button class="btn btn-primary btn-sm" id="send-btn">ส่ง</button>
          </div>
        </div>
        <div class="flex items-center mt-2" style="justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <label class="flex items-center gap-1 text-sm text-dim" style="cursor:pointer;">
            <input type="checkbox" id="tts-toggle" /> อ่านออกเสียงอัตโนมัติ
          </label>
          <button class="btn btn-success btn-sm" id="done-history-btn">ซักประวัติเสร็จแล้ว → จ่ายยา</button>
        </div>
      </div>

      <!-- ═══ Panel 2: Drug Dispensing ═══ -->
      <div id="panel-2" class="hidden">
        <div class="card mb-2">
          <h3 class="mb-2">💊 เลือกยาที่จะจ่ายให้ผู้ป่วย</h3>
          <div id="dispensed-chips" class="dispensed-list mb-2"></div>
          <button class="btn btn-primary btn-sm" id="open-modal-btn">+ เลือก / แก้ไขยา</button>
        </div>
        <div class="flex gap-2" style="justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="back-to-1-btn">← กลับซักประวัติ</button>
          <button class="btn btn-success" id="confirm-drugs-btn">ยืนยันยา → ให้คำแนะนำ</button>
        </div>
      </div>

      <!-- ═══ Panel 3: Counseling ═══ -->
      <div id="panel-3" class="hidden">
        <div id="dispensed-summary" class="alert alert-info mb-2 text-sm"></div>
        <div class="chat-wrap" style="border:1px solid var(--glass-border);border-radius:var(--radius);background:rgba(255,255,255,0.03);">
          <div class="chat-messages" id="counsel-messages"></div>
          <div class="chat-input-row">
            <input class="input chat-input" id="counsel-input" type="text"
              placeholder="อธิบายยาและคำแนะนำให้ผู้ป่วย…" autocomplete="off" />
            <button class="btn-mic" id="mic-btn-3" title="Push to Talk">🎤</button>
            <button class="btn btn-primary btn-sm" id="send-counsel-btn">ส่ง</button>
          </div>
        </div>
        <div class="flex mt-2" style="justify-content:flex-end;">
          <button class="btn btn-success btn-sm" id="done-counsel-btn">ให้คำแนะนำเสร็จแล้ว → ประเมินผล</button>
        </div>
      </div>

      <!-- ═══ Panel 4: Evaluating ═══ -->
      <div id="panel-4" class="hidden">
        <div class="card text-center p-3" id="eval-card">
          <div style="font-size:2.5rem;">📊</div>
          <h3 class="mt-1">กำลังประเมินผล…</h3>
          <p class="text-dim text-sm mt-1">AI อาจารย์กำลังวิเคราะห์บทสนทนาและการจ่ายยา กรุณารอสักครู่</p>
          <div class="mt-2"><span class="spinner"></span></div>
        </div>
      </div>

    </div>`;

  _attachEvents();
}

// ── Stepper ────────────────────────────────────────────────────

function _updateStepper() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-${i}`);
    if (el) el.className = 'step' + (i < _step ? ' done' : i === _step ? ' active' : '');
  }
  for (let i = 1; i <= 3; i++) {
    const ln = document.getElementById(`line-${i}`);
    if (ln) ln.className = 'step-line' + (_step > i ? ' done' : '');
  }
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`panel-${i}`);
    if (panel) panel.className = i === _step ? '' : 'hidden';
  }
}

// ── Event Wiring ───────────────────────────────────────────────

function _attachEvents() {
  // Step 1
  document.getElementById('send-btn')?.addEventListener('click', _sendChat);
  document.getElementById('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendChat(); }
  });
  document.getElementById('mic-btn')?.addEventListener('click',
    () => _toggleVoice('chat-input', 'mic-btn'));
  document.getElementById('tts-toggle')?.addEventListener('change',
    e => { _ttsEnabled = e.target.checked; });
  document.getElementById('done-history-btn')?.addEventListener('click', _goStep2);

  // Step 2
  document.getElementById('open-modal-btn')?.addEventListener('click', () => {
    openDrugsModal(_dispensedDrugs, drugs => {
      _dispensedDrugs = drugs;
      _renderChips();
    });
  });
  document.getElementById('back-to-1-btn')?.addEventListener('click', () => {
    _step = 1; _updateStepper();
  });
  document.getElementById('confirm-drugs-btn')?.addEventListener('click', _goStep3);

  // Step 3
  document.getElementById('send-counsel-btn')?.addEventListener('click', _sendCounseling);
  document.getElementById('counsel-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendCounseling(); }
  });
  document.getElementById('mic-btn-3')?.addEventListener('click',
    () => _toggleVoice('counsel-input', 'mic-btn-3'));
  document.getElementById('done-counsel-btn')?.addEventListener('click', _goStep4);
}

// ── Step 1: History Taking ─────────────────────────────────────

async function _initConversation() {
  if (_caseData.sceneDesc) {
    _addMsg('chat-messages', 'system', `📍 ${_caseData.sceneDesc}`);
  }

  const greeting = 'สวัสดีครับ มีอะไรให้ช่วยไหมครับ?';
  _chatHistory.push({ role: 'user', text: greeting });
  _addMsg('chat-messages', 'user', greeting);
  _lockInput(true, 'chat-input', 'send-btn');
  _showTyping('chat-messages');

  try {
    const reply = await geminiChat(buildSystemPrompt(_caseData), [], greeting);
    _hideTyping('chat-messages');
    _chatHistory.push({ role: 'model', text: reply });
    _addMsg('chat-messages', 'model', reply);
    if (_ttsEnabled) _speak(reply);
    updateSessionChat(_session.id, _chatHistory).catch(() => {});
  } catch (e) {
    _hideTyping('chat-messages');
    _addMsg('chat-messages', 'system', `⚠️ เชื่อมต่อ AI ล้มเหลว: ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'chat-input', 'send-btn');
  }
}

async function _sendChat() {
  if (_aiTyping) return;
  const input = document.getElementById('chat-input');
  const text  = (input?.value || '').trim();
  if (!text) return;

  input.value = '';
  _chatHistory.push({ role: 'user', text });
  _addMsg('chat-messages', 'user', text);
  _lockInput(true, 'chat-input', 'send-btn');
  _showTyping('chat-messages');

  try {
    const hist  = _toApiHistory(_chatHistory.slice(0, -1));
    const reply = await geminiChat(buildSystemPrompt(_caseData), hist, text);
    _hideTyping('chat-messages');
    _chatHistory.push({ role: 'model', text: reply });
    _addMsg('chat-messages', 'model', reply);
    if (_ttsEnabled) _speak(reply);
    updateSessionChat(_session.id, _chatHistory).catch(() => {});
  } catch (e) {
    _hideTyping('chat-messages');
    _addMsg('chat-messages', 'system', `⚠️ ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'chat-input', 'send-btn');
  }
}

function _goStep2() {
  _step = 2;
  _updateStepper();
  _renderChips();
}

// ── Step 2: Drug Dispensing ────────────────────────────────────

function _renderChips() {
  const cont = document.getElementById('dispensed-chips');
  if (!cont) return;
  if (!_dispensedDrugs.length) {
    cont.innerHTML = '<span class="text-dim text-sm">ยังไม่ได้เลือกยา</span>';
    return;
  }
  cont.innerHTML = _dispensedDrugs.map((d, i) => `
    <span class="dispensed-chip">
      ${_esc(d.name)} ${_esc(d.strength)}
      <button class="chip-rm" data-idx="${i}">×</button>
    </span>`).join('');
  cont.querySelectorAll('.chip-rm').forEach(btn => {
    btn.addEventListener('click', () => {
      _dispensedDrugs.splice(+btn.dataset.idx, 1);
      _renderChips();
    });
  });
}

async function _goStep3() {
  _step = 3;
  _updateStepper();
  updateSessionDrugs(_session.id, _dispensedDrugs).catch(() => {});

  const sumEl = document.getElementById('dispensed-summary');
  if (sumEl) {
    sumEl.innerHTML = _dispensedDrugs.length
      ? `💊 ยาที่จ่าย: <strong>${_dispensedDrugs.map(d => `${_esc(d.name)} ${_esc(d.strength)}`).join(', ')}</strong>`
      : '⚠️ ยังไม่ได้จ่ายยา — คะแนนยาจะถูกหัก';
  }

  await _initCounseling();
}

// ── Step 3: Counseling ─────────────────────────────────────────

async function _initCounseling() {
  const opening = 'โอเครับ จะขอแนะนำยาและวิธีใช้ยาให้นะครับ';
  _counselingHistory.push({ role: 'user', text: opening });
  _addMsg('counsel-messages', 'user', opening);
  _lockInput(true, 'counsel-input', 'send-counsel-btn');
  _showTyping('counsel-messages');

  try {
    const sysPrompt = buildCounselingPrompt(_caseData, _dispensedDrugs);
    const reply     = await geminiChat(sysPrompt, [], opening);
    _hideTyping('counsel-messages');
    _counselingHistory.push({ role: 'model', text: reply });
    _addMsg('counsel-messages', 'model', reply);
    if (_ttsEnabled) _speak(reply);
    updateSessionCounseling(_session.id, _counselingHistory).catch(() => {});
  } catch (e) {
    _hideTyping('counsel-messages');
    _addMsg('counsel-messages', 'system', `⚠️ เชื่อมต่อ AI ล้มเหลว: ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'counsel-input', 'send-counsel-btn');
  }
}

async function _sendCounseling() {
  if (_aiTyping) return;
  const input = document.getElementById('counsel-input');
  const text  = (input?.value || '').trim();
  if (!text) return;

  input.value = '';
  _counselingHistory.push({ role: 'user', text });
  _addMsg('counsel-messages', 'user', text);
  _lockInput(true, 'counsel-input', 'send-counsel-btn');
  _showTyping('counsel-messages');

  try {
    const sysPrompt = buildCounselingPrompt(_caseData, _dispensedDrugs);
    const hist      = _toApiHistory(_counselingHistory.slice(0, -1));
    const reply     = await geminiChat(sysPrompt, hist, text);
    _hideTyping('counsel-messages');
    _counselingHistory.push({ role: 'model', text: reply });
    _addMsg('counsel-messages', 'model', reply);
    if (_ttsEnabled) _speak(reply);
    updateSessionCounseling(_session.id, _counselingHistory).catch(() => {});
  } catch (e) {
    _hideTyping('counsel-messages');
    _addMsg('counsel-messages', 'system', `⚠️ ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'counsel-input', 'send-counsel-btn');
  }
}

// ── Step 4: Evaluation ─────────────────────────────────────────

async function _goStep4() {
  _step = 4;
  _updateStepper();
  _synth?.cancel();
  try { await completeSession(_session.id, _session.startedAt); } catch (_) {}
  await _runEval();
}

async function _runEval() {
  // Reset eval card to loading state in case of retry
  const card = document.getElementById('eval-card');
  if (card) card.innerHTML = `
    <div style="font-size:2.5rem;">📊</div>
    <h3 class="mt-1">กำลังประเมินผล…</h3>
    <p class="text-dim text-sm mt-1">AI อาจารย์กำลังวิเคราะห์บทสนทนาและการจ่ายยา กรุณารอสักครู่</p>
    <div class="mt-2"><span class="spinner"></span></div>`;

  try {
    const prompt  = buildEvalPrompt(_caseData, _chatHistory, _dispensedDrugs, _counselingHistory);
    const raw     = await geminiComplete(prompt);
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const evalJson = JSON.parse(cleaned);

    const user   = getCurrentUser();
    const result = await saveResult(_session.id, user.uid, evalJson);
    Router.go('summary', { sessionId: _session.id, resultId: result.id });

  } catch (e) {
    if (card) card.innerHTML = `
      <div class="alert alert-error mb-2">ประเมินผลล้มเหลว: ${_esc(e.message)}</div>
      <p class="text-dim text-sm mb-2">กรุณาลองใหม่ หรือกดข้ามเพื่อดูผลบางส่วน</p>
      <button class="btn btn-primary" id="retry-eval-btn">ลองอีกครั้ง</button>`;
    document.getElementById('retry-eval-btn')?.addEventListener('click', _runEval);
  }
}

// ── Message Helpers ────────────────────────────────────────────

function _addMsg(containerId, role, text) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const el = document.createElement('div');

  if (role === 'system') {
    el.className   = 'msg msg-system';
    el.textContent = text;
  } else {
    const label = role === 'user'
      ? 'คุณ (เภสัชกร)'
      : (_caseData?.name || 'ผู้ป่วย');
    el.className  = `msg msg-${role === 'user' ? 'user' : 'patient'}`;
    el.innerHTML  = `<div class="msg-name">${label}</div><div>${_esc(text)}</div>`;
  }

  wrap.appendChild(el);
  wrap.scrollTop = wrap.scrollHeight;
}

function _showTyping(containerId) {
  _aiTyping = true;
  const wrap = document.getElementById(containerId);
  if (!wrap || wrap.querySelector('.msg-typing')) return;
  const el = document.createElement('div');
  el.className = 'msg msg-patient msg-typing';
  el.innerHTML = `<div class="msg-name">${_caseData?.name || 'ผู้ป่วย'}</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
  wrap.appendChild(el);
  wrap.scrollTop = wrap.scrollHeight;
}

function _hideTyping(containerId) {
  document.getElementById(containerId)?.querySelector('.msg-typing')?.remove();
}

function _lockInput(locked, inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (inp) inp.disabled = locked;
  if (btn) btn.disabled = locked;
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function _toApiHistory(history) {
  return history.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
}

// ── Voice Input ────────────────────────────────────────────────

function _toggleVoice(inputId, btnId) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert('เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');
    return;
  }

  const btn = document.getElementById(btnId);

  if (_recognition) {
    _recognition.stop();
    _recognition = null;
    btn?.classList.remove('listening');
    return;
  }

  _recognition = new SpeechRec();
  _recognition.lang            = 'th-TH';
  _recognition.interimResults  = false;
  _recognition.maxAlternatives = 1;
  btn?.classList.add('listening');

  _recognition.onresult = e => {
    const input = document.getElementById(inputId);
    if (input) input.value = e.results[0][0].transcript;
  };
  _recognition.onend   = () => { btn?.classList.remove('listening'); _recognition = null; };
  _recognition.onerror = () => { btn?.classList.remove('listening'); _recognition = null; };
  _recognition.start();
}

// ── TTS ────────────────────────────────────────────────────────

function _speak(text) {
  if (!_synth || !_ttsEnabled) return;
  _synth.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = 'th-TH';
  utt.rate   = 1.0;
  utt.pitch  = _caseData?.gender === 'female' ? 1.2 : 0.9;
  _synth.speak(utt);
}
