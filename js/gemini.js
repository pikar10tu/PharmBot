// ============================================================
//  gemini.js — Gemini API client
//  API key is fetched from Firestore /config/gemini after login
// ============================================================

let _geminiKey   = null;
let _geminiModel = 'gemini-2.5-flash';

function setGeminiConfig(apiKey, model) {
  _geminiKey   = apiKey;
  _geminiModel = model || 'gemini-2.5-flash';
}

function clearGeminiConfig() {
  _geminiKey   = null;
  _geminiModel = 'gemini-2.5-flash';
}

// Expose key for Gemini Live client (read-only accessor)
function getGeminiKey() { return _geminiKey; }

// Send a single-turn completion (used for evaluation)
async function geminiComplete(prompt) {
  if (!_geminiKey) throw new Error('Gemini API key not loaded');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${_geminiModel}:generateContent?key=${_geminiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Send a multi-turn chat (history + new message)
// history: [{role: 'user'|'model', parts: [{text}]}]
async function geminiChat(systemPrompt, history, userMessage) {
  if (!_geminiKey) throw new Error('Gemini API key not loaded');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${_geminiModel}:generateContent?key=${_geminiKey}`;

  // Gemini uses system_instruction separately
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
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
    const { apiKey, model } = snap.data();
    if (!apiKey) {
      console.warn('loadGeminiConfig: apiKey field is empty');
      return;
    }
    setGeminiConfig(apiKey, model);
    console.log('loadGeminiConfig: loaded OK');
  } catch (e) {
    // Do NOT re-throw — a missing/inaccessible Gemini config must not block login
    console.error('loadGeminiConfig failed (non-fatal):', e.message);
  }
}
