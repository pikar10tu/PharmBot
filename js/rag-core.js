// ============================================================
//  rag-core.js
//  คณิตค้นคืน — ไม่มี I/O ไม่มี dependency
//
//  ⚠️ ไฟล์นี้ต้องรันได้ทั้งเบราว์เซอร์ (global scope) และ Node (require)
//     - ห้ามใช้ require ข้างใน / ห้ามใช้ ESM import
//     - ปิดท้ายด้วย module.exports แบบมีเงื่อนไข
//     ใช้ร่วมกันเพื่อให้ผลค้นคืนตอน offline (audit / eval-retrieval)
//     ตรงกับที่นักศึกษาเจอจริงในเบราว์เซอร์
// ============================================================

// ── Quantization ────────────────────────────────────────────
// normalize เป็น unit vector ก่อน แล้ว scale ด้วย 127 คงที่
// -> ไม่ต้องเก็บ scale ต่อ vector, embedding 768 มิติ = 768 ไบต์ (base64 1,024 ตัวอักษร)
// ทำได้เพราะ cosine ไม่สนความยาว vector อยู่แล้ว

function quantize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;

  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    q[i] = Math.max(-127, Math.min(127, Math.round((vec[i] / norm) * 127)));
  }

  const bytes = new Uint8Array(q.buffer, q.byteOffset, q.byteLength);
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

function dequantize(b64) {
  let bytes;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  // สำเนา buffer ให้ตรง alignment ก่อนตีความเป็น Int8Array
  const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 127;
  return out;
}

// ── Similarity ──────────────────────────────────────────────

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Ranking ─────────────────────────────────────────────────

// รวมผลจากหลาย query — chunk เดียวกันที่มาจากหลาย query เก็บคะแนนสูงสุด
function mergeTopK(lists, k) {
  const best = new Map();
  for (const list of lists || []) {
    for (const hit of list || []) {
      const prev = best.get(hit.chunkId);
      if (!prev || hit.score > prev.score) best.set(hit.chunkId, { ...hit });
    }
  }
  return [...best.values()].sort((x, y) => y.score - x.score).slice(0, k);
}

// จำกัดจำนวน chunk ต่อเอกสาร — กันเอกสารเล่มใหญ่กลืนผลทั้งหมด
// ทำให้หลักฐานที่ส่งเข้า prompt มาจากหลายแหล่ง ไม่ใช่เล่มเดียว
function capPerDoc(hits, maxPerDoc) {
  const seen = new Map();
  const out = [];
  for (const h of hits) {
    const n = seen.get(h.docId) || 0;
    if (n >= maxPerDoc) continue;
    seen.set(h.docId, n + 1);
    out.push(h);
  }
  return out;
}

const RAGCore = { quantize, dequantize, cosine, mergeTopK, capPerDoc };

if (typeof module !== 'undefined') module.exports = RAGCore;
