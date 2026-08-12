// ============================================================
//  db-degraded.test.js
//  /sessions ต้องบันทึกว่าเซสชันนี้หลุดไประดับไหน
//  ทีมจะได้แยกออกว่าเป็นปัญหาเทคนิค ไม่ใช่ผู้เรียนทำไม่ได้
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'db.js'), 'utf8');

function load() {
  const captured = {};
  const firebase = {
    firestore: { FieldValue: { serverTimestamp: () => '<ts>' } },
  };
  const db = {
    collection: (c) => ({
      doc: (d) => ({
        update: async (payload) => { Object.assign(captured, { c, d, payload }); },
      }),
    }),
  };
  const fn = new Function('db', 'firebase',
    `${SRC}; return { markSessionDegraded };`);
  return { ...fn(db, firebase), captured };
}

test('เขียน degraded ลง /sessions ครบทุก field', async () => {
  const { markSessionDegraded, captured } = load();
  await markSessionDegraded('sess1', 'L2', 'mic-denied');
  assert.strictEqual(captured.c, 'sessions');
  assert.strictEqual(captured.d, 'sess1');
  assert.deepStrictEqual(captured.payload, {
    degraded: { level: 'L2', reason: 'mic-denied', at: '<ts>' },
  });
});

test('เรียกซ้ำแล้วเขียนทับด้วยระดับล่าสุด', async () => {
  const { markSessionDegraded, captured } = load();
  await markSessionDegraded('sess1', 'L1', 'live-connect-failed');
  await markSessionDegraded('sess1', 'L2', 'no-speech-api');
  assert.strictEqual(captured.payload.degraded.level,  'L2');
  assert.strictEqual(captured.payload.degraded.reason, 'no-speech-api');
});
