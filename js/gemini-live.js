// ============================================================
//  gemini-live.js — Gemini Live API client (WebSocket)
//  Real-time bidirectional voice conversation
//
//  Usage:
//    const client = new GeminiLiveClient();
//    client.onUserTranscript         = (text)  => { ... }
//    client.onModelTranscript        = (text)  => { ... }
//    client.onPartialModelTranscript = (chunk) => { ... }  // streaming
//    client.onStateChange            = (state) => { ... }
//    client.onError                  = (msg)   => { ... }
//    await client.connect(apiKey, systemPrompt, voiceName);
//    await client.startMic();
//    client.disconnect();
// ============================================================

class GeminiLiveClient {
  constructor() {
    this._ws          = null;
    this._audioCtx    = null;   // playback AudioContext (24 kHz)
    this._playNode    = null;   // AudioWorkletNode — playback
    this._micCtx      = null;   // capture AudioContext (16 kHz)
    this._captureNode = null;   // AudioWorkletNode — capture
    this._mediaStream = null;
    this._connected   = false;

    this._pendingModelText = '';
    this._resumptionToken  = null;

    // ── Public callbacks ──────────────────────────────────────
    this.onUserTranscript         = null;  // (text: string) => void
    this.onModelTranscript        = null;  // (text: string) => void — fired at turn end
    this.onPartialModelTranscript = null;  // (chunk: string) => void — streaming chunks
    // state: 'connecting' | 'ready' | 'ai-speaking' | 'listening' | 'disconnected'
    this.onStateChange            = null;  // (state: string) => void
    this.onError                  = null;  // (message: string) => void
    this.onSessionResumptionToken = null;  // (token: string) => void
  }

  // ── Connect ──────────────────────────────────────────────────
  // voiceName: 'Aoede' (female) | 'Puck' (male) | 'Charon' | 'Fenrir' | 'Kore'
  connect(apiKey, systemPrompt, voiceName = 'Aoede') {
    return new Promise((resolve, reject) => {
      this.onStateChange?.('connecting');

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      this._ws = new WebSocket(url);

      this._ws.onopen = () => {
        console.log('GeminiLive → setup (gemini-3.1-flash-live-preview / v1beta)');
        this._send({
          setup: {
            model: 'models/gemini-3.1-flash-live-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName }
                }
              },
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
          }
        });
      };

      const _setupTimer = setTimeout(() => {
        if (!this._connected) {
          console.warn('GeminiLive: setup timeout');
          this.onError?.('เชื่อมต่อ Gemini Live timeout');
          this.disconnect();
          reject(new Error('GeminiLive setup timeout'));
        }
      }, 20000);

      this._ws.onmessage = (evt) => {
        console.log('GeminiLive raw ←', typeof evt.data, String(evt.data).slice(0, 400));
        this._handleMessage(evt.data, () => { clearTimeout(_setupTimer); resolve(); });
      };

      this._ws.onerror = () => {
        const msg = 'Gemini Live: ไม่สามารถเชื่อมต่อ WebSocket ได้';
        this.onError?.(msg);
        reject(new Error(msg));
      };

      this._ws.onclose = (evt) => {
        this._connected = false;
        console.warn(`GeminiLive WS closed: code=${evt.code} reason="${evt.reason}"`);
        if (evt.code !== 1000 && evt.code !== 1001) {
          const detail = evt.reason ? `: ${evt.reason}` : ` (code ${evt.code})`;
          this.onError?.(`Gemini Live ปิดการเชื่อมต่อ${detail}`);
        }
        this.onStateChange?.('disconnected');
      };
    });
  }

  // ── Send text turn ────────────────────────────────────────────
  sendText(text) {
    this._send({ realtimeInput: { text } });
  }

  // ── Microphone input (AudioWorklet @ 16 kHz) ─────────────────
  async startMic() {
    if (this._mediaStream) return;

    try {
      this._mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
    } catch (e) {
      throw new Error('ไม่สามารถเข้าถึงไมโครโฟนได้: ' + e.message);
    }

    this._micCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

    try {
      // Load worklet — must be served from same origin
      await this._micCtx.audioWorklet.addModule('audio/capture.worklet.js');
      const source = this._micCtx.createMediaStreamSource(this._mediaStream);
      this._captureNode = new AudioWorkletNode(this._micCtx, 'capture-processor');

      this._captureNode.port.onmessage = (e) => {
        if (!this._connected || this._ws?.readyState !== WebSocket.OPEN) return;
        this._send({
          realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: _bufToB64(e.data) } }
        });
      };

      source.connect(this._captureNode);
      this._captureNode.connect(this._micCtx.destination);
    } catch (workletErr) {
      // Fallback: ScriptProcessor (deprecated but works if worklet fails to load)
      console.warn('AudioWorklet capture unavailable, falling back to ScriptProcessor:', workletErr.message);
      const source    = this._micCtx.createMediaStreamSource(this._mediaStream);
      const processor = this._micCtx.createScriptProcessor(2048, 1, 1);
      const silence   = this._micCtx.createGain();
      silence.gain.value = 0;
      processor.onaudioprocess = (e) => {
        if (!this._connected || this._ws?.readyState !== WebSocket.OPEN) return;
        this._send({
          realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: _f32ToB64Pcm16(e.inputBuffer.getChannelData(0)) } }
        });
      };
      source.connect(processor);
      processor.connect(silence);
      silence.connect(this._micCtx.destination);
      this._captureNode = processor; // store for cleanup
    }
  }

  stopMic() {
    // Flush any cached audio in the server's VAD buffer before stopping
    if (this._connected && this._ws?.readyState === WebSocket.OPEN) {
      this._send({ realtimeInput: { audioStreamEnd: true } });
    }
    try {
      this._captureNode?.disconnect();
      this._mediaStream?.getTracks().forEach(t => t.stop());
      if (this._micCtx?.state !== 'closed') this._micCtx?.close();
    } catch (_) {}
    this._captureNode = null;
    this._mediaStream = null;
    this._micCtx      = null;
  }

  // ── Playback control ──────────────────────────────────────────
  interruptPlayback() {
    try { this._playNode?.port.postMessage('clear'); } catch (_) {}
  }

  // ── Disconnect ────────────────────────────────────────────────
  disconnect() {
    this.stopMic();
    this._stopPlayback();
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onerror = null;
      try { this._ws.close(); } catch (_) {}
      this._ws = null;
    }
    this._connected = false;
    this.onStateChange?.('disconnected');
  }

  // ── Internal: lazy-init AudioWorklet playback ─────────────────
  async _setupPlayback() {
    if (this._audioCtx && this._audioCtx.state !== 'closed') return;
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    try {
      await this._audioCtx.audioWorklet.addModule('audio/playback.worklet.js');
      this._playNode = new AudioWorkletNode(this._audioCtx, 'playback-processor');
      this._playNode.connect(this._audioCtx.destination);
    } catch (workletErr) {
      console.warn('AudioWorklet playback unavailable, will use BufferSource fallback:', workletErr.message);
      this._playNode = null; // signals _scheduleAudio to use legacy path
    }
  }

  // ── Internal: schedule audio chunk for playback ───────────────
  async _scheduleAudio(b64) {
    await this._setupPlayback();
    const pcm16  = _b64ToPcm16(b64);
    const float32 = _pcm16ToF32(pcm16);

    if (this._playNode) {
      // AudioWorklet path — queue-based gapless playback
      this._playNode.port.postMessage(float32.buffer, [float32.buffer]);
    } else {
      // BufferSource fallback
      try {
        const buf = this._audioCtx.createBuffer(1, float32.length, 24000);
        buf.copyToChannel(float32, 0);
        const src = this._audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(this._audioCtx.destination);
        if (!this._nextPlayTime) this._nextPlayTime = 0;
        const start = Math.max(this._audioCtx.currentTime + 0.02, this._nextPlayTime);
        src.start(start);
        this._nextPlayTime = start + buf.duration;
      } catch (e) { console.warn('GeminiLive audio fallback error:', e.message); }
    }
  }

  _stopPlayback() {
    try {
      this._playNode?.port.postMessage('clear');
      this._playNode?.disconnect();
      if (this._audioCtx?.state !== 'closed') this._audioCtx?.close();
    } catch (_) {}
    this._audioCtx    = null;
    this._playNode    = null;
    this._nextPlayTime = 0;
  }

  // ── Internal: message handler ─────────────────────────────────
  _handleMessage(raw, setupResolve) {
    if (raw instanceof Blob) {
      raw.text().then(text => this._handleMessage(text, setupResolve));
      return;
    }
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    console.log('GeminiLive ←', JSON.stringify(data).slice(0, 300));

    // ── Setup complete ──
    if (data.setupComplete !== undefined || data.setup_complete !== undefined) {
      this._connected = true;
      setupResolve?.();
      this.onStateChange?.('ready');
      return;
    }

    // ── Session resumption token ──
    const resumptionUpdate = data.sessionResumptionUpdate || data.session_resumption_update;
    if (resumptionUpdate) {
      const token = resumptionUpdate.newHandle || resumptionUpdate.new_handle;
      if (token) { this._resumptionToken = token; this.onSessionResumptionToken?.(token); }
      return;
    }

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

    // ── Model speech transcript (streaming + final) ──
    const outputTx = sc.outputTranscription || sc.output_transcription;
    if (outputTx?.text) {
      this._pendingModelText += outputTx.text;
      this.onPartialModelTranscript?.(outputTx.text);
    }

    // ── Turn complete ──
    if (sc.turnComplete || sc.turn_complete) {
      if (this._pendingModelText.trim()) {
        this.onModelTranscript?.(this._pendingModelText.trim());
        this._pendingModelText = '';
      }
      this.onStateChange?.('listening');
    }

    // ── Barge-in: user interrupted model ──
    if (sc.interrupted) {
      this._pendingModelText = '';
      this.interruptPlayback();
    }
  }

  // ── Internal: send JSON over WebSocket ───────────────────────
  _send(obj) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }
}

// ── Audio helpers (module-level) ──────────────────────────────

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
