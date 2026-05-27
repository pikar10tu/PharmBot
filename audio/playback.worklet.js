// playback.worklet.js — runs in audio thread at 24 kHz
// Receives Float32Array chunks from main thread, plays them gaplessly
// Send 'clear' string to interrupt/stop playback immediately
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._q   = [];
    this._buf = null;
    this._off = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'clear') {
        this._q = []; this._buf = null; this._off = 0;
        return;
      }
      this._q.push(new Float32Array(e.data));
    };
  }

  process(_, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    for (let i = 0; i < out.length; ) {
      if (!this._buf || this._off >= this._buf.length) {
        this._buf = this._q.shift() || null;
        this._off = 0;
        if (!this._buf) break; // queue empty — output silence for remainder
      }
      out[i++] = this._buf[this._off++];
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
