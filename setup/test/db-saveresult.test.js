// ============================================================
//  db-saveresult.test.js
//  ตรวจรูปทรงข้อมูลที่ saveResult() เขียนลง /results — จุดเดียวที่
//  guidelineRefs/groundingVersion (static guideline grounding) ถูก
//  persist ลง Firestore จริง
//
//  js/db.js เป็น classic script ที่อ้าง global `db` (Firestore instance)
//  และ `firebase.firestore.FieldValue` — จำลองทั้งคู่เป็น mock เก็บสิ่งที่
//  ถูกเขียนไว้ดู แล้วรันผ่าน vm เพื่อทดสอบพฤติกรรมจริงของฟังก์ชัน
//  ไม่ใช่แค่อ่านซอร์สด้วยตา
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDb() {
  const added = [];
  const updated = [];
  const mockDb = {
    collection(name) {
      return {
        doc(id) {
          return {
            update: async (data) => { updated.push({ collection: name, id, data }); },
          };
        },
        add: async (data) => {
          added.push({ collection: name, data });
          return { id: 'mockResultId' };
        },
      };
    },
  };
  const sandbox = {
    console, Math, JSON, Promise,
    db: mockDb,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP' } } },
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'db.js'), 'utf8');
  vm.runInContext(src, sandbox);
  // const/function ระดับบนสุดเป็น lexical binding ไม่ผูกกับ globalThis ของ sandbox
  sandbox.saveResult = vm.runInContext('saveResult', sandbox);
  return { added, updated, saveResult: sandbox.saveResult };
}

function lastResultsWrite(added) {
  const write = [...added].reverse().find(a => a.collection === 'results');
  assert.ok(write, 'ไม่พบการเขียน /results');
  return write.data;
}

const SAMPLE_REFS = [
  { docId: 'ccpe461_uri', title: 'แนวทางการเลือกใช้ยาปฏิชีวนะ', page: 12, url: null },
];

test('saveResult เก็บ guidelineRefs จาก grounding.refs', async () => {
  const { added, saveResult } = loadDb();
  await saveResult('sess1', 'user1', {}, null, { refs: SAMPLE_REFS, version: '2026-08-09' });
  assert.deepStrictEqual(lastResultsWrite(added).guidelineRefs, SAMPLE_REFS);
});

test('saveResult เก็บ groundingVersion จาก grounding.version', async () => {
  const { added, saveResult } = loadDb();
  await saveResult('sess1', 'user1', {}, null, { refs: SAMPLE_REFS, version: '2026-08-09' });
  assert.strictEqual(lastResultsWrite(added).groundingVersion, '2026-08-09');
});

test('grounding เป็น null (ไม่ส่งมา) -> guidelineRefs = [] และ groundingVersion = null', async () => {
  const { added, saveResult } = loadDb();
  await saveResult('sess1', 'user1', {}, null, null);
  const data = lastResultsWrite(added);
  // array ข้าม realm (vm) เทียบด้วย deepStrictEqual ตรงๆ ไม่ได้ — เทียบ length แทน
  assert.strictEqual(data.guidelineRefs.length, 0);
  assert.strictEqual(data.groundingVersion, null);
});

test('grounding เป็น null เพราะไม่ส่ง argument ที่ 5 เลย (ค่า default ของพารามิเตอร์)', async () => {
  const { added, saveResult } = loadDb();
  await saveResult('sess1', 'user1', {});
  const data = lastResultsWrite(added);
  assert.strictEqual(data.guidelineRefs.length, 0);
  assert.strictEqual(data.groundingVersion, null);
});

test('ไม่มีฟิลด์ rag แบบเดิม (ถูกแทนที่ด้วย guidelineRefs/groundingVersion แล้ว)', async () => {
  const { added, saveResult } = loadDb();
  await saveResult('sess1', 'user1', {}, null, { refs: SAMPLE_REFS, version: '2026-08-09' });
  assert.strictEqual('rag' in lastResultsWrite(added), false);
});

test('saveResult ยัง mark session เป็น evaluated เหมือนเดิม', async () => {
  const { updated, saveResult } = loadDb();
  await saveResult('sess42', 'user1', {}, null, null);
  const u = updated.find(x => x.collection === 'sessions' && x.id === 'sess42');
  assert.ok(u, 'ต้อง update sessions/{sessionId}');
  assert.strictEqual(u.data.status, 'evaluated');
});

test('saveResult คืนค่าที่มี id ของผลลัพธ์', async () => {
  const { saveResult } = loadDb();
  const result = await saveResult('sess1', 'user1', {}, null, null);
  assert.strictEqual(result.id, 'mockResultId');
});
