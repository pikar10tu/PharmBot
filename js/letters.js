// ============================================================
//  letters.js — จดหมายประกาศถึงผู้เรียนทั้งรุ่น
//  ฟังก์ชันบริสุทธิ์ทั้งไฟล์ (ไม่แตะ DOM ไม่แตะ Firebase) เพื่อให้ unit test ได้
//  — คู่กับ setup/test/letters.test.js
// ============================================================

// เพิ่มจดหมายใหม่ = เพิ่ม object ไว้ "บนสุด" (เรียงใหม่สุดก่อน)
//   id         ห้ามซ้ำและห้ามแก้ทีหลัง — เป็นกุญแจของสถานะ "อ่านแล้ว" ใน /letterReads
//   popupUntil วันสุดท้ายที่ยอมให้เด้ง (รวมวันนั้น) · null = ไม่เด้งเลย ขึ้นแค่ในกล่อง
//   body       plain text เท่านั้น เรนเดอร์ผ่าน escapeHtmlBr() — ใส่ HTML ไม่ทำงาน
// ไม่มีฟิลด์ผู้ส่งโดยตั้งใจ: Pre-CC1 เป็นคนละงานกับทีมพัฒนาแอป การเซ็นชื่อทีม
// จะสื่อความเป็นเจ้าของผิด — ฉบับไหนอยากลงชื่อ เขียนต่อท้าย body เอา
const LETTERS = [
  {
    id:         'pre-cc1-2026-09',
    subject:    '📊 ผลสอบ Pre-CC1 ออกแล้ว',
    date:       '2026-09-03',
    popupUntil: '2026-09-14',
    body:       '• ผ่านเกณฑ์ 47 / 83 คน (56.63%)\n• คะแนนเฉลี่ยรวม 11.19 / 16',
  },
];

// จดหมายฉบับแรกที่ "ยังไม่อ่าน และยังไม่เลยวันหมดอายุ" — ไม่มีก็คืน null
// เทียบวันเป็นสตริง YYYY-MM-DD ตรง ๆ เพราะเรียงตามพจนานุกรม = เรียงตามเวลาอยู่แล้ว
// (ผ่าน Date จะได้ timezone ของเครื่องผู้เรียนมาด้วย ซึ่งไม่ใช่สิ่งที่อยากให้ตัดสิน)
function pickPopupLetter(letters, readIds, todayStr) {
  const read = new Set(readIds || []);
  for (const letter of letters || []) {
    if (read.has(letter.id)) continue;
    if (!letter.popupUntil) continue;
    if (todayStr > letter.popupUntil) continue;
    return letter;
  }
  return null;
}

// ยอดบน badge — นับทุกฉบับที่ยังไม่เปิด ไม่สน popupUntil
// (หมดเวลาเด้งแล้วไม่ได้แปลว่าอ่านแล้ว จดหมายยังคาอยู่ในกล่อง)
function countUnread(letters, readIds) {
  const read = new Set(readIds || []);
  return (letters || []).filter(l => !read.has(l.id)).length;
}

// วันนี้ในรูปแบบ YYYY-MM-DD ตามเวลาเครื่องผู้เรียน
function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// '2026-09-03' → '3 ก.ย. 2026' (ใช้ ค.ศ. ให้ตรงกับที่เหลือในแอป)
const _TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function formatLetterDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${Number(m[3])} ${_TH_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
