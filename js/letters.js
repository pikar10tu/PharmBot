// ============================================================
//  letters.js — จดหมายประกาศจากทีมพัฒนาถึงผู้เรียน "เรื่องของแอปนี้เท่านั้น"
//  ฟังก์ชันบริสุทธิ์ทั้งไฟล์ (ไม่แตะ DOM ไม่แตะ Firebase) เพื่อให้ unit test ได้
//  — คู่กับ setup/test/letters.test.js
// ============================================================

// ⛔ ขอบเขต: ที่นี่ใช้ประกาศ "เรื่องของ Pharm From Home" เท่านั้น
//    (เช่น เพิ่มเคสใหม่ · ปิดปรับปรุงระบบ · วิธีใช้โหมดเสียง)
//    ประกาศระดับชั้นปี (ผลสอบ · กิจกรรมรุ่น · เรื่องส่วนกลาง) เป็นของ **dashboard รุ่น**
//    (RxTU10 — ที่นั่นมี mailbox + ฟอร์มส่งถึงทุกคนในหน้า Admin อยู่แล้ว ไม่ต้องเขียนโค้ด)
//    เคยพลาดมาแล้ว: ประกาศผล Pre-CC1 ก.ย. 2026 ถูกลงที่นี่แทนที่จะเป็น dashboard

// เพิ่มจดหมายใหม่ = เพิ่ม object ไว้ "บนสุด" (เรียงใหม่สุดก่อน)
//   id         ห้ามซ้ำและห้ามแก้ทีหลัง — เป็นกุญแจของสถานะ "อ่านแล้ว" ใน /letterReads
//              (id ที่เคยปล่อยแล้วห้ามเอากลับมาใช้ซ้ำ — คนที่เคยอ่านฉบับเก่าจะไม่เห็นฉบับใหม่)
//   popupUntil วันสุดท้ายที่ยอมให้เด้ง (รวมวันนั้น) · null = ไม่เด้งเลย ขึ้นแค่ในกล่อง
//   body       plain text เท่านั้น เรนเดอร์ผ่าน escapeHtmlBr() — ใส่ HTML ไม่ทำงาน
// ไม่มีฟิลด์ผู้ส่งโดยตั้งใจ — ฉบับไหนอยากลงชื่อ เขียนต่อท้าย body เอา
//
// `var` ไม่ใช่ `const` โดยตั้งใจ: ตัวแปร top-level ของ classic script ที่ประกาศด้วย var
// จะกลายเป็น property ของ window → เทสต์ Playwright ยัดจดหมายตัวอย่างเข้ามาทดสอบกลไก
// ได้โดยไม่ต้องปล่อยจดหมายจริงใส่ผู้เรียน (const เป็น script scope reassign ไม่ได้)
var LETTERS = [
  // ว่างอยู่ = ไม่มีประกาศค้าง · กล่องจดหมายจะขึ้น "ยังไม่มีจดหมาย" และ badge ไม่โผล่
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
