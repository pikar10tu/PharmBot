// ============================================================
//  rag-core.test.js
//  ทดสอบ setup/lib/rag-core.js — คณิตค้นคืนล้วน ไม่มี I/O
//  รัน: cd setup && npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const { quantize, dequantize, cosine, mergeTopK, capPerDoc } = require('../lib/rag-core');

// pseudo-random แบบ deterministic — ไม่ให้ test flaky
function randVec(n, seed = 1) {
  const out = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push(s / 2147483648 - 0.5);
  }
  return out;
}

test('quantize -> dequantize เพี้ยนน้อยกว่า 1% (cosine กับต้นฉบับ > 0.99)', () => {
  const v = randVec(768);
  const back = dequantize(quantize(v));
  assert.strictEqual(back.length, 768);
  assert.ok(cosine(v, back) > 0.99, `cosine=${cosine(v, back)}`);
});

test('quantize รักษาอันดับ similarity ไว้ได้', () => {
  const q = randVec(768, 7);
  const near = q.map((x, i) => x + (i % 5) * 0.001);   // ใกล้ q
  const far = randVec(768, 99);                         // ไม่เกี่ยว
  const dNear = dequantize(quantize(near));
  const dFar = dequantize(quantize(far));
  assert.ok(cosine(q, dNear) > cosine(q, dFar), 'vector ที่ใกล้ต้องได้คะแนนสูงกว่า');
});

test('cosine ของ vector เดียวกัน = 1, ตั้งฉาก = 0', () => {
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
});

test('cosine ไม่ขึ้นกับความยาว vector', () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
});

test('cosine กับ zero vector คืน 0 ไม่ใช่ NaN', () => {
  assert.strictEqual(cosine([0, 0, 0], [1, 2, 3]), 0);
  assert.strictEqual(cosine([1, 2, 3], [0, 0, 0]), 0);
});

test('cosine รับ Float32Array ผสมกับ array ธรรมดาได้', () => {
  const a = new Float32Array([1, 0, 0]);
  assert.ok(Math.abs(cosine(a, [1, 0, 0]) - 1) < 1e-6);
});

test('mergeTopK รวมหลาย list เรียงจากมากไปน้อย ตัดที่ k', () => {
  const out = mergeTopK([
    [{ chunkId: 'a', docId: 'd1', score: 0.9 }, { chunkId: 'b', docId: 'd1', score: 0.5 }],
    [{ chunkId: 'c', docId: 'd2', score: 0.7 }],
  ], 2);
  assert.deepStrictEqual(out.map(h => h.chunkId), ['a', 'c']);
});

test('mergeTopK เจอ chunkId ซ้ำ เก็บคะแนนสูงสุด ไม่ซ้ำในผลลัพธ์', () => {
  const out = mergeTopK([
    [{ chunkId: 'a', docId: 'd1', score: 0.4 }],
    [{ chunkId: 'a', docId: 'd1', score: 0.8 }],
  ], 5);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].score, 0.8);
});

test('mergeTopK ไม่แก้ object ต้นฉบับ', () => {
  const src = { chunkId: 'a', docId: 'd1', score: 0.4 };
  mergeTopK([[src]], 5);
  assert.strictEqual(src.score, 0.4);
});

test('mergeTopK รับ list ว่าง/null ได้', () => {
  assert.deepStrictEqual(mergeTopK([], 5), []);
  assert.deepStrictEqual(mergeTopK([null, []], 5), []);
});

test('capPerDoc จำกัดจำนวนต่อเอกสารและคงลำดับ', () => {
  const hits = [
    { chunkId: 'a', docId: 'd1', score: 0.9 },
    { chunkId: 'b', docId: 'd1', score: 0.8 },
    { chunkId: 'c', docId: 'd1', score: 0.7 },
    { chunkId: 'd', docId: 'd2', score: 0.6 },
  ];
  assert.deepStrictEqual(capPerDoc(hits, 2).map(h => h.chunkId), ['a', 'b', 'd']);
});

test('capPerDoc ทำให้เอกสารรองมีที่ยืน ไม่ถูกกลบด้วยเอกสารเดียว', () => {
  const hits = [
    ...['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ chunkId: id, docId: 'big', score: 0.9 - i * 0.01 })),
    { chunkId: 'z', docId: 'small', score: 0.5 },
  ];
  const out = capPerDoc(hits, 2);
  assert.ok(out.some(h => h.docId === 'small'), 'เอกสารรองต้องยังอยู่');
  assert.strictEqual(out.filter(h => h.docId === 'big').length, 2);
});
