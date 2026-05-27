// capture.worklet.js — runs in audio thread at 16 kHz
// Converts Float32 mic input → PCM16 → sends to main thread via port
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch?.length) {
      const pcm = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++)
        pcm[i] = Math.max(-32768, Math.min(32767, ch[i] * 32767));
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
