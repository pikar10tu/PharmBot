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
const GROUPS = [
  { id: 'INF_URI',   label: 'URI — โรคระบบทางเดินหายใจส่วนบน', sortOrder: 1  },
  { id: 'GI',        label: 'GI — โรคระบบทางเดินอาหาร',        sortOrder: 2  },
  { id: 'MSK',       label: 'MSK — กล้ามเนื้อและกระดูก',        sortOrder: 3  },
  { id: 'DERM',      label: 'DERM — ผิวหนัง',                   sortOrder: 4  },
  { id: 'CVD',       label: 'CVD — หัวใจและหลอดเลือด',          sortOrder: 5  },
  { id: 'ENDO',      label: 'ENDO — ต่อมไร้ท่อ / เบาหวาน',     sortOrder: 6  },
  { id: 'NEURO',     label: 'NEURO — ระบบประสาท',               sortOrder: 7  },
  { id: 'PULM',      label: 'PULM — ระบบหายใจ',                 sortOrder: 8  },
  { id: 'RENAL',     label: 'RENAL — ไต / ระบบปัสสาวะ',        sortOrder: 9  },
  { id: 'INF_UTI',   label: 'INF_UTI — ติดเชื้อทางเดินปัสสาวะ',sortOrder: 10 },
  { id: 'ENT_EYE',   label: 'ENT/EYE — หู คอ จมูก ตา',         sortOrder: 11 },
  { id: 'GYN',       label: 'GYN — สูติ-นรีเวช',               sortOrder: 12 },
  { id: 'PSYCH',     label: 'PSYCH — จิตเวช',                   sortOrder: 13 },
  { id: 'REFER',     label: 'REFER — Red Flag / ส่งต่อ',        sortOrder: 14 },
  { id: 'SPECIAL',   label: 'SPECIAL — Polypharmacy / พิเศษ',   sortOrder: 15 },
];

// ── Cases ──────────────────────────────────────────────────────
const CASES = [
  {
    id: 'case001_uri_pharyngitis',
    groupId:    'INF_URI',
    difficulty: 'easy',
    title:      'เจ็บคอ — Bacterial Pharyngitis',
    gender:     'female',
    age:        25,
    occupation: 'นักศึกษา',
    sceneDesc:  'ผู้หญิงอายุราว 20 กว่า แต่งตัวสุภาพ ท่าทางเหนื่อยๆ นิดหน่อย เดินเข้ามายืนที่เคาน์เตอร์ร้านยา',
    chiefComplaint: 'เจ็บคอค่ะ',
    secretInfo: `บุคลิก/อารมณ์: พูดจาสุภาพ เป็นธรรมชาติ (ตอบแค่ "เจ็บคอ" หากเภสัชไม่ซักอาการอื่นเพิ่ม)

ข้อมูลที่ต้องรอให้เภสัชกรถามก่อนถึงจะตอบ (ห้ามบอกเอง):
- ระยะเวลา: เป็นมา 3 วันแล้ว
- อาการร่วม: มีไข้ (วัดได้ประมาณ 38 องศา), ไม่ไอ, ไม่มีน้ำมูก
- ลักษณะคอ (ถ้าเภสัชกรถามให้ส่องกระจก หรือถามถึงจุดขาว): ส่องกระจกดูแล้วเห็นมีจุดขาวๆ ที่คอค่ะ และกดข้างคอแล้วรู้สึกเจ็บๆ
- การรักษาเบื้องต้น: ยังไม่ได้กินยาอะไรมาเลย
- ประวัติเคยเป็น: เคยเป็นแบบนี้ตอนเด็กๆ
- โรคประจำตัว: ไม่มี
- ยาที่กินอยู่ประจำ: ไม่มี
- ประวัติแพ้ยา: ไม่มี`,
    specificChecklist: `1. ซักถามลักษณะเฉพาะเพื่อแยกโรค (เช่น ส่องดูคอมีจุดขาวไหม / กดข้างคอเจ็บไหม)
2. ประเมิน Red flags (เช่น อ้าปากได้ปกติไหม / หายใจสะดวกดีไหม)
3. เน้นย้ำให้ทานยาฆ่าเชื้อให้ครบตามกำหนด แม้อาการจะดีขึ้นแล้ว เพื่อป้องกันเชื้อดื้อยา`,
    diagnosisAnswer: 'คออักเสบจากแบคทีเรีย (Bacterial Pharyngitis / Strep Throat)',
    drugAnswer: {
      firstLine:    ['amoxicillin_500'],
      alternatives: ['azithromycin_500', 'cefalexin_500'],
      unacceptable: ['paracetamol_500'],
      regimen: {
        amoxicillin_500: 'กิน 1 เม็ด วันละ 2 ครั้ง (เช้า-เย็น) นาน 10 วัน',
        azithromycin_500: 'กิน 1 เม็ด วันละครั้ง นาน 3 วัน',
        cefalexin_500: 'กิน 1 เม็ด วันละ 4 ครั้ง นาน 10 วัน',
      },
      counseling: [
        'ต้องกินยาฆ่าเชื้อให้ครบ ห้ามหยุดยาเองแม้อาการจะดีขึ้นแล้ว',
        'จิบน้ำอุ่นบ่อยๆ พักผ่อนให้เพียงพอ เลี่ยงอาหารทอด/รสจัด',
        'ถ้าอาการไม่ดีขึ้นใน 2-3 วัน หรือมีผื่น หายใจลำบาก ให้รีบไปพบแพทย์',
      ],
    },
    isActive: true,
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

  console.log('\n' + '─'.repeat(50));
  console.log(`✅  เสร็จแล้ว — ${GROUPS.length} groups, ${CASES.length} cases\n`);
  process.exit(0);
}

main().catch(e => {
  console.error('\n❌  Error:', e.message);
  process.exit(1);
});
