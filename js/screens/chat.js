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
let _recognition       = null;   // push-to-talk SpeechRecognition (text mode)
let _voiceRecognition  = null;   // continuous SpeechRecognition (voice tab mode)
let _voiceMode         = false;  // true = voice tab active
let _voicePanelStep    = 0;      // which panel is in voice mode (1 or 3)
let _liveClient        = null;   // GeminiLiveClient instance (Live API voice mode)
let _liveMode          = false;  // true = Live API active, false = Web Speech fallback

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
  try { _voiceRecognition?.abort(); } catch (_) {}
  geminiTTSStop();
  _caseData = null; _session = null; _step = 1;
  _chatHistory = []; _counselingHistory = []; _dispensedDrugs = [];
  _aiTyping = false; _ttsEnabled = false; _recognition = null;
  _voiceRecognition = null; _voiceMode = false; _voicePanelStep = 0;
  if (_liveClient) { try { _liveClient.disconnect(); } catch (_) {} _liveClient = null; }
  _liveMode = false;

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in" style="max-width:720px;">
      <div class="text-center p-3"><span class="spinner"></span> กำลังโหลดเคส…</div>
    </div>`;

  try {
    const rawCase = await getCaseById(caseId);
    if (!rawCase) { Router.go('groups'); return; }

    _caseData = randomizePatientData(rawCase);

    // Rate-limit double-check before consuming a slot (admin is exempt)
    const isAdmin = profile?.role === 'admin';
    if (!isAdmin) {
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

        <!-- Mode toggle bar -->
        <div class="voice-mode-bar mb-2">
          <button class="voice-mode-tab active" id="tab-text-1" onclick="_switchMode(1,'text')">💬 ข้อความ</button>
          <button class="voice-mode-tab" id="tab-voice-1" onclick="_switchMode(1,'voice')">🎙️ สนทนาเสียง</button>
        </div>

        <!-- Chat messages (shared by both modes) -->
        <div class="chat-wrap" style="border:1px solid var(--glass-border);border-radius:var(--radius);background:rgba(255,255,255,0.03);">
          <div class="chat-messages" id="chat-messages"></div>

          <!-- Text input row (text mode) -->
          <div id="text-input-row-1" class="chat-input-row">
            <input class="input chat-input" id="chat-input" type="text"
              placeholder="พิมพ์ข้อความหรือกดไมค์…" autocomplete="off" />
            <button class="btn-mic" id="mic-btn" title="Push to Talk (กดพูด)">🎤</button>
            <button class="btn btn-primary btn-sm" id="send-btn">ส่ง</button>
          </div>

          <!-- Voice status row (voice mode) -->
          <div id="voice-input-row-1" class="voice-input-row hidden">
            <div class="voice-waveform" id="waveform-1">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="voice-status-text" id="voice-status-1">⏳ กำลังเชื่อมต่อ…</div>
          </div>
        </div>

        <div class="flex items-center mt-2" style="justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <label class="flex items-center gap-1 text-sm text-dim" id="tts-label" style="cursor:pointer;">
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

        <!-- Mode toggle bar -->
        <div class="voice-mode-bar mb-2">
          <button class="voice-mode-tab active" id="tab-text-3" onclick="_switchMode(3,'text')">💬 ข้อความ</button>
          <button class="voice-mode-tab" id="tab-voice-3" onclick="_switchMode(3,'voice')">🎙️ สนทนาเสียง</button>
        </div>

        <div class="chat-wrap" style="border:1px solid var(--glass-border);border-radius:var(--radius);background:rgba(255,255,255,0.03);">
          <div class="chat-messages" id="counsel-messages"></div>

          <!-- Text input row -->
          <div id="text-input-row-3" class="chat-input-row">
            <input class="input chat-input" id="counsel-input" type="text"
              placeholder="อธิบายยาและคำแนะนำให้ผู้ป่วย…" autocomplete="off" />
            <button class="btn-mic" id="mic-btn-3" title="Push to Talk">🎤</button>
            <button class="btn btn-primary btn-sm" id="send-counsel-btn">ส่ง</button>
          </div>

          <!-- Voice status row -->
          <div id="voice-input-row-3" class="voice-input-row hidden">
            <div class="voice-waveform" id="waveform-3">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="voice-status-text" id="voice-status-3">⏳ กำลังเชื่อมต่อ…</div>
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

// ── Voice Mode (Web Speech STT + Gemini TTS) ──────────────────

async function _switchMode(panelStep, mode) {
  // Update tab UI
  const textTab  = document.getElementById(`tab-text-${panelStep}`);
  const voiceTab = document.getElementById(`tab-voice-${panelStep}`);
  const textRow  = document.getElementById(`text-input-row-${panelStep}`);
  const voiceRow = document.getElementById(`voice-input-row-${panelStep}`);
  const ttsLabel = document.getElementById('tts-label'); // only panel 1

  if (mode === 'voice') {
    textTab?.classList.remove('active');
    voiceTab?.classList.add('active');
    textRow?.classList.add('hidden');
    voiceRow?.classList.remove('hidden');
    if (ttsLabel) ttsLabel.style.visibility = 'hidden';
    _startVoice(panelStep).catch(e => console.warn('_startVoice error:', e.message));
  } else {
    voiceTab?.classList.remove('active');
    textTab?.classList.add('active');
    voiceRow?.classList.add('hidden');
    textRow?.classList.remove('hidden');
    if (ttsLabel) ttsLabel.style.visibility = '';
    _stopVoice();
  }
}

async function _startVoice(panelStep) {
  const msgId  = panelStep === 1 ? 'chat-messages' : 'counsel-messages';
  const apiKey = getGeminiKey();

  // Clean up any previous instances
  try { _voiceRecognition?.abort(); } catch (_) {}
  if (_liveClient) { try { _liveClient.disconnect(); } catch (_) {} _liveClient = null; }
  geminiTTSStop();

  _voiceMode      = true;
  _voicePanelStep = panelStep;
  _liveMode       = false;
  _setVoiceStatus(panelStep, '⏳ กำลังเชื่อมต่อ…', false);

  // ── Try Gemini Live API first ──────────────────────────────
  if (apiKey) {
    const sysPrompt = panelStep === 1
      ? buildSystemPrompt(_caseData)
      : buildCounselingPrompt(_caseData, _dispensedDrugs);
    const voiceName = _caseData?.gender === 'male' ? 'Puck' : 'Aoede';
    const client    = new GeminiLiveClient();

    client.onStateChange = (state) => {
      if (!_voiceMode || _voicePanelStep !== panelStep) return;
      const labels = {
        connecting:    '⏳ กำลังเชื่อมต่อ…',
        ready:         '🎙️ กำลังฟัง…',
        'ai-speaking': '🔊 ผู้ป่วยกำลังพูด…',
        listening:     '🎙️ กำลังฟัง…',
        disconnected:  '🔌 ยกเลิกการเชื่อมต่อ',
      };
      const wv = document.getElementById(`waveform-${panelStep}`);
      _setVoiceStatus(panelStep, labels[state] || state, state === 'ai-speaking');
      if (wv) {
        wv.classList.toggle('wave-ai',    state === 'ai-speaking');
        wv.classList.toggle('wave-active', state === 'listening' || state === 'ready');
      }
    };

    client.onUserTranscript = (text) => {
      if (!text || !_voiceMode) return;
      const hist = panelStep === 1 ? _chatHistory : _counselingHistory;
      hist.push({ role: 'user', text });
      _addMsg(msgId, 'user', text);
    };

    client.onModelTranscript = (text) => {
      if (!text || !_voiceMode) return;
      const hist = panelStep === 1 ? _chatHistory : _counselingHistory;
      hist.push({ role: 'model', text });
      _addMsg(msgId, 'model', text);
      if (panelStep === 1) updateSessionChat(_session.id, _chatHistory).catch(() => {});
      else                 updateSessionCounseling(_session.id, _counselingHistory).catch(() => {});
    };

    client.onError = (errMsg) => {
      if (!_liveMode || !_voiceMode || _voicePanelStep !== panelStep) return;
      console.warn('GeminiLive error, falling back to Web Speech:', errMsg);
      _addMsg(msgId, 'system', '⚠️ Live API ไม่พร้อมใช้ — สลับไป Web Speech');
      try { _liveClient?.disconnect(); } catch (_) {}
      _liveClient = null;
      _liveMode   = false;
      _startVoiceWebSpeech(panelStep);
    };

    try {
      await client.connect(apiKey, sysPrompt, voiceName);
      await client.startMic();
      // Guard: user may have switched back to text mode during the async connect
      if (!_voiceMode || _voicePanelStep !== panelStep) { client.disconnect(); return; }
      _liveClient = client;
      _liveMode   = true;
      return;
    } catch (e) {
      console.warn('GeminiLive connect failed, falling back to Web Speech:', e.message);
      try { client.disconnect(); } catch (_) {}
      if (!_voiceMode || _voicePanelStep !== panelStep) return; // already switched off
      _addMsg(msgId, 'system', '⚠️ Live API ไม่พร้อมใช้ — สลับไป Web Speech');
    }
  }

  // ── Fallback: Web Speech STT + Gemini TTS ─────────────────
  if (_voiceMode && _voicePanelStep === panelStep) _startVoiceWebSpeech(panelStep);
}

function _startVoiceWebSpeech(panelStep) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const msgId     = panelStep === 1 ? 'chat-messages' : 'counsel-messages';

  if (!SpeechRec) {
    _addMsg(msgId, 'system', '⚠️ เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');
    _switchMode(panelStep, 'text');
    return;
  }

  _setVoiceStatus(panelStep, '🎙️ กำลังฟัง…', false);

  _voiceRecognition = new SpeechRec();
  _voiceRecognition.lang            = 'th-TH';
  _voiceRecognition.continuous      = true;
  _voiceRecognition.interimResults  = false;
  _voiceRecognition.maxAlternatives = 1;

  _voiceRecognition.onresult = (e) => {
    const text = e.results[e.results.length - 1][0].transcript.trim();
    if (!text || _aiTyping) return;

    const inputId = panelStep === 1 ? 'chat-input' : 'counsel-input';
    const inp = document.getElementById(inputId);
    if (inp) inp.value = text;

    if (panelStep === 1) _sendChat();
    else                 _sendCounseling();
  };

  _voiceRecognition.onerror = (e) => {
    if (e.error === 'no-speech') return; // normal — onend will restart
    console.warn('SpeechRecognition error:', e.error);
    if (_voiceMode) _setVoiceStatus(panelStep, `⚠️ ไม่สามารถรับเสียงได้ (${e.error})`, false);
  };

  _voiceRecognition.onend = () => {
    // Auto-restart unless AI is processing or voice mode was turned off
    if (_voiceMode && !_liveMode && !_aiTyping) {
      try { _voiceRecognition.start(); } catch (_) {}
    }
  };

  try {
    _voiceRecognition.start();
  } catch (e) {
    _addMsg(msgId, 'system', `⚠️ ไม่สามารถเริ่มรับเสียงได้: ${e.message}`);
    _switchMode(panelStep, 'text');
  }
}

function _stopVoice() {
  _voiceMode      = false;
  _voicePanelStep = 0;
  _liveMode       = false;
  if (_liveClient) { try { _liveClient.disconnect(); } catch (_) {} _liveClient = null; }
  try { _voiceRecognition?.abort(); } catch (_) {}
  _voiceRecognition = null;
  geminiTTSStop();
}

function _setVoiceStatus(panelStep, text, animate) {
  const el = document.getElementById(`voice-status-${panelStep}`);
  if (el) el.textContent = text;
  const wv = document.getElementById(`waveform-${panelStep}`);
  if (wv) wv.classList.toggle('wave-active', animate);
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
  _showTyping('chat-messages'); // also sets _aiTyping = true

  // Web Speech voice mode: stop recognition AFTER _aiTyping = true (prevents onend restart)
  if (_voiceMode && !_liveMode) {
    try { _voiceRecognition?.stop(); } catch (_) {}
    _setVoiceStatus(1, '⏳ กำลังคิด…', false);
  }

  try {
    const hist     = _toApiHistory(_chatHistory.slice(0, -1));
    const chatOpts = _voiceMode ? { maxOutputTokens: 150, historyTurns: 8 } : {};
    const reply    = await geminiChat(buildSystemPrompt(_caseData), hist, text, chatOpts);
    _hideTyping('chat-messages');
    _chatHistory.push({ role: 'model', text: reply });
    _addMsg('chat-messages', 'model', reply);

    if (_voiceMode && !_liveMode) {
      // Web Speech mode: play Gemini TTS, then recognition will restart via finally
      const waveform = document.getElementById('waveform-1');
      _setVoiceStatus(1, '🔊 ผู้ป่วยกำลังพูด…', false);
      waveform?.classList.add('wave-ai');
      waveform?.classList.remove('wave-active');
      const voiceName = getVoiceForGender(_caseData?.gender);
      await geminiTTS(reply, voiceName).catch(err => {
        console.warn('TTS error:', err.message);
        _setVoiceStatus(1, '⚠️ เล่นเสียงไม่ได้ — ดูข้อความด้านบน', false);
      });
      waveform?.classList.remove('wave-ai');
    } else if (_ttsEnabled) {
      _speak(reply);
    }

    updateSessionChat(_session.id, _chatHistory).catch(() => {});
  } catch (e) {
    _hideTyping('chat-messages');
    _addMsg('chat-messages', 'system', `⚠️ ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'chat-input', 'send-btn');
    // Web Speech voice mode: restart recognition now that AI is done
    if (_voiceMode && !_liveMode) {
      _setVoiceStatus(1, '🎙️ กำลังฟัง…', false);
      try { _voiceRecognition?.start(); } catch (_) {}
    }
  }
}

function _goStep2() {
  _stopVoice(); // stop voice mode if active
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
  if (_dispensedDrugs.length === 0) {
    if (!confirm('ยังไม่ได้เลือกยาเลย\nต้องการดำเนินการต่อโดยไม่จ่ายยาหรือไม่? (คะแนนยาจะเป็น 0)')) return;
  }
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
  _showTyping('counsel-messages'); // also sets _aiTyping = true

  // Web Speech voice mode: stop recognition AFTER _aiTyping = true (prevents onend restart)
  if (_voiceMode && !_liveMode) {
    try { _voiceRecognition?.stop(); } catch (_) {}
    _setVoiceStatus(3, '⏳ กำลังคิด…', false);
  }

  try {
    const sysPrompt   = buildCounselingPrompt(_caseData, _dispensedDrugs);
    const hist        = _toApiHistory(_counselingHistory.slice(0, -1));
    const counselOpts = _voiceMode ? { maxOutputTokens: 150, historyTurns: 8 } : {};
    const reply       = await geminiChat(sysPrompt, hist, text, counselOpts);
    _hideTyping('counsel-messages');
    _counselingHistory.push({ role: 'model', text: reply });
    _addMsg('counsel-messages', 'model', reply);

    if (_voiceMode && !_liveMode) {
      // Web Speech mode: play Gemini TTS, then recognition will restart via finally
      const waveform = document.getElementById('waveform-3');
      _setVoiceStatus(3, '🔊 ผู้ป่วยกำลังพูด…', false);
      waveform?.classList.add('wave-ai');
      waveform?.classList.remove('wave-active');
      const voiceName = getVoiceForGender(_caseData?.gender);
      await geminiTTS(reply, voiceName).catch(err => {
        console.warn('TTS error:', err.message);
        _setVoiceStatus(3, '⚠️ เล่นเสียงไม่ได้ — ดูข้อความด้านบน', false);
      });
      waveform?.classList.remove('wave-ai');
    } else if (_ttsEnabled) {
      _speak(reply);
    }

    updateSessionCounseling(_session.id, _counselingHistory).catch(() => {});
  } catch (e) {
    _hideTyping('counsel-messages');
    _addMsg('counsel-messages', 'system', `⚠️ ${e.message}`);
  } finally {
    _aiTyping = false;
    _lockInput(false, 'counsel-input', 'send-counsel-btn');
    // Web Speech voice mode: restart recognition now that AI is done
    if (_voiceMode && !_liveMode) {
      _setVoiceStatus(3, '🎙️ กำลังฟัง…', false);
      try { _voiceRecognition?.start(); } catch (_) {}
    }
  }
}

// ── Step 4: Evaluation ─────────────────────────────────────────

async function _goStep4() {
  _stopVoice(); // stop voice mode if active
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
    const result = await saveResult(_session.id, user.uid, evalJson, _caseData);
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
    const msgId = document.getElementById('counsel-messages') ? 'counsel-messages' : 'chat-messages';
    _addMsg(msgId, 'system', '⚠️ เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');
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
