// ============================================================
//  research-info.js — ข้อความด้านจริยธรรมที่ EC ขอให้แสดงในแอป (ก.ย. 2569)
//  ต้องตรงกับเอกสารข้อมูลสำหรับผู้เข้าร่วมวิจัย ScF 05_01 (ต้นฉบับ: D:\My works\PFH_DOC) — แก้ที่นั่นต้องแก้ที่นี่ด้วย
//  ใช้ใน: login (ลิงก์นโยบาย), summary (ช่องทางติดต่อ), chat (คำเตือนก่อนสนทนา)
// ============================================================

// EC (69PH121 ครั้งที่ 1) ให้ตัดตำแหน่งวิชาการออก และใช้คำว่า "ผู้เข้าร่วมวิจัย" ทั้งเอกสาร
// ⛔ ห้ามใส่เบอร์โทรส่วนตัวในไฟล์นี้ — ไฟล์ JS ทุกไฟล์เปิดอ่านได้สาธารณะบน GitHub Pages/repo (เบอร์อยู่ใน PIS แล้ว)
const RESEARCH_CONTACTS = [
  { name: 'ปัทมวรรณ โกสุมา', email: 'pattamako@tu.ac.th' },
  { name: 'นางสาวนภัสวรรณ แผลงศร', email: 'napassawan.phl@dome.tu.ac.th' },
  { name: 'นางสาวนันตรา อินทร์น้อย', email: 'nantra.inn@dome.tu.ac.th' },
  { name: 'นายประวิชญ์ อำนวยพันธ์วิไล', email: 'prawich.aum@dome.tu.ac.th' },
];

const EC_CONTACT_TEXT = 'คณะกรรมการจริยธรรมการวิจัยในคน มหาวิทยาลัยธรรมศาสตร์ สาขาวิทยาศาสตร์ ห้อง 112 ชั้น 1 อาคารโดมบริหาร ศูนย์รังสิต โทร. 02-564-4440 ต่อ 7358 · ecsctu3@tu.ac.th';

const PII_WARNING = 'กรุณาหลีกเลี่ยงการระบุชื่อจริง นามสกุล หรือข้อมูลส่วนบุคคลใด ๆ ของท่านระหว่างการสนทนากับผู้ป่วยเสมือน';

function researchContactHtml() {
  return RESEARCH_CONTACTS.map(c =>
    `<div>${escapeHtml(c.name)} (ผู้วิจัย) — <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>`
  ).join('');
}

function showPrivacyModal() {
  document.getElementById('privacy-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'privacy-modal';
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div class="modal-header">
        <h3 id="privacy-title">นโยบายความเป็นส่วนตัวและสิทธิของผู้เข้าร่วมวิจัย</h3>
        <button class="btn btn-ghost btn-sm" data-close aria-label="ปิด">✕</button>
      </div>
      <div class="modal-body privacy-body">
        <h4>สิทธิของท่าน</h4>
        <ul>
          <li>การเข้าร่วมโครงการวิจัยนี้ขึ้นอยู่กับความสมัครใจของท่าน ท่านสามารถปฏิเสธการเข้าร่วมได้</li>
          <li>ท่านสามารถ<b>ถอนตัว (ถอนความยินยอม) ได้ทุกเมื่อ</b>โดยไม่ต้องแจ้งเหตุผล และไม่กระทบต่อการเรียน การประเมินผลการศึกษา หรือสิทธิใด ๆ ของท่าน</li>
          <li>ท่านสามารถหยุดพักหรือยุติการเข้าร่วมได้หากรู้สึกไม่สบายใจ</li>
        </ul>
        <h4>ข้อมูลที่เก็บและการใช้ข้อมูล</h4>
        <ul>
          <li>ระบบใช้<b>รหัสผู้เข้าร่วม</b>แทนชื่อจริง ข้อมูลที่บันทึก ได้แก่ ข้อความถอดความบทสนทนากับผู้ป่วยเสมือน รายการยาที่จ่าย และผลการประเมิน เพื่อใช้ในการวิจัยเท่านั้น</li>
          <li>ข้อมูลทั้งหมดเก็บเป็นความลับ จำกัดการเข้าถึงเฉพาะทีมผู้วิจัย และรายงานผลในภาพรวมโดยไม่ระบุตัวบุคคล</li>
          <li>ระบบใช้บริการประมวลผลเสียงของผู้ให้บริการภายนอก (Google Gemini) ซึ่งข้อมูลเสียงอาจถูกส่งไปประมวลผลบนเซิร์ฟเวอร์ในต่างประเทศ ผู้วิจัยตั้งค่าไม่ให้นำข้อมูลไปใช้ฝึกโมเดล และ<b>ไม่เก็บไฟล์เสียงถาวร</b>ในระบบของโครงการ</li>
          <li>${escapeHtml(PII_WARNING)}</li>
          <li>ข้อมูลแบบสอบถาม แบบประเมิน และผลคะแนน เก็บรักษาในรูปแบบที่ไม่ระบุตัวตนเป็นเวลา 3 ปีนับจากสิ้นสุดโครงการ แล้วลบไฟล์อิเล็กทรอนิกส์อย่างถาวรโดยไม่สามารถกู้คืนได้ ไม่มีการเก็บไว้เพื่องานวิจัยในอนาคต</li>
          <li>คณะกรรมการจริยธรรมการวิจัยในคนและผู้มีอำนาจกำกับดูแลการวิจัยอาจเข้าดูข้อมูลเพื่อตรวจสอบขั้นตอนการวิจัย</li>
        </ul>
        <h4>ติดต่อสอบถาม / ขอถอนตัว</h4>
        <div class="text-sm">${researchContactHtml()}</div>
        <p class="text-sm text-dim mt-1">หากไม่ได้รับการปฏิบัติตามข้อมูลข้างต้น ร้องเรียนได้ที่ ${escapeHtml(EC_CONTACT_TEXT)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-close>รับทราบ</button>
      </div>
    </div>`;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector('[data-close]').focus();
}
