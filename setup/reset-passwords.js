// ============================================================
//  reset-passwords.js
//  Reset รหัสผ่านทุก participant (P00001–P00030) ให้เป็นรหัสใหม่
//  แล้ว export CSV ใหม่สำหรับพิมพ์แจก
//
//  วิธีใช้:
//    node reset-passwords.js
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌  ไม่พบ serviceAccountKey.json\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const auth = admin.auth();

const OUTPUT_FILE = path.join(__dirname, 'participants-reset.csv');

function generatePassword(len = 8) {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  let pw = '';
  pw += upper[Math.floor(Math.random() * upper.length)];
  pw += lower[Math.floor(Math.random() * lower.length)];
  pw += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 3; i < len; i++) pw += all[Math.floor(Math.random() * all.length)];
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

function toEmail(pid) {
  return `${pid.toLowerCase()}@pharmbot.local`;
}

async function main() {
  console.log('\n🔑  PharmBot — Reset Passwords (ทุก participant)');
  console.log('─'.repeat(50));

  // ดึง users ทั้งหมดจาก Firebase Auth
  let allUsers = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    allUsers = allUsers.concat(result.users);
    pageToken = result.pageToken;
  } while (pageToken);

  // กรองเฉพาะ P00xxx
  const participants = allUsers
    .filter(u => /^p\d{5}@pharmbot\.local$/.test(u.email))
    .sort((a, b) => a.email.localeCompare(b.email));

  console.log(`   พบ ${participants.length} participants\n`);

  const results = [];

  for (const user of participants) {
    const pid = user.email.split('@')[0].toUpperCase();
    const pw  = generatePassword(8);
    try {
      await auth.updateUser(user.uid, { password: pw });
      results.push({ participantId: pid, password: pw, uid: user.uid, email: user.email });
      process.stdout.write(`  ✅  ${pid}\n`);
    } catch (e) {
      console.error(`  ❌  ${pid}: ${e.message}`);
      results.push({ participantId: pid, password: 'ERROR', uid: user.uid, email: user.email });
    }
  }

  // Export CSV
  const csvLines = [
    'participantId,password,uid,email',
    ...results.map(r => `${r.participantId},${r.password},${r.uid},${r.email}`),
  ];
  fs.writeFileSync(OUTPUT_FILE, '﻿' + csvLines.join('\n'), 'utf8');

  const ok = results.filter(r => r.password !== 'ERROR').length;
  console.log('\n' + '─'.repeat(50));
  console.log(`✅  Reset สำเร็จ ${ok}/${results.length} accounts`);
  console.log(`📄  CSV อยู่ที่: ${OUTPUT_FILE}`);
  console.log('\n⚠️  เก็บไฟล์ participants-reset.csv ไว้ในที่ปลอดภัย\n');

  process.exit(0);
}

main().catch(e => {
  console.error('\n❌  Error:', e.message);
  process.exit(1);
});
