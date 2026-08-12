// playback.worklet.js — runs in audio thread at 24 kHz
// Receives Float32Array chunks from main thread, plays them gaplessly
// Send 'clear' string to interrupt/stop playback immediately

// Gemini streams audio much faster than real time, so the queue holds a whole reply
// before playback catches up. Cap by DURATION, not chunk count: 45 s at 24 kHz
// (~4 MB) comfortably covers the longest counseling reply. The old 40-chunk cap was
// only ~8 s and silently truncated long answers mid-sentence.
const MAX_QUEUED_SAMPLES = 24000 * 45;

class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._q      = [];
    this._buf    = null;
    this._off    = 0;
    this._queued = 0;   // samples sitting in _q (excludes the chunk being played)
    this.port.onmessage = (e) => {
      if (e.data === 'clear') {
        this._q = []; this._buf = null; this._off = 0; this._queued = 0;
        return;
      }
      const chunk = new Float32Array(e.data);
      if (this._queued + chunk.length > MAX_QUEUED_SAMPLES) {
        // Never drop in silence — the main thread logs this
        this.port.postMessage({ dropped: chunk.length });
        return;
      }
      this._q.push(chunk);
      this._queued += chunk.length;
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
        this._queued -= this._buf.length;
      }
      out[i++] = this._buf[this._off++];
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
