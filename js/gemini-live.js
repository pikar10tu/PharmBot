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

      // v1beta is the recommended endpoint for BidiGenerateContent
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      this._ws = new WebSocket(url);

      this._ws.onopen = () => {
        // gemini-3.1-flash-live-preview on v1beta — snake_case required
      console.log('GeminiLive → sending setup (v1beta, snake_case)');
      this._send({
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
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
            }
          }
        });
      };

      // Timeout: if setupComplete not received in 20s, fail gracefully
      const _setupTimer = setTimeout(() => {
        if (!this._connected) {
          console.warn('GeminiLive: setup timeout (no setupComplete in 20s)');
          this.onError?.('เชื่อมต่อ Gemini Live timeout — ไม่ได้รับการตอบสนองจาก server');
          this.disconnect();
          reject(new Error('GeminiLive setup timeout'));
        }
      }, 20000);

      this._ws.onmessage = (evt) => {
        this._handleMessage(evt.data, () => { clearTimeout(_setupTimer); resolve(); });
      };

      this._ws.onerror = (evt) => {
        console.error('GeminiLive WS error:', evt);
        const msg = 'Gemini Live: ไม่สามารถเชื่อมต่อ WebSocket ได้';
        this.onError?.(msg);
        reject(new Error(msg));
      };

      this._ws.onclose = (evt) => {
        this._connected = false;
        // Log close reason so we can diagnose protocol issues
        console.warn(`GeminiLive WS closed: code=${evt.code} reason="${evt.reason}" wasClean=${evt.wasClean}`);
        if (evt.code !== 1000 && evt.code !== 1001) {
          const detail = evt.reason ? `: ${evt.reason}` : ` (code ${evt.code})`;
          this.onError?.(`Gemini Live ปิดการเชื่อมต่อ${detail}`);
        }
        this.onStateChange?.('disconnected');
      };
    });
  }

  // ── Send text turn (trigger initial greeting or inject text) ─
  sendText(text) {
    // ✅ Fix 5: client_content → realtimeInput.text (v1beta format)
    this._send({
      realtimeInput: { text }
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
      // ✅ Fix 6: realtime_input.media_chunks → realtimeInput.audio (v1beta format)
      this._send({
        realtimeInput: {
          audio: { data: b64, mimeType: 'audio/pcm;rate=16000' }
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

    // Log every server message (first 300 chars) for diagnostics
    console.log('GeminiLive ←', JSON.stringify(data).slice(0, 300));

    // ── Setup complete (handle both camelCase and snake_case) ──
    if (data.setupComplete !== undefined || data.setup_complete !== undefined) {
      this._connected = true;
      setupResolve?.();
      this.onStateChange?.('ready');
      return;
    }

    // Support both camelCase (v1beta) and snake_case (v1alpha) field names
    const sc = data.serverContent || data.server_content;
    if (!sc) return;

    // ── Audio from model ──
    const modelTurn = sc.modelTurn || sc.model_turn;
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData?.data) {
          this._scheduleAudio(inlineData.data);
          this.onStateChange?.('ai-speaking');
        }
      }
    }

    // ── User speech transcript ──
    const inputTx = sc.inputTranscription || sc.input_transcription;
    if (inputTx?.text) {
      this.onUserTranscript?.(inputTx.text.trim());
    }

    // ── Model speech transcript ──
    const outputTx = sc.outputTranscription || sc.output_transcription;
    if (outputTx?.text) {
      this._pendingModelText += outputTx.text;
    }

    // ── Turn complete ──
    if (sc.turnComplete || sc.turn_complete) {
      if (this._pendingModelText.trim()) {
        this.onModelTranscript?.(this._pendingModelText.trim());
        this._pendingModelText = '';
      }
      this.onStateChange?.('listening');
    }

    // ── Barge-in ──
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
