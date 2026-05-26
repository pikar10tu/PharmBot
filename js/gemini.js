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
async function loadGeminiConfig() {
  try {
    const snap = await db.collection('config').doc('gemini').get();
    if (!snap.exists) throw new Error('Gemini config not found in Firestore');
    const { apiKey, model } = snap.data();
    setGeminiConfig(apiKey, model);
  } catch (e) {
    console.error('loadGeminiConfig:', e);
    throw e;
  }
}
