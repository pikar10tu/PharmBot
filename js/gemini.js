// ============================================================
//  gemini.js — Gemini API client
//  API key is fetched from Firestore /config/gemini after login
// ============================================================

let _geminiKey   = null;
let _geminiModel = 'gemini-2.5-flash';   // patient simulation (Steps 1, 3)
let _evalModel   = 'gemini-2.5-flash';   // evaluation (Step 4) — may differ from patient

function setGeminiConfig(apiKey, model, evalModel) {
  _geminiKey   = apiKey;
  _geminiModel = model || 'gemini-2.5-flash';
  _evalModel   = evalModel || _geminiModel;   // fallback to patient model if evalModel not set
}

function clearGeminiConfig() {
  _geminiKey   = null;
  _geminiModel = 'gemini-2.5-flash';
  _evalModel   = 'gemini-2.5-flash';
}

// Expose key for Gemini Live client (read-only accessor)
function getGeminiKey() { return _geminiKey; }
// Expose eval model (read-only accessor)
function getEvalModel() { return _evalModel; }

// Send a single-turn completion (used for evaluation)
async function geminiComplete(prompt, _retry = 1) {
  if (!_geminiKey) throw new Error('Gemini API key not loaded');
  // Evaluation uses _evalModel (may be a stronger/thinking model than the patient model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${_evalModel}:generateContent?key=${_geminiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0   // เป็น 0 เพื่อให้คะแนนคงที่/ทำซ้ำได้สูงสุด (reproducible)
      // thinking left at model default — eval benefits from reasoning before scoring (reasoning field)
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Gemini error ${res.status}`;
    if (_retry > 0 && (res.status === 503 || res.status === 429)) {
      await new Promise(r => setTimeout(r, 4000));
      return geminiComplete(prompt, _retry - 1);
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Send a multi-turn chat (history + new message)
// history: [{role: 'user'|'model', parts: [{text}]}]
// options: { maxOutputTokens: 300, historyTurns: 12 } — voice mode passes lower values for speed
async function geminiChat(systemPrompt, history, userMessage, options = {}, _retry = 1) {
  if (!_geminiKey) throw new Error('Gemini API key not loaded');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${_geminiModel}:generateContent?key=${_geminiKey}`;

  const { maxOutputTokens = 300, historyTurns = 12 } = options;

  // Keep only last N turns to limit token usage on long conversations
  const trimmedHistory = history.slice(-historyTurns);

  const contents = [
    ...trimmedHistory,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.6,   // ลดจาก 0.8 → ผู้ป่วยสม่ำเสมอขึ้น (มาตรฐานต่อผู้เข้าร่วม) แต่ยังเป็นธรรมชาติ
      maxOutputTokens,
      // Disable thinking on gemini-2.5-flash — not needed for roleplay, saves tokens & latency
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `Gemini error ${res.status}`;
    // Auto-retry once on transient server errors (503 / high demand)
    if (_retry > 0 && (res.status === 503 || res.status === 429)) {
      await new Promise(r => setTimeout(r, 4000));
      return geminiChat(systemPrompt, history, userMessage, options, _retry - 1);
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Load Gemini config from Firestore (called right after login)
// Does NOT throw — login should succeed even if Gemini config is unavailable
async function loadGeminiConfig() {
  try {
    const snap = await db.collection('config').doc('gemini').get();
    if (!snap.exists) {
      console.warn('loadGeminiConfig: /config/gemini document not found');
      return;
    }
    const { apiKey, model, evalModel } = snap.data();
    if (!apiKey) {
      console.warn('loadGeminiConfig: apiKey field is empty');
      return;
    }
    setGeminiConfig(apiKey, model, evalModel);
    console.log('loadGeminiConfig: loaded OK');
  } catch (e) {
    // Do NOT re-throw — a missing/inaccessible Gemini config must not block login
    console.error('loadGeminiConfig failed (non-fatal):', e.message);
  }
}
