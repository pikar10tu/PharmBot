// ============================================================
//  embed.test.js — ทดสอบเฉพาะส่วน pure (ส่วนที่เรียก network ทดสอบด้วย --dry)
//  รัน: cd setup && npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const { chunkHash, shardEntries, buildEmbedInput } = require('../lib/embed');

test('chunkHash คงที่สำหรับ input เดิม และเปลี่ยนเมื่อเนื้อหาเปลี่ยน', () => {
  const c = { docId: 'd1', page: 3, chunkId: 'd1_p003_0', text: 'abc' };
  assert.strictEqual(chunkHash(c), chunkHash({ ...c }));
  assert.notStrictEqual(chunkHash(c), chunkHash({ ...c, text: 'abd' }));
  assert.notStrictEqual(chunkHash(c), chunkHash({ ...c, page: 4 }));
  assert.notStrictEqual(chunkHash(c), chunkHash({ ...c, docId: 'd2' }));
});

test('shardEntries แบ่งไม่เกินขนาดที่กำหนดและไม่ตกหล่น', () => {
  const entries = Array.from({ length: 701 }, (_, i) => ({ chunkId: `c${i}` }));
  const shards = shardEntries(entries, 300);
  assert.strictEqual(shards.length, 3);
  assert.deepStrictEqual(shards.map(s => s.length), [300, 300, 101]);
  assert.strictEqual(shards.flat().length, 701);
});

test('shardEntries ค่าเริ่มต้น 300 (กัน RESP 576 entries ชน Firestore 1 MB)', () => {
  const entries = Array.from({ length: 576 }, (_, i) => ({ chunkId: `c${i}` }));
  assert.deepStrictEqual(shardEntries(entries).map(s => s.length), [300, 276]);
});

test('shardEntries กับ list ว่างคืน array ว่าง', () => {
  assert.deepStrictEqual(shardEntries([], 300), []);
});

test('buildEmbedInput เอาสรุปไทยขึ้นก่อน แล้ว keywords แล้วต้นฉบับที่ตัดสั้น', () => {
  const s = buildEmbedInput({
    summaryTh: 'สรุปสั้น',
    keywords: ['หนองใน', 'ceftriaxone'],
    text: 'x'.repeat(900),
  });
  assert.ok(s.startsWith('สรุปสั้น'));
  assert.ok(s.includes('หนองใน ceftriaxone'));
  assert.ok(s.length < 900, 'ต้องตัดต้นฉบับให้สั้นลง');
});

test('buildEmbedInput ทนต่อ field ที่หายไป', () => {
  assert.strictEqual(typeof buildEmbedInput({}), 'string');
  assert.strictEqual(typeof buildEmbedInput({ text: 'abc' }), 'string');
});
