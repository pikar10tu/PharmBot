// ============================================================
//  gemini-tts.js — Text-to-Speech via gemini-3.1-flash-tts-preview
//
//  Public API:
//    async geminiTTS(text, voiceName)  → plays audio, resolves when done
//    geminiTTSStop()                   → interrupt current playback
//    getVoiceForGender(gender)         → 'Kore' | 'Puck'
//
//  Requires : getGeminiKey() from gemini.js
//  Reuses   : _b64ToPcm16(), _pcm16ToF32() from gemini-live.js (module-level)
// ============================================================

let _ttsAudioCtx = null;
let _ttsSource   = null;

// ── Public helpers ────────────────────────────────────────────

function getVoiceForGender(gender) {
  return gender === 'male' ? 'Puck' : 'Kore';
}

// Play text as AI voice. Resolves when audio finishes.
// voiceName options: 'Kore' (female calm), 'Puck' (male clear),
//   'Aoede' (female warm), 'Zephyr' (male relaxed), 'Leda' (female)
async function geminiTTS(text, voiceName = 'Kore') {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not loaded');

  // Stop any current playback first
  geminiTTSStop();

  const url  = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  };

  let resp = await _ttsFetch(url, body);

  // Auto-retry once on 503 / 429
  if (resp.status === 503 || resp.status === 429) {
    console.warn(`geminiTTS: ${resp.status} — retrying in 4s`);
    await new Promise(r => setTimeout(r, 4000));
    resp = await _ttsFetch(url, body);
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`TTS API ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data       = await resp.json();
  const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('TTS: ไม่ได้รับข้อมูลเสียงจาก API');

  console.log(`geminiTTS: received audio (${Math.round(inlineData.data.length * 3/4)} bytes PCM)`);
  return _playPcm16(inlineData.data);
}

// Stop any currently playing TTS audio immediately.
function geminiTTSStop() {
  try {
    if (_ttsSource) {
      _ttsSource.onended = null;
      _ttsSource.stop();
    }
  } catch (_) {}
  try {
    if (_ttsAudioCtx && _ttsAudioCtx.state !== 'closed') {
      _ttsAudioCtx.close();
    }
  } catch (_) {}
  _ttsSource   = null;
  _ttsAudioCtx = null;
}

// ── Internal ──────────────────────────────────────────────────

function _ttsFetch(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// Decode base64 PCM16 and play via Web Audio API (24 kHz).
// Returns Promise that resolves when playback ends.
function _playPcm16(b64) {
  return new Promise((resolve, reject) => {
    try {
      // Reuse decode helpers defined in gemini-live.js (module-level functions)
      const pcm16   = _b64ToPcm16(b64);
      const float32 = _pcm16ToF32(pcm16);

      _ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const buf    = _ttsAudioCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);

      _ttsSource        = _ttsAudioCtx.createBufferSource();
      _ttsSource.buffer = buf;
      _ttsSource.connect(_ttsAudioCtx.destination);

      _ttsSource.onended = () => {
        _ttsSource   = null;
        _ttsAudioCtx = null;
        resolve();
      };

      _ttsSource.start(0);
    } catch (e) {
      reject(e);
    }
  });
}
