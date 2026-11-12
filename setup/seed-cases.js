// ============================================================
//  seed-cases.js
//  Seed diseaseGroups + cases เข้า Firestore
//  รันซ้ำได้ (idempotent) — ใช้ fixed document ID
//
//  วิธีใช้:
//    node seed-cases.js
// ============================================================

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// db ถูกสร้างเฉพาะตอนรันตรง — sim-case.js require ไฟล์นี้เพื่อเอา CASES ไปใช้โดยไม่แตะ Firestore
let db;

// ── Disease Groups ─────────────────────────────────────────────
// 3 กลุ่มโรคตามสเปกงานวิจัย (บท 1-3 ฉบับทีมล่าสุด §3.4.1) — กลุ่มละ 3 เคส รวม 9 เคสฝึก
// เคสเป้าหมายที่ทีมต้องเติมให้ครบ:
//   RESP   → Bacterial pharyngitis, Bacterial sinusitis, Allergic rhinitis
//   GU_STI → Vulvovaginal candidiasis, Gonorrhea, Uncomplicated UTI
//   NEURO  → Migraine without aura, Tension headache, Stroke
const GROUPS = [
  { id: 'RESP',   label: 'ระบบทางเดินหายใจ',                                sortOrder: 1 },
  { id: 'GU_STI', label: 'ติดเชื้อทางเดินปัสสาวะและโรคติดต่อทางเพศสัมพันธ์', sortOrder: 2 },
  { id: 'NEURO',  label: 'ระบบประสาท',                                       sortOrder: 3 },
];

// ── Cases ──────────────────────────────────────────────────────
// เนื้อหาเคสอยู่ที่ cases-data.js (9 เคสฝึก จากเอกสาร 31 aug) — แก้เคสที่นั่น
const { CASES } = require('./cases-data.js');

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n🏥  PharmBot — Seed Disease Groups & Cases');
  console.log('─'.repeat(50));

  // Seed diseaseGroups
  console.log(`\n[Disease Groups] ${GROUPS.length} หมวด`);
  const groupBatch = db.batch();
  GROUPS.forEach(g => {
    groupBatch.set(db.collection('diseaseGroups').doc(g.id), {
      label:     g.label,
      sortOrder: g.sortOrder,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await groupBatch.commit();
  console.log(`  ✅  ${GROUPS.length} groups seeded`);

  // ลบกลุ่มโรคเก่าที่ไม่อยู่ในชุด 3 กลุ่มใหม่ (merge-seed ไม่ลบให้เอง)
  const keepIds  = new Set(GROUPS.map(g => g.id));
  const existing = await db.collection('diseaseGroups').get();
  const delBatch = db.batch();
  let delCount = 0;
  existing.forEach(doc => {
    if (!keepIds.has(doc.id)) { delBatch.delete(doc.ref); delCount++; }
  });
  if (delCount) {
    await delBatch.commit();
    console.log(`  🗑️   ลบกลุ่มโรคเก่า ${delCount} กลุ่ม`);
  }

  // Seed cases
  console.log(`\n[Cases] ${CASES.length} เคส`);
  for (const c of CASES) {
    const { id, ...data } = c;
    await db.collection('cases').doc(id).set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`  ✅  ${id}`);
  }

  // ลบเคสเก่าที่ไม่อยู่ใน CASES อีกต่อไป (merge-seed ไม่ลบให้เอง — เดิมเป็นช่องว่าง
  // ทำให้เคสที่เอาออกจาก array ค้างอยู่ใน Firestore เงียบๆ) — pattern เดียวกับ diseaseGroups ด้านบน
  const keepCaseIds  = new Set(CASES.map(c => c.id));
  const existingCases = await db.collection('cases').get();
  const delCaseBatch = db.batch();
  let delCaseCount = 0;
  existingCases.forEach(doc => {
    if (!keepCaseIds.has(doc.id)) { delCaseBatch.delete(doc.ref); delCaseCount++; }
  });
  if (delCaseCount) {
    await delCaseBatch.commit();
    console.log(`  🗑️   ลบเคสเก่า ${delCaseCount} เคส`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅  เสร็จแล้ว — ${GROUPS.length} groups, ${CASES.length} cases\n`);
  process.exit(0);
}

module.exports = { CASES, GROUPS };

if (require.main === module) {
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    console.error('\n❌  ไม่พบ serviceAccountKey.json\n');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
  db = admin.firestore();
  main().catch(e => {
    console.error('\n❌  Error:', e.message);
    process.exit(1);
  });
}
