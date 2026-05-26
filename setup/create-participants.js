// ============================================================
//  create-participants.js
//  สร้าง participant accounts ใน Firebase Auth + Firestore
//  แล้ว export CSV สำหรับพิมพ์แจกผู้เข้าร่วม
//
//  วิธีใช้:
//    1. วางไฟล์ serviceAccountKey.json ไว้ใน folder นี้
//    2. แก้ CONFIG ด้านล่างตามต้องการ
//    3. npm install
//    4. node create-participants.js
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  startNumber:  1,    // เริ่มที่หมายเลขอะไร (P00001)
  count:        30,   // สร้างกี่คน
  prefix:       'P',  // prefix ของ ID (P00001, P00002 ...)
  padLength:    5,    // ตัวเลขกี่หลัก (5 = P00001)
  passwordLength: 8,  // รหัสผ่านกี่ตัวอักษร
  outputFile: 'participants.csv',  // ชื่อไฟล์ output
  adminEmail: 'admin@pharmbot.local',  // email admin (จะสร้างให้อัตโนมัติ)
  adminPassword: 'Admin@1234',         // รหัสผ่าน admin (เปลี่ยนได้)
};
// ─────────────────────────────────────────────────────────────

// โหลด service account key
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌  ไม่พบ serviceAccountKey.json');
  console.error('   ดาวน์โหลดจาก Firebase Console:');
  console.error('   Project Settings → Service accounts → Generate new private key\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

const auth = admin.auth();
const db   = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────

function generatePassword(len = 8) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 3; i < len; i++) {
    pw += all[Math.floor(Math.random() * all.length)];
  }
  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

function toEmail(participantId) {
  return `${participantId.toLowerCase()}@pharmbot.local`;
}

function formatId(num) {
  return CONFIG.prefix + String(num).padStart(CONFIG.padLength, '0');
}

async function createUser(participantId, password, role = 'student') {
  const email = toEmail(participantId);

  // สร้าง Auth account
  let userRecord;
  try {
    userRecord = await auth.createUser({ email, password, displayName: participantId });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      // ถ้ามีอยู่แล้ว ดึง UID แทน
      userRecord = await auth.getUserByEmail(email);
      console.log(`  ⚠️  ${participantId} มีอยู่แล้ว — ใช้ UID เดิม`);
    } else {
      throw e;
    }
  }

  // สร้าง Firestore /users/{uid}
  await db.collection('users').doc(userRecord.uid).set({
    participantId,
    role,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { participantId, email, password, uid: userRecord.uid, role };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀  PharmBot — สร้าง Participant Accounts');
  console.log(`   จำนวน: ${CONFIG.count} คน (${formatId(CONFIG.startNumber)} – ${formatId(CONFIG.startNumber + CONFIG.count - 1)})`);
  console.log('─'.repeat(50));

  const results = [];

  // สร้าง Admin account ก่อน
  console.log('\n[Admin]');
  try {
    const adminRecord = await auth.getUserByEmail(CONFIG.adminEmail).catch(() => null);
    if (adminRecord) {
      console.log(`  ⚠️  Admin มีอยู่แล้ว (${adminRecord.uid})`);
      await db.collection('users').doc(adminRecord.uid).set(
        { participantId: 'ADMIN', role: 'admin', createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      const rec = await auth.createUser({
        email:    CONFIG.adminEmail,
        password: CONFIG.adminPassword,
        displayName: 'ADMIN',
      });
      await db.collection('users').doc(rec.uid).set({
        participantId: 'ADMIN',
        role: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  ✅  สร้าง admin@pharmbot.local | pw: ${CONFIG.adminPassword}`);
    }
  } catch (e) {
    console.error(`  ❌  Admin: ${e.message}`);
  }

  // สร้าง Participant accounts
  console.log('\n[Participants]');
  for (let i = 0; i < CONFIG.count; i++) {
    const num  = CONFIG.startNumber + i;
    const pid  = formatId(num);
    const pw   = generatePassword(CONFIG.passwordLength);

    try {
      const result = await createUser(pid, pw, 'student');
      results.push(result);
      process.stdout.write(`  ✅  ${pid}\n`);
    } catch (e) {
      console.error(`  ❌  ${pid}: ${e.message}`);
      results.push({ participantId: pid, password: 'ERROR: ' + e.message, uid: '', role: 'student' });
    }
  }

  // Export CSV
  const csvLines = [
    'participantId,password,uid,email',
    ...results.map(r =>
      `${r.participantId},${r.password},${r.uid || ''},${toEmail(r.participantId)}`
    ),
  ];
  const csvPath = path.join(__dirname, CONFIG.outputFile);
  fs.writeFileSync(csvPath, '﻿' + csvLines.join('\n'), 'utf8');  // BOM สำหรับ Excel ไทย

  console.log('\n─'.repeat(50));
  console.log(`✅  เสร็จแล้ว! สร้างสำเร็จ ${results.filter(r => !r.password.startsWith('ERROR')).length}/${CONFIG.count} accounts`);
  console.log(`📄  CSV อยู่ที่: ${csvPath}`);
  console.log('\n⚠️  เก็บไฟล์ participants.csv ไว้ในที่ปลอดภัย — มีรหัสผ่านทั้งหมด\n');

  process.exit(0);
}

main().catch(e => {
  console.error('\n❌  Error:', e.message);
  process.exit(1);
});
