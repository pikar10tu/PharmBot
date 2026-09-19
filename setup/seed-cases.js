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

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌  ไม่พบ serviceAccountKey.json\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

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
// เนื้อหาจากเอกสารที่ผู้เชี่ยวชาญตรวจแล้ว: DOC/UPDATE19092569/11 Cases.docx (11 เคส)
// นำเข้าทีละเคสระหว่างรอบทดสอบ Prompt Lab (js/screens/promptlab.js) —
// เริ่มจากเคสเดียวคือ Bacterial Pharyngitis เพื่อจูน prompt ให้ "นิ่ง" ก่อนนำเข้าเคสถัดไป
const CASES = [
  // ── case01: เจ็บคอ (RESP) — Bacterial Pharyngitis ───────────
  // อ้างอิง: Clinical practice guideline for the diagnosis and management of
  //          group A streptococcal pharyngitis, 2012
  {
    id: 'case01_bacterial_pharyngitis',
    groupId:    'RESP',
    difficulty: 'easy',
    title:      'เจ็บคอ — Bacterial Pharyngitis',
    gender:     'female',
    age:        28,
    // หมายเหตุ: buildSystemPrompt() ไม่รองรับ 'random' สำหรับ occupation (ต่างจาก gender/age ที่
    // randomizePatientData() สุ่มให้) — ใส่ 'random' จะกลายเป็นคำว่า "random" โผล่ในพร้อมพต์ตรงๆ
    occupation: 'พนักงานบริษัท',
    chiefComplaint: 'เจ็บคอค่ะ',
    secretInfoFields: {
      tone:              'neutral',
      mainSymptoms:      'เจ็บคอ',
      symptomCharacter:  'เจ็บคอมากตอนกลืนน้ำลายหรือกลืนอาหาร ส่องดูในคอเห็นมีจุดขาวๆ ที่คอ',
      duration:          'เป็นมา 3 วันแล้ว',
      severity:          'เจ็บคอมากตอนกลืนน้ำลาย',
      associated:        'มีไข้ประมาณ 38.5 องศา ไม่มีอาการไอ ไม่มีน้ำมูก',
      factors:           'คนในครอบครัวเพิ่งมีอาการคล้ายกัน',
      pastHistory:       'เคยเป็นแบบนี้มาก่อน',
      prevTreatment:     'ยังไม่ได้กินยาอะไรมาเลย',
      underlyingDisease: 'ไม่มี',
      regularMeds:       'ไม่มี',
      drugAllergy:       'ไม่มี',
      additional:        '',
      redFlags:          'ไม่มี',
    },
    // ประกอบด้วย logic เดียวกับ _assembleSecretInfo() ใน js/screens/admin.js —
    // ต้องอัปเดตคู่กันถ้าแก้ secretInfoFields ด้านบน
    secretInfo: `โทนอารมณ์: เรียบเฉย (ปกติ)

[หมวด 1: อาการหลัก — ตอบได้ทันทีถ้าถาม]
- เจ็บคอ

[หมวด 2: รายละเอียดอาการ — ต้องถามเฉพาะ]
- ลักษณะอาการ: เจ็บคอมากตอนกลืนน้ำลายหรือกลืนอาหาร ส่องดูในคอเห็นมีจุดขาวๆ ที่คอ
- ระยะเวลา: เป็นมา 3 วันแล้ว
- ความรุนแรง: เจ็บคอมากตอนกลืนน้ำลาย
- อาการร่วม: มีไข้ประมาณ 38.5 องศา ไม่มีอาการไอ ไม่มีน้ำมูก
- ปัจจัยที่ทำให้แย่ลง/ดีขึ้น: คนในครอบครัวเพิ่งมีอาการคล้ายกัน

[หมวด 3: ประวัติการรักษา — ต้องถาม]
- ยาที่ลองใช้แล้ว: ยังไม่ได้กินยาอะไรมาเลย
- ประวัติเคยเป็น: เคยเป็นแบบนี้มาก่อน

[หมวด 4: ความปลอดภัย — CRITICAL ต้องถาม]
- โรคประจำตัว: ไม่มี
- ยาประจำ: ไม่มี
- ประวัติแพ้ยา: ไม่มี

[หมวด 6: Red Flags — ถ้าถูกถาม]
- ไม่มี`,
    diagnosisAnswer: 'คออักเสบจากแบคทีเรีย (Bacterial Pharyngitis) — ประเมินตาม Mc Isaac score: มีไข้ ≥38°C, ไม่ไอ, มีจุดหนองขาวที่ทอนซิล',
    drugAnswer: {
      firstLine:    ['amoxicillin_500'],
      alternatives: ['clindamycin_300', 'clarithromycin_250'],
      unacceptable: [],
      regimen: {
        amoxicillin_500:    'กิน 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น นาน 10 วัน',
        clindamycin_300:    'กิน 1 เม็ด วันละ 3 ครั้ง หลังอาหาร เช้า กลางวัน เย็น นาน 10 วัน',
        clarithromycin_250: 'กิน 1 เม็ด วันละ 2 ครั้ง หลังอาหาร เช้า-เย็น นาน 10 วัน',
      },
      counseling: [
        'กินยาปฏิชีวนะต่อเนื่องจนหมด ห้ามหยุดยาเองแม้อาการจะดีขึ้นแล้ว เพราะจะเสี่ยงเชื้อดื้อยา',
        'เลี่ยงของมันของทอด จิบน้ำอุ่นเยอะๆ พักผ่อนให้เพียงพอ',
        'ถ้าอาการไม่ดีขึ้นใน 2-3 วัน หรือมีผื่น หายใจลำบาก ให้รีบไปพบแพทย์',
      ],
    },
    // ปิดไว้ก่อน — เปิดใช้จริงกับนักศึกษาเมื่อทีมพอใจ prompt ที่จูนใน Prompt Lab แล้วเท่านั้น
    isActive: false,
  },
];

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

main().catch(e => {
  console.error('\n❌  Error:', e.message);
  process.exit(1);
});
