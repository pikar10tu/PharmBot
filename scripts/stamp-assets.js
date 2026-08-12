#!/usr/bin/env node
// ============================================================
//  stamp-assets.js — เขียน ?v= ใน index.html จาก hash ของไฟล์จริง
//
//  ปัญหาเดิม: ต้องไล่ bump ?v= เองทีละไฟล์ (18 ไฟล์) ทุกครั้งที่แก้
//  ลืมเมื่อไหร่ = นักศึกษาได้ไฟล์เก่าจาก cache ทั้งที่ deploy ใหม่แล้ว
//  ซึ่งอันตรายมากกับงานวิจัย เพราะแต่ละคนอาจรันคนละเวอร์ชันโดยไม่มีใครรู้
//
//  รันอัตโนมัติใน GitHub Actions ก่อน upload artifact
//  รันเองก็ได้:  node scripts/stamp-assets.js [--check]
//    --check = ไม่เขียนไฟล์ แค่บอกว่าอันไหนไม่ตรง (exit 1 ถ้ามี)
// ============================================================

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT  = path.resolve(__dirname, '..');
const HTML  = path.join(ROOT, 'index.html');
const check = process.argv.includes('--check');

// จับเฉพาะ asset ในโปรเจกต์ (js/ หรือ css/) — ข้าม CDN ทั้งหมด
const RE = /(src|href)="((?:js|css)\/[^"?]+)\?v=([^"]*)"/g;

let html = fs.readFileSync(HTML, 'utf8');
let changed = 0, missing = 0;

html = html.replace(RE, (full, attr, file, oldV) => {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    console.error(`  ⚠️  ไม่พบไฟล์: ${file} (อ้างถึงใน index.html)`);
    missing++;
    return full;
  }
  const hash = crypto.createHash('md5').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
  if (hash !== oldV) {
    console.log(`  ${file}  ${oldV} → ${hash}`);
    changed++;
  }
  return `${attr}="${file}?v=${hash}"`;
});

if (missing) {
  console.error(`\n❌ มีไฟล์ที่อ้างถึงแต่ไม่มีอยู่จริง ${missing} ไฟล์`);
  process.exit(1);
}

if (check) {
  console.log(changed ? `\n❌ มี ${changed} ไฟล์ที่ ?v= ไม่ตรงกับเนื้อไฟล์` : '\n✅ ?v= ตรงกับเนื้อไฟล์ทุกตัว');
  process.exit(changed ? 1 : 0);
}

fs.writeFileSync(HTML, html);
console.log(changed ? `\n✅ อัปเดต ?v= แล้ว ${changed} ไฟล์` : '\n✅ ?v= ตรงอยู่แล้ว ไม่ต้องแก้');
