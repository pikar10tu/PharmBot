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

  // ── case002: ท้องเสีย (GI) ───────────────────────────────────
  {
    id: 'case002_gi_diarrhea',
    groupId:    'GI',
    difficulty: 'easy',
    title:      'ท้องเสียเฉียบพลัน — Acute Diarrhea',
    gender:     'male',
    age:        30,
    occupation: 'พนักงานออฟฟิศ',
    sceneDesc:  'ผู้ชายวัยทำงาน หน้าตาเหนื่อยๆ มือกุมท้อง เดินรีบๆ เข้ามาที่เคาน์เตอร์',
    chiefComplaint: 'ท้องเสียครับ',
    secretInfo: `บุคลิก/อารมณ์: รีบๆ เพราะต้องกลับไปทำงาน พูดกระชับ ตรงไปตรงมา

ข้อมูลที่ต้องรอให้เภสัชกรถามก่อนถึงจะตอบ (ห้ามบอกเอง):
- ระยะเวลา: เป็นมาตั้งแต่เช้า ถ่ายไปแล้ว 4-5 ครั้ง
- ลักษณะอุจจาระ: เหลว ไม่มีมูกเลือด
- อาการร่วม: คลื่นไส้นิดหน่อย ไม่มีไข้ ไม่อาเจียน
- สาเหตุที่สงสัย: กินข้าวนอกบ้านเมื่อคืน เพื่อนที่กินด้วยกันก็ท้องเสียเหมือนกัน
- การรักษาเบื้องต้น: ยังไม่ได้กินยาอะไร
- โรคประจำตัว: ไม่มี
- ยาที่กินอยู่ประจำ: ไม่มี
- ประวัติแพ้ยา: ไม่มี`,
    specificChecklist: `1. ถามลักษณะอุจจาระ (มีมูก/เลือดหรือไม่) เพื่อแยก invasive diarrhea
2. ถามจำนวนครั้งที่ถ่ายและระยะเวลา เพื่อประเมินความรุนแรง
3. ถามอาการขาดน้ำ (ปากแห้ง วิงเวียน ปัสสาวะน้อยลงหรือไม่)
4. แนะนำการดื่มน้ำเกลือแร่และวิธีเตรียมที่ถูกต้อง`,
    diagnosisAnswer: 'ท้องเสียเฉียบพลันจากอาหาร (Acute Gastroenteritis / Food Poisoning)',
    drugAnswer: {
      firstLine:    ['ors', 'loperamide_2'],
      alternatives: ['activated_charcoal'],
      unacceptable: ['amoxicillin_500', 'norfloxacin_400'],
      regimen: {
        ors:          'ละลายน้ำ 1 ซอง ดื่มทีละน้อยบ่อยๆ หลังถ่ายแต่ละครั้ง',
        loperamide_2: 'กิน 2 เม็ดทันที แล้วกิน 1 เม็ดหลังถ่ายแต่ละครั้ง ไม่เกิน 8 เม็ด/วัน',
        activated_charcoal: 'กิน 2 เม็ด วันละ 3 ครั้ง ห่างยาอื่นอย่างน้อย 2 ชั่วโมง',
      },
      counseling: [
        'ดื่มน้ำเกลือแร่ทดแทนน้ำที่เสียไป อย่างน้อยครั้งละ 200-300 ml หลังถ่ายแต่ละครั้ง',
        'งดอาหารมัน เผ็ด และนม ทานอาหารอ่อนๆ เช่น ข้าวต้ม โจ๊ก',
        'ถ้ามีไข้สูง ถ่ายมีเลือด หรืออาการไม่ดีขึ้นใน 2 วัน ให้รีบไปพบแพทย์',
      ],
    },
    isActive: true,
  },

  // ── case003: ปวดหลัง (MSK) ───────────────────────────────────
  {
    id: 'case003_msk_backpain',
    groupId:    'MSK',
    difficulty: 'easy',
    title:      'ปวดหลังส่วนล่าง — Low Back Pain',
    gender:     'random',
    age:        40,
    occupation: 'พนักงานโรงงาน',
    sceneDesc:  'ผู้ใหญ่วัยกลางคน ท่าทางเดินตัวเอียงเล็กน้อย มือจับบริเวณเอว เข้ามาที่ร้านยา',
    chiefComplaint: 'ปวดหลังครับ/ค่ะ',
    secretInfo: `บุคลิก/อารมณ์: พูดช้า รอบคอบ ดูเจ็บปวดอยู่ แต่ไม่ได้ทุรนทุราย

ข้อมูลที่ต้องรอให้เภสัชกรถามก่อนถึงจะตอบ (ห้ามบอกเอง):
- ระยะเวลา: เป็นมา 2 วัน หลังยกของหนักที่โรงงาน
- ตำแหน่ง: ปวดหลังส่วนล่าง ไม่ร้าวลงขา
- ลักษณะอาการ: ปวดตื้อๆ ปวดมากเวลาก้มหรือเปลี่ยนท่า
- อาการร่วม: ไม่มีไข้ ไม่มีอาการชาขา ปัสสาวะปกติ
- การรักษาเบื้องต้น: ลองนวดแล้วยังไม่หาย
- โรคประจำตัว: ไม่มี
- ยาที่กินอยู่ประจำ: ไม่มี
- ประวัติแพ้ยา: แพ้ยา Aspirin (ลมพิษ)`,
    specificChecklist: `1. ถามอาการ Red flags ของปวดหลัง (ชาขา ปัสสาวะ/อุจจาระผิดปกติ ไข้ น้ำหนักลด)
2. ถามประวัติแพ้ยา โดยเฉพาะ NSAIDs ก่อนแนะนำยา
3. แนะนำท่านอนและการพักผ่อนที่ถูกต้อง
4. แนะนำให้พบแพทย์ถ้าอาการไม่ดีขึ้นใน 1 สัปดาห์หรือมีอาการชาขา`,
    diagnosisAnswer: 'ปวดหลังส่วนล่างจากกล้ามเนื้อ (Acute Mechanical Low Back Pain / Muscle Strain)',
    drugAnswer: {
      firstLine:    ['ibuprofen_400'],
      alternatives: ['paracetamol_500', 'naproxen_250', 'diclofenac_gel'],
      unacceptable: ['aspirin_300'],
      regimen: {
        ibuprofen_400:   'กิน 1 เม็ด วันละ 3 ครั้ง หลังอาหาร นาน 3-5 วัน',
        paracetamol_500: 'กิน 1-2 เม็ด ทุก 4-6 ชั่วโมง เมื่อมีอาการ ไม่เกิน 8 เม็ด/วัน',
        naproxen_250:    'กิน 1 เม็ด วันละ 2 ครั้ง หลังอาหาร',
        diclofenac_gel:  'ทาบริเวณที่ปวด วันละ 3-4 ครั้ง',
      },
      counseling: [
        'ผู้ป่วยแพ้ Aspirin — ระวัง cross-reactivity กับ NSAIDs ทุกตัว ให้ใช้ Paracetamol เป็น first-line แทน',
        'ประคบอุ่นบริเวณที่ปวด ครั้งละ 15-20 นาที วันละ 2-3 ครั้ง',
        'หลีกเลี่ยงการยกของหนักและการก้มตัวนานๆ พักผ่อนให้เพียงพอ',
        'ถ้ามีอาการชาขา ปัสสาวะผิดปกติ หรือปวดมากขึ้น ให้รีบไปพบแพทย์',
      ],
    },
    isActive: true,
  },

  // ── case004: เชื้อราที่เท้า (DERM) ──────────────────────────
  {
    id: 'case004_derm_tinea_pedis',
    groupId:    'DERM',
    difficulty: 'medium',
    title:      'เชื้อราที่เท้า — Tinea Pedis',
    gender:     'male',
    age:        22,
    occupation: 'นักศึกษา',
    sceneDesc:  'ผู้ชายหนุ่ม ท่าทางเขินๆ นิดหน่อย เดินเข้ามาถามเบาๆ',
    chiefComplaint: 'คันเท้าครับ',
    secretInfo: `บุคลิก/อารมณ์: พูดสุภาพ เกรงใจ อายนิดหน่อยที่มาถามเรื่องเท้า

ข้อมูลที่ต้องรอให้เภสัชกรถามก่อนถึงจะตอบ (ห้ามบอกเอง):
- ระยะเวลา: คันมาได้ประมาณ 2 สัปดาห์แล้ว
- ตำแหน่ง: คันระหว่างนิ้วเท้า โดยเฉพาะนิ้วที่ 4-5 ทั้งสองข้าง
- ลักษณะผิวหนัง: ผิวลอกเป็นขุย มีรอยแดง บางส่วนแตก
- ปัจจัยเสี่ยง: ใส่รองเท้าบูทเวลาออกกำลังกายทุกวัน เท้าเปียกอยู่บ่อยๆ
- การรักษาเบื้องต้น: ลองใช้แป้งโรยเท้าแล้วยังไม่หาย
- โรคประจำตัว: ไม่มี
- ยาที่กินอยู่ประจำ: ไม่มี
- ประวัติแพ้ยา: ไม่มี`,
    specificChecklist: `1. ถามตำแหน่งและลักษณะผื่น/อาการเพื่อแยกจากโรคผิวหนังอื่น
2. ถามปัจจัยเสี่ยง (สวมรองเท้าอับชื้น เท้าเปียกบ่อย)
3. อธิบายวิธีทายาที่ถูกต้อง (ทาให้เกินขอบผื่น และทาต่อเนื่องหลังหาย 1-2 สัปดาห์)
4. แนะนำการดูแลเท้าเพื่อป้องกันการกลับเป็นซ้ำ`,
    diagnosisAnswer: 'เชื้อราที่เท้า (Tinea Pedis / Athlete\'s Foot)',
    drugAnswer: {
      firstLine:    ['clotrimazole_1pct'],
      alternatives: [],
      unacceptable: ['hydrocortisone_1pct'],
      regimen: {
        clotrimazole_1pct: 'ทาบริเวณที่มีเชื้อราและรอบๆ วันละ 2 ครั้ง เช้า-เย็น นาน 4 สัปดาห์ และทาต่ออีก 1-2 สัปดาห์หลังอาการหาย',
      },
      counseling: [
        'ทายาให้เกินขอบรอยโรคออกมาประมาณ 1 ซม. และทาต่อเนื่องแม้อาการจะดีขึ้นแล้ว',
        'ล้างเท้าให้สะอาด เช็ดให้แห้งสนิทโดยเฉพาะซอกนิ้ว ก่อนทายา',
        'เลือกใส่ถุงเท้าที่ระบายอากาศได้ดี เปลี่ยนถุงเท้าทุกวัน และหลีกเลี่ยงรองเท้าอับชื้น',
        'ห้ามใช้ยา steroid ทาเพราะจะทำให้เชื้อราลุกลามมากขึ้น',
      ],
    },
    isActive: true,
  },

  // ── case005: Red Flag — ปวดหัวรุนแรง (REFER) ─────────────────
  {
    id: 'case005_refer_thunderclap',
    groupId:    'REFER',
    difficulty: 'hard',
    title:      'ปวดหัวรุนแรงฉับพลัน — Red Flag Headache',
    gender:     'female',
    age:        45,
    occupation: 'แม่บ้าน',
    sceneDesc:  'ผู้หญิงวัยกลางคน หน้าตาเจ็บปวดมาก มือกุมศีรษะ เดินเข้ามาพร้อมสามี',
    chiefComplaint: 'ปวดหัวมากมากเลยค่ะ',
    secretInfo: `บุคลิก/อารมณ์: ดูเจ็บปวดมาก พูดช้าๆ สีหน้าไม่สบาย สามีพยุงมา

ข้อมูลที่ต้องรอให้เภสัชกรถามก่อนถึงจะตอบ (ห้ามบอกเอง):
- ระยะเวลา: เพิ่งเริ่มเมื่อ 1 ชั่วโมงที่แล้ว ปวดมากขึ้นเรื่อยๆ
- ลักษณะ: ปวดรุนแรงมากที่สุดในชีวิต เหมือนถูกตี รู้สึกปวดทั้งหัว
- อาการร่วม: คลื่นไส้ อาเจียน 1 ครั้ง คอแข็งนิดหน่อย ยังไม่มีไข้
- ประวัติ: ไม่เคยปวดหัวแบบนี้มาก่อน ไม่มีประวัติไมเกรน
- โรคประจำตัว: ความดันโลหิตสูง กินยา Amlodipine อยู่
- ยาที่กินอยู่ประจำ: Amlodipine 5mg วันละครั้ง
- ประวัติแพ้ยา: ไม่มี`,
    specificChecklist: `1. ถามลักษณะการปวด (thunderclap — ปวดรุนแรงที่สุดในชีวิตหรือไม่)
2. ถามอาการร่วม Red flag (คอแข็ง อาเจียน ไข้ ชา อ่อนแรง การมองเห็นเปลี่ยน)
3. ไม่จ่ายยาแก้ปวดและแนะนำส่งต่อโรงพยาบาลทันที
4. อธิบายเหตุผลที่ต้องส่งต่อให้ผู้ป่วยและญาติเข้าใจ`,
    diagnosisAnswer: 'Red Flag Headache — สงสัย Subarachnoid Hemorrhage ต้องส่งต่อโรงพยาบาลด่วน ห้ามจ่ายยาแก้ปวดและส่งกลับบ้าน',
    drugAnswer: {
      firstLine:    [],
      alternatives: [],
      unacceptable: ['paracetamol_500', 'ibuprofen_400', 'naproxen_250'],
      regimen: {},
      counseling: [
        'นี่คือเคส Red Flag — ห้ามจ่ายยาแก้ปวดและส่งกลับบ้าน',
        'แนะนำให้รีบไปห้องฉุกเฉินโรงพยาบาลทันที อธิบายว่าปวดหัวรุนแรงฉับพลันแบบนี้อาจเป็นอันตรายถึงชีวิต',
        'ถ้ามีรถ ให้นำส่งโรงพยาบาลเอง ถ้าไม่มีให้โทร 1669',
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
