// ============================================================
//  rag-core-browser.test.js
//  ยืนยันว่า js/rag-core.js รันในเบราว์เซอร์ได้ ไม่ใช่แค่ Node
//
//  จำเป็นเพราะไฟล์นี้ถูกใช้สองทาง:
//    - เบราว์เซอร์ โหลดผ่าน <script> (global scope ไม่มี module/Buffer)
//    - Node  ผ่าน require() ใน eval-retrieval.js / audit
//  ถ้ามีคนเผลอใส่ require() หรือ ESM import ลงไป เบราว์เซอร์จะพังเงียบๆ
//  ตอน runtime — test นี้จับให้ตั้งแต่ตอน commit
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_PATH = path.join(__dirname, '..', '..', 'js', 'rag-core.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');

test('ไม่มี require / import ในไฟล์ (เบราว์เซอร์ไม่รู้จัก)', () => {
  assert.strictEqual(/\brequire\s*\(/.test(src), false, 'พบ require() — เบราว์เซอร์จะพัง');
  assert.strictEqual(/^\s*import\s/m.test(src), false, 'พบ ESM import — ไฟล์นี้ต้องเป็น classic script');
});

test('ทำงานได้ใน context แบบเบราว์เซอร์ (มี btoa/atob ไม่มี module/Buffer)', () => {
  const sandbox = {
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Int8Array, Uint8Array, Float32Array, Math, Map, String,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  // รันโค้ดผู้ใช้ใน context เดียวกัน = จำลอง <script> ตัวที่สองในหน้าเดียว
  const result = vm.runInContext(`
    const v = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.5);
    const b64 = quantize(v);
    const back = dequantize(b64);
    ({
      hasRAGCore: typeof RAGCore,
      b64Length: b64.length,
      cos: cosine(v, back),
      topK: mergeTopK([[{ chunkId: 'a', docId: 'd', score: 1 }]], 1).length,
      capped: capPerDoc([
        { chunkId: 'a', docId: 'd', score: 1 },
        { chunkId: 'b', docId: 'd', score: 0.9 },
      ], 1).length,
    });
  `, sandbox);

  assert.strictEqual(result.hasRAGCore, 'object', 'RAGCore ต้องเข้าถึงได้จากสคริปต์อื่น');
  assert.strictEqual(result.b64Length, 1024, '768 มิติ int8 -> base64 1024 ตัวอักษร');
  assert.ok(result.cos > 0.99, `roundtrip เพี้ยนเกินเกณฑ์: ${result.cos}`);
  assert.strictEqual(result.topK, 1);
  assert.strictEqual(result.capped, 1);
});

test('ผลลัพธ์ฝั่งเบราว์เซอร์ตรงกับฝั่ง Node เป๊ะ', () => {
  const nodeCore = require('../../js/rag-core');

  const sandbox = {
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Int8Array, Uint8Array, Float32Array, Math, Map, String,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);

  const v = Array.from({ length: 768 }, (_, i) => Math.cos(i * 0.7) * 0.3);
  sandbox.__v = v;
  const browserB64 = vm.runInContext('quantize(__v)', sandbox);

  // ถ้าสองฝั่งให้ผลต่างกัน ผล audit ตอน offline จะไม่ตรงกับที่นักศึกษาเจอจริง
  assert.strictEqual(browserB64, nodeCore.quantize(v));
});
