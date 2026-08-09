// ============================================================
//  regenerate-eval-prompt-bare-rubric.js
//  สร้างใหม่: node setup/test/fixtures/regenerate-eval-prompt-bare-rubric.js
//
//  รันสคริปต์นี้เมื่อแก้ buildEvalPrompt() ใน js/prompts.js โดยตั้งใจ แล้ว:
//   1. ตรวจ diff ของไฟล์ .txt ที่ได้ ว่าเปลี่ยนตรงตามที่ตั้งใจ ไม่ใช่ผลข้างเคียง
//   2. ตัดสินใจว่าต้อง bump GROUNDING_VERSION (js/prompts.js) ด้วยหรือไม่ —
//      เกณฑ์: ถ้าเนื้อหาที่ AI เห็นเปลี่ยน (คำสั่ง/checklist/schema) ต้อง bump
//      ถ้าแก้แค่ comment ในซอร์สที่ไม่กระทบ prompt ไม่ต้อง (แต่ปกติจะไม่ทำให้ diff เกิดอยู่แล้ว)
//   3. commit ไฟล์ .txt คู่กับ prompts.js และ commit message อธิบายว่า bump version หรือไม่ เพราะอะไร
//
//  ⚠️ ห้ามแก้ .txt fixture ด้วยมือ — ต้องมาจากสคริปต์นี้เท่านั้น ไม่งั้น golden test
//     จะเทียบกับข้อความที่ไม่ได้มาจาก buildEvalPrompt() จริง แล้วสูญความหมายไปเลย
//
//  BARE_RUBRIC/makeCase/EVAL_ARGS ด้านล่างต้องตรงกับก้อนเดียวกันใน
//  setup/test/grounding.test.js เป๊ะ — เป็นข้อมูลทดสอบเดียวกัน คนละไฟล์เพราะ
//  ไฟล์ .test.js ไม่ควรถูก require() (node:test จะรันเทสต์ซ้ำตอน require)
// ============================================================

const fs   = require('node:fs');
const path = require('node:path');
const vm   = require('node:vm');

const HEADER = `// ============================================================
// eval-prompt-bare-rubric.txt — golden fixture ของ buildEvalPrompt()
//
// เนื้อหาด้านล่างเส้นคั่นคือ output จริงของ buildEvalPrompt() สำหรับเคสที่ยังไม่มี
// annotation (rubric ตรงกับ BARE_RUBRIC ใน grounding.test.js) — สร้างโดยสคริปต์
// setup/test/fixtures/regenerate-eval-prompt-bare-rubric.js ไม่ได้พิมพ์มือ
//
// ทดสอบว่า prompt ไม่เปลี่ยนไปโดยไม่ได้ตั้งใจ ก่อนหน้านี้ grounding.test.js ตรวจแค่
// "ไม่มีคำบางคำ" (absence-of-substring) ซึ่งพิสูจน์ว่ากลไก RAG หายไป แต่ไม่พิสูจน์ว่า
// ส่วนที่เหลือของ prompt เหมือนเดิมทุกตัวอักษร — golden fixture นี้เทียบทั้งก้อนตรงๆ
//
// ⚠️ ถ้าตั้งใจแก้ prompt ของ Step 4: รัน
//      node setup/test/fixtures/regenerate-eval-prompt-bare-rubric.js
//    แล้วตัดสินใจว่าต้อง bump GROUNDING_VERSION (js/prompts.js) ด้วยหรือไม่ ก่อน commit
//
// ห้ามแก้ไฟล์นี้ด้วยมือ — แก้แล้ว golden test จะเทียบกับข้อความที่ไม่ได้มาจากโค้ดจริง
// ============================================================
=== เนื้อหาด้านล่างบรรทัดนี้คือ output ตรงจาก buildEvalPrompt() ห้ามมีอะไรอยู่หลังบรรทัดนี้ก่อนเนื้อหา ===
`;

const BARE_RUBRIC = [
  { id: 'h1', domain: 'history',    label: 'ถามอาการสำคัญ',   weight: 4, critical: false, active: true },
  { id: 'd1', domain: 'diagnosis',  label: 'สรุปการวินิจฉัย',  weight: 5, critical: false, active: true },
  { id: 'r1', domain: 'drug',       label: 'เลือกยา first-line', weight: 7, critical: true,  active: true },
  { id: 'c1', domain: 'counseling', label: 'แจ้งผลข้างเคียง',   weight: 3, critical: false, active: true },
];

function makeCase(rubric) {
  return {
    name: 'สมหญิง', age: 30, gender: 'female',
    chiefComplaint: 'เจ็บคอค่ะ',
    diagnosisAnswer: 'Bacterial pharyngitis',
    drugAnswer: { firstLine: ['amoxicillin_500'], regimen: {}, counseling: [] },
    rubric: JSON.parse(JSON.stringify(rubric)),
  };
}

const EVAL_ARGS = [[{ role: 'user', text: 'สวัสดีครับ' }], [], []];

function loadPrompts() {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Number, Date };
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'js', 'prompts.js'), 'utf8');
  vm.runInContext(src, sandbox);
  return vm.runInContext('buildEvalPrompt', sandbox);
}

const buildEvalPrompt = loadPrompts();
const prompt = buildEvalPrompt(makeCase(BARE_RUBRIC), ...EVAL_ARGS);

const outPath = path.join(__dirname, 'eval-prompt-bare-rubric.txt');
fs.writeFileSync(outPath, HEADER + prompt, 'utf8');
console.log(`เขียน ${outPath} แล้ว (${Buffer.byteLength(prompt, 'utf8')} bytes ของ prompt จริง)`);
