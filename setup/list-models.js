// ============================================================
//  list-models.js — แสดง Gemini models ที่ใช้ได้กับ API key นี้
//  วิธีใช้:  node list-models.js
// ============================================================

const admin = require('firebase-admin');
const https  = require('https');
const path   = require('path');
const fs     = require('fs');

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌  ไม่พบ serviceAccountKey.json\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

async function main() {
  // ── 1. ดึง API key จาก Firestore ──────────────────────────
  const snap = await db.collection('config').doc('gemini').get();
  if (!snap.exists) {
    console.error('❌  ไม่พบ /config/gemini ใน Firestore');
    process.exit(1);
  }
  const { apiKey } = snap.data();
  if (!apiKey) {
    console.error('❌  apiKey ใน /config/gemini ว่างอยู่');
    process.exit(1);
  }

  console.log('\n🔍  กำลังดึงรายการ models...\n');

  // ── 2. เรียก ListModels API ────────────────────────────────
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`;

  const data = await fetchJson(url);
  const models = data.models || [];

  if (!models.length) {
    console.log('ไม่พบ model ใดๆ — ตรวจสอบ API key อีกครั้ง');
    process.exit(0);
  }

  // ── 3. กรองเฉพาะ generateContent + bidiGenerateContent ────
  const textModels = models.filter(m =>
    m.supportedGenerationMethods?.includes('generateContent')
  );
  const liveModels = models.filter(m =>
    m.supportedGenerationMethods?.includes('bidiGenerateContent')
  );

  // ── 4. แสดงผล ─────────────────────────────────────────────
  console.log('═'.repeat(60));
  console.log('  💬  Text / Chat Models (generateContent)');
  console.log('═'.repeat(60));
  printModels(textModels);

  console.log('\n' + '═'.repeat(60));
  console.log('  🎙️  Live Voice Models (bidiGenerateContent)');
  console.log('═'.repeat(60));
  printModels(liveModels);

  console.log('\n' + '─'.repeat(60));
  console.log(`  รวม: ${models.length} models ทั้งหมด`);
  console.log('─'.repeat(60) + '\n');

  process.exit(0);
}

function printModels(list) {
  if (!list.length) { console.log('  (ไม่มี)\n'); return; }
  list.forEach(m => {
    const name        = m.name?.replace('models/', '') || '?';
    const displayName = m.displayName || '';
    const inputLimit  = m.inputTokenLimit  ? `in:${(m.inputTokenLimit/1000).toFixed(0)}k`  : '';
    const outputLimit = m.outputTokenLimit ? `out:${(m.outputTokenLimit/1000).toFixed(0)}k` : '';
    const limits      = [inputLimit, outputLimit].filter(Boolean).join(' ');
    console.log(`  ✅  ${name.padEnd(40)} ${displayName}`);
    if (limits) console.log(`      ${' '.repeat(40)} ${limits} tokens`);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('parse error: ' + body.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

main().catch(e => {
  console.error('❌  Error:', e.message);
  process.exit(1);
});
