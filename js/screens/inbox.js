// ============================================================
//  screens/inbox.js — กล่องจดหมาย + pop-up ประกาศ
//  ข้อมูลจดหมายอยู่ js/letters.js · สถานะอ่านแล้วอยู่ Firestore /letterReads/{uid}
// ============================================================

// อ่าน /letterReads ครั้งเดียวต่อการล็อกอิน แล้วถือไว้ในหน่วยความจำ
// (navbar ถูก re-render ทุกหน้าจอ ถ้าไม่แคชจะยิง Firestore ทุกครั้งที่เปลี่ยนหน้า)
// null = ยังไม่ได้โหลด หรือโหลดไม่สำเร็จ — สองกรณีนี้ต้อง "ไม่เดา" เหมือนกัน
let _readIds = null;

async function loadLetterReads(force = false) {
  if (_readIds && !force) return _readIds;
  const uid = getCurrentUser()?.uid;
  if (!uid) return null;
  try {
    _readIds = await getLetterReads(uid);
    return _readIds;
  } catch (e) {
    // อ่านไม่ได้แล้วเดาว่า "ยังไม่อ่าน" = เด้งใส่คนที่อ่านไปแล้ว — เงียบไว้ดีกว่า
    // ทิ้งแคชด้วยเมื่อ force: โหลดใหม่แล้วไม่สำเร็จ = ไม่รู้สถานะจริงแล้ว
    // การคืนของเก่าต่อคือการเดา ซึ่งเป็นสิ่งเดียวที่ไฟล์นี้ห้ามตัวเองไว้
    _readIds = null;
    console.warn('อ่าน /letterReads ไม่สำเร็จ — ข้ามการเด้งจดหมายรอบนี้', e);
    return null;
  }
}

// ทำเครื่องหมายอ่านแล้วแบบ optimistic — UI ต้องไม่รอเน็ต
// เขียนไม่ผ่าน = รอบหน้าเด้งซ้ำ ซึ่งยอมรับได้ ดีกว่าค้าง modal ทับหน้าจอ
async function markLetterReadLocal(letterId) {
  if (_readIds?.includes(letterId)) return;
  const uid = getCurrentUser()?.uid;
  if (!uid) return;

  _readIds = [...(_readIds || []), letterId];
  refreshMailBadge();

  try { await markLetterRead(uid, letterId); }
  catch (e) { console.warn('บันทึกสถานะอ่านแล้วไม่สำเร็จ', e); }
}

// ── Navbar ────────────────────────────────────────────────────
// เรียกจาก renderNavbar() ใน dashboard.js — navbar ถูก re-render ทุกหน้าจอ
// จึงต้องคำนวณยอดจากแคชตอนสร้าง HTML ไม่งั้น badge จะหายเมื่อเปลี่ยนหน้า
function mailButtonHtml() {
  const n = _readIds ? countUnread(LETTERS, _readIds) : 0;
  const label = n ? `กล่องจดหมาย — มี ${n} ฉบับที่ยังไม่อ่าน` : 'กล่องจดหมาย';
  return `<button class="btn btn-ghost btn-sm mail-btn" id="mail-btn"
    title="กล่องจดหมาย" aria-label="${escapeHtml(label)}">✉️<span id="mail-badge"
    class="mail-badge ${n ? '' : 'hidden'}">${n}</span></button>`;
}

function refreshMailBadge() {
  const badge = document.getElementById('mail-badge');
  const btn   = document.getElementById('mail-btn');
  if (!badge || !btn) return;

  const n = _readIds ? countUnread(LETTERS, _readIds) : 0;
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
  btn.setAttribute('aria-label',
    n ? `กล่องจดหมาย — มี ${n} ฉบับที่ยังไม่อ่าน` : 'กล่องจดหมาย');
}

// เรียกจากท้าย renderDashboard() ที่เดียว — เป็นหน้าแรกหลังล็อกอินเสมอ
// ยิงหลายหน้าจอเสี่ยงเด้งซ้อนกลางเซสชันฝึก
async function initMailbox() {
  const ids = await loadLetterReads();
  refreshMailBadge();
  if (!ids) return;

  const letter = pickPopupLetter(LETTERS, ids, todayISO());
  if (letter) showLetterPopup(letter);
}

// ── Pop-up ────────────────────────────────────────────────────
function showLetterPopup(letter) {
  document.getElementById('letter-modal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'letter-modal';
  modal.className = 'modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'letter-modal-title');
  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3 id="letter-modal-title">${escapeHtml(letter.subject)}</h3>
        <button class="btn btn-ghost btn-sm" id="letter-modal-x" aria-label="ปิด">✕</button>
      </div>
      <div class="modal-body">
        <div class="text-dim text-sm mb-2">${escapeHtml(formatLetterDate(letter.date))}</div>
        <div class="letter-body">${escapeHtmlBr(letter.body)}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="letter-modal-ok">รับทราบ</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // ปิดทางไหนก็นับว่าอ่านแล้ว — เห็นแล้วคือเห็นแล้ว
  // ถ้าไม่นับ จะเด้งซ้ำทุกครั้งที่เข้าหน้าแรกจนน่ารำคาญ
  const close = () => {
    document.removeEventListener('keydown', onKey);
    modal.remove();
    markLetterReadLocal(letter.id);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };

  modal.querySelector('#letter-modal-ok').addEventListener('click', close);
  modal.querySelector('#letter-modal-x').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', onKey);

  modal.querySelector('#letter-modal-ok').focus();
}

// ── หน้ากล่องจดหมาย (#inbox) ──────────────────────────────────
async function renderInbox(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:0.75rem;">
        <div>
          <h2>✉️ กล่องจดหมาย</h2>
          <p class="text-dim text-sm mt-1">ประกาศถึงทุกคน</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="inbox-back">← กลับหน้าแรก</button>
      </div>
      <div id="letter-list"></div>
    </div>
  `;

  document.getElementById('inbox-back').addEventListener('click', () => Router.go('dashboard'));

  await loadLetterReads();
  refreshMailBadge();
  _renderLetterList();
}

function _renderLetterList() {
  const list = document.getElementById('letter-list');
  if (!list) return;

  if (!LETTERS.length) {
    list.innerHTML = `<div class="card text-dim" style="text-align:center;">ยังไม่มีจดหมาย</div>`;
    return;
  }

  // _readIds เป็น null (อ่านไม่ได้) → แสดงทุกฉบับเป็น "อ่านแล้ว" ไม่ขึ้นจุด
  // ดีกว่าติดจุดแดงมั่วให้ทุกฉบับทั้งที่เขาอ่านไปหมดแล้ว
  const read = new Set(_readIds || LETTERS.map(l => l.id));

  list.innerHTML = LETTERS.map(l => `
    <div class="card mb-2 letter-card" data-id="${escapeHtml(l.id)}" style="cursor:pointer;">
      <div class="flex items-center gap-2" style="justify-content:space-between;">
        <div class="flex items-center gap-2" style="min-width:0;">
          <span class="mail-dot ${read.has(l.id) ? 'hidden' : ''}" aria-hidden="true"></span>
          <h3 style="margin:0;">${escapeHtml(l.subject)}</h3>
        </div>
        <span class="text-dim text-sm" style="white-space:nowrap;">${escapeHtml(formatLetterDate(l.date))}</span>
      </div>
      <div class="letter-body mt-2 hidden">${escapeHtmlBr(l.body)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.letter-card').forEach(card => {
    makeClickable(card, 'เปิดอ่านจดหมาย');
    card.addEventListener('click', () => {
      const body = card.querySelector('.letter-body');
      const wasHidden = body.classList.contains('hidden');
      body.classList.toggle('hidden');
      card.setAttribute('aria-expanded', wasHidden ? 'true' : 'false');
      if (wasHidden) {
        card.querySelector('.mail-dot').classList.add('hidden');
        markLetterReadLocal(card.dataset.id);
      }
    });
  });
}
