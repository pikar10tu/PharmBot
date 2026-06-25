// ============================================================
//  update-models.js — อัพเดต model ที่ใช้ใน Firestore /config/gemini
//
//  Phase 4: แยก model สำหรับ patient simulation ออกจาก evaluation
//    - model     : ใช้กับผู้ป่วยจำลอง (Step 1, 3) — เน้นเร็ว ภาษาไทยเป็นธรรมชาติ
//    - evalModel : ใช้กับการประเมิน (Step 4) — เน้นแม่น ใช้ reasoning ก่อนให้คะแนน
//
//  วิธีรัน (ในโฟลเดอร์ setup/):
//      node update-models.js
//
//  ต้องมีไฟล์ setup/serviceAccountKey.json (ดาวน์โหลดจาก Firebase Console
//  → Project settings → Service accounts → Generate new private key)
//
//  *** ปรับค่า MODEL / EVAL_MODEL ด้านล่างได้ตามต้องการก่อนรัน ***
//  หมายเหตุ: apiKey ใน Firestore จะไม่ถูกแตะ (merge:true) — สคริปต์นี้แก้แค่ชื่อ model
// ============================================================

const admin = require('firebase-admin');

// ── ปรับตรงนี้ ──────────────────────────────────────────────
const MODEL      = 'gemini-2.0-flash';   // patient simulation (Step 1, 3)
const EVAL_MODEL = 'gemini-2.5-flash';   // evaluation (Step 4) — reasoning/ thinking
// ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')),
});

async function main() {
  const ref = admin.firestore().collection('config').doc('gemini');

  // อ่านค่าเดิมมาโชว์ก่อน เพื่อกันพลาด
  const before = (await ref.get()).data() || {};
  console.log('ก่อนอัพเดต:', {
    model: before.model || '(ไม่มี)',
    evalModel: before.evalModel || '(ไม่มี)',
    apiKey: before.apiKey ? '***มีอยู่แล้ว***' : '(ไม่มี)',
  });

  await ref.set({ model: MODEL, evalModel: EVAL_MODEL }, { merge: true });

  const after = (await ref.get()).data() || {};
  console.log('หลังอัพเดต:', {
    model: after.model,
    evalModel: after.evalModel,
    apiKey: after.apiKey ? '***ยังอยู่ครบ***' : '(ไม่มี — ต้องตั้ง apiKey ด้วย!)',
  });
  console.log('เสร็จเรียบร้อย ✅  (นักศึกษาที่ login ใหม่จะได้ค่า model ชุดนี้)');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('ผิดพลาด:', e.message);
    process.exit(1);
  });
