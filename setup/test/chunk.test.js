// ============================================================
//  chunk.test.js
//  รัน: cd setup && node --test test/chunk.test.js
// ============================================================

const test = require('node:test');
const assert = require('node:assert');
const { chunkPages, CHUNK_OPTS } = require('../lib/chunk');

const para = (n) => 'ก'.repeat(n);

test('หน้าสั้นได้ chunk เดียว + ซ่อมข้อความไทยให้แล้ว', () => {
  const out = chunkPages('doc1', [{ page: 7, text: 'สาเหตุส าคัญของอาการเจ็บคอ' + para(320) }]);
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].text.startsWith('สาเหตุสำคัญของอาการเจ็บคอ'), out[0].text.slice(0, 40));
  assert.strictEqual(out[0].chunkId, 'doc1_p007_0');
  assert.strictEqual(out[0].page, 7);
  assert.strictEqual(out[0].docId, 'doc1');
});

test('หน้ายาวถูกตัดหลาย chunk และแต่ละ chunk ไม่เกิน max', () => {
  const text = [para(700), para(700), para(700)].join('\n\n');
  const out = chunkPages('doc1', [{ page: 1, text }]);
  assert.ok(out.length >= 2, `ควรได้ >=2 chunk ได้ ${out.length}`);
  for (const c of out) {
    assert.ok(c.text.length <= CHUNK_OPTS.max, `chunk ยาว ${c.text.length} เกิน max`);
  }
});

test('ตัดที่ขอบย่อหน้า ไม่ขึ้นต้นด้วยช่องว่าง', () => {
  const out = chunkPages('doc1', [{ page: 1, text: [para(600), para(600)].join('\n\n') }]);
  assert.ok(out.every(c => c.text === c.text.trimStart()));
});

test('จับหัวข้อมาใส่ heading', () => {
  const text = '3.5 โรคเชื้อราในช่องคลอด (Vulvovaginal Candidiasis)\n\n' + para(400);
  const out = chunkPages('doc1', [{ page: 91, text }]);
  assert.match(out[0].heading, /เชื้อราในช่องคลอด/);
});

test('heading สืบทอดไปหน้าถัดไปที่ไม่มีหัวข้อของตัวเอง', () => {
  const out = chunkPages('doc1', [
    { page: 5, text: '2.1 การรักษาด้วยยาปฏิชีวนะ\n\n' + para(400) },
    { page: 6, text: para(400) },
  ]);
  assert.match(out.find(c => c.page === 6).heading, /การรักษาด้วยยาปฏิชีวนะ/);
});

test('หน้าถัดไปได้ overlap ท้ายหน้าก่อนมานำหน้า', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: para(400) + 'จบหน้าหนึ่ง' },
    { page: 2, text: 'เริ่มหน้าสอง' + para(400) },
  ]);
  const p2 = out.find(c => c.page === 2);
  assert.ok(p2.text.includes('จบหน้าหนึ่ง'), 'chunk แรกของหน้า 2 ควรมีท้ายหน้า 1');
});

test('ข้ามหน้าว่างและ chunk ที่สั้นกว่า min', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: '   ' },
    { page: 2, text: 'สั้นมาก' },
    { page: 3, text: para(500) },
  ]);
  assert.deepStrictEqual(out.map(c => c.page), [3]);
});

test('chunkId ไม่ซ้ำกันทั้ง document', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: [para(700), para(700)].join('\n\n') },
    { page: 2, text: [para(700), para(700)].join('\n\n') },
  ]);
  assert.strictEqual(new Set(out.map(c => c.chunkId)).size, out.length);
});

test('เลขหน้าใน chunkId zero-pad 3 หลัก เรียงตัวอักษรได้ถูกลำดับ', () => {
  const out = chunkPages('d', [
    { page: 9,   text: para(400) },
    { page: 10,  text: para(400) },
    { page: 100, text: para(400) },
  ]);
  const ids = out.map(c => c.chunkId);
  assert.deepStrictEqual([...ids].sort(), ids);
});

test('กรอง header/footer ที่ซ้ำทุกหน้าออก', () => {
  const hdr = 'THAI JOURNAL OF OTOLARYNGOLOGY HEAD AND NECK SURGERY';
  const out = chunkPages('doc1', [
    { page: 1, text: `${hdr}\n\n${para(400)}` },
    { page: 2, text: `${hdr}\n\n${para(400)}` },
    { page: 3, text: `${hdr}\n\n${para(400)}` },
    { page: 4, text: `${hdr}\n\n${para(400)}` },
  ]);
  assert.ok(out.length > 0);
  assert.ok(out.every(c => !c.text.includes(hdr)), 'header ที่ซ้ำทุกหน้าต้องถูกกรองออก');
});

test('ไม่กรองบรรทัดที่ซ้ำแค่ไม่กี่หน้า', () => {
  const line = 'ตารางที่ 3 ขนาดยาที่แนะนำ';
  const out = chunkPages('doc1', [
    { page: 1, text: `${line}\n\n${para(400)}` },
    { page: 2, text: para(400) },
    { page: 3, text: para(400) },
    { page: 4, text: para(400) },
  ]);
  assert.ok(out.find(c => c.page === 1).text.includes(line));
});

test('รับ input ว่างได้', () => {
  assert.deepStrictEqual(chunkPages('d', []), []);
  assert.deepStrictEqual(chunkPages('d', [{ page: 1, text: '' }]), []);
});
