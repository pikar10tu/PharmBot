// ============================================================
//  gemini-live.js — Gemini Live API client (WebSocket)
//  Real-time bidirectional voice conversation
//
//  Usage:
//    const client = new GeminiLiveClient();
//    client.onUserTranscript  = (text) => { ... }
//    client.onModelTranscript = (text) => { ... }
//    client.onStateChange     = (state) => { ... }
//    client.onError           = (msg)   => { ... }
//    await client.connect(apiKey, systemPrompt, voiceName);
//    await client.startMic();
//    client.sendText('สวัสดีครับ');   // trigger initial response
//    client.disconnect();
// ============================================================

class GeminiLiveClient {
  constructor() {
    this._ws           = null;
    this._audioCtx     = null;   // playback AudioContext (24 kHz)
    this._micCtx       = null;   // capture AudioContext  (16 kHz)
    this._mediaStream  = null;
    this._processor    = null;
    this._nextPlayTime = 0;
    this._connected    = false;

    // Pending transcript accumulation (model turn)
    this._pendingModelText = '';

    // ── Public callbacks ──────────────────────────────────────
    this.onUserTranscript  = null;  // (text: string) => void
    this.onModelTranscript = null;  // (text: string) => void
    // state: 'connecting' | 'ready' | 'ai-speaking' | 'listening' | 'disconnected'
    this.onStateChange     = null;  // (state: string) => void
    this.onError           = null;  // (message: string) => void
  }

  // ── Connect ──────────────────────────────────────────────────
  // voiceName: 'Aoede' (female) | 'Puck' (male) | 'Charon' | 'Fenrir' | 'Kore'
  connect(apiKey, systemPrompt, voiceName = 'Aoede') {
    return new Promise((resolve, reject) => {
      this.onStateChange?.('connecting');

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      this._ws = new WebSocket(url);

      this._ws.onopen = () => {
        this._send({
          setup: {
            model: 'models/gemini-2.5-flash-native-audio-latest',
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: { voice_name: voiceName }
                }
              }
            },
            system_instruction: {
              parts: [{ text: systemPrompt }]
            },
            input_audio_transcription:  {},
            output_audio_transcription: {}
          }
        });
      };

      this._ws.onmessage = (evt) => {
        this._handleMessage(evt.data, resolve);
      };

      this._ws.onerror = () => {
        const msg = 'Gemini Live: ไม่สามารถเชื่อมต่อ WebSocket ได้';
        this.onError?.(msg);
        reject(new Error(msg));
      };

      this._ws.onclose = () => {
        this._connected = false;
        this.onStateChange?.('disconnected');
      };
    });
  }

  // ── Send text turn (trigger initial greeting or inject text) ─
  sendText(text) {
    this._send({
      client_content: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turn_complete: true
      }
    });
  }

  // ── Microphone input ─────────────────────────────────────────
  async startMic() {
    if (this._mediaStream) return; // already running

    try {
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      throw new Error('ไม่สามารถเข้าถึงไมโครโฟนได้: ' + e.message);
    }

    // Use 16 kHz for Gemini Live input requirement
    this._micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

    const source   = this._micCtx.createMediaStreamSource(this._mediaStream);
    this._processor = this._micCtx.createScriptProcessor(2048, 1, 1);

    // Muted gain node — required to drive ScriptProcessor without loopback
    const silence = this._micCtx.createGain();
    silence.gain.value = 0;

    this._processor.onaudioprocess = (e) => {
      if (!this._connected || this._ws?.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const b64 = _f32ToB64Pcm16(f32);
      this._send({
        realtime_input: {
          media_chunks: [{ data: b64, mime_type: 'audio/pcm;rate=16000' }]
        }
      });
    };

    source.connect(this._processor);
    this._processor.connect(silence);
    silence.connect(this._micCtx.destination);
  }

  stopMic() {
    try {
      this._processor?.disconnect();
      this._mediaStream?.getTracks().forEach(t => t.stop());
      if (this._micCtx?.state !== 'closed') this._micCtx?.close();
    } catch (_) {}
    this._processor   = null;
    this._mediaStream = null;
    this._micCtx      = null;
  }

  // ── Disconnect ───────────────────────────────────────────────
  disconnect() {
    this.stopMic();
    this._stopPlayback();
    if (this._ws) {
      this._ws.onclose = null; // suppress state callback
      this._ws.onerror = null;
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }
    this._connected = false;
    this.onStateChange?.('disconnected');
  }

  // ── Internal: message handler ─────────────────────────────────
  _handleMessage(raw, setupResolve) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    // ── Setup complete ──
    if (data.setupComplete !== undefined) {
      this._connected = true;
      setupResolve?.();
      this.onStateChange?.('ready');
      return;
    }

    const sc = data.serverContent;
    if (!sc) return;

    // ── Audio from model ──
    if (sc.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.inlineData?.data) {
          this._scheduleAudio(part.inlineData.data);
          this.onStateChange?.('ai-speaking');
        }
      }
    }

    // ── User speech transcript (arrives before model reply) ──
    if (sc.inputTranscription?.text) {
      this.onUserTranscript?.(sc.inputTranscription.text.trim());
    }

    // ── Model speech transcript (accumulate until turn complete) ──
    if (sc.outputTranscription?.text) {
      this._pendingModelText += sc.outputTranscription.text;
    }

    // ── Turn complete: emit model transcript ──
    if (sc.turnComplete) {
      if (this._pendingModelText.trim()) {
        this.onModelTranscript?.(this._pendingModelText.trim());
        this._pendingModelText = '';
      }
      this.onStateChange?.('listening');
    }

    // ── Barge-in: user interrupted AI ──
    if (sc.interrupted) {
      this._pendingModelText = '';
      this._stopPlayback();
    }
  }

  // ── Internal: schedule audio playback (gapless) ───────────────
  _scheduleAudio(b64) {
    if (!this._audioCtx || this._audioCtx.state === 'closed') {
      this._audioCtx    = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      this._nextPlayTime = 0;
    }

    try {
      const pcm16   = _b64ToPcm16(b64);
      const float32 = _pcm16ToF32(pcm16);
      const buf     = this._audioCtx.createBuffer(1, float32.length, 24000);
      buf.copyToChannel(float32, 0);

      const src = this._audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this._audioCtx.destination);

      const start = Math.max(this._audioCtx.currentTime + 0.02, this._nextPlayTime);
      src.start(start);
      this._nextPlayTime = start + buf.duration;
    } catch (e) {
      console.warn('GeminiLive audio schedule error:', e.message);
    }
  }

  _stopPlayback() {
    try {
      if (this._audioCtx && this._audioCtx.state !== 'closed') {
        this._audioCtx.close();
      }
    } catch (_) {}
    this._audioCtx    = null;
    this._nextPlayTime = 0;
  }

  // ── Internal: send JSON over WebSocket ───────────────────────
  _send(obj) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }
}

// ── Audio helpers (module-level, no class) ────────────────────

function _f32ToB64Pcm16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i]  = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return _bufToB64(out.buffer);
}

function _b64ToPcm16(b64) {
  const bin = atob(b64);
  const ab  = new ArrayBuffer(bin.length);
  const u8  = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(ab);
}

function _pcm16ToF32(int16) {
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768.0;
  return out;
}

function _bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
