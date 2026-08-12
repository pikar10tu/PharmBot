// ============================================================
//  screens/groups.js — หน้าเริ่มซักประวัติ
//  4 ตัวเลือก: สุ่มทุกระบบ + 3 ระบบโรค (เลือกแล้วสุ่มเคสในระบบนั้นทันที)
//  นักศึกษาเลือกเคสแบบเจาะจงไม่ได้ (ตามสเปกงานวิจัย)
// ============================================================

// 3 กลุ่มโรคตามสเปก (§3.4.1) — ต้องตรงกับ GROUPS ใน setup/seed-cases.js
const SYSTEMS = [
  { id: 'RESP',   labelTh: 'ระบบทางเดินหายใจ',                                emoji: '🫁' },
  { id: 'GU_STI', labelTh: 'ติดเชื้อทางเดินปัสสาวะ<br>และโรคติดต่อทางเพศสัมพันธ์', emoji: '🧫' },
  { id: 'NEURO',  labelTh: 'ระบบประสาท',                                       emoji: '🧠' },
];

// สุ่มเคส 1 เคสจากชุดที่โหลดมา แล้วเข้าโหมดซักประวัติ (random:true = ซ่อนชื่อเคส)
async function _startRandomCase(loader, cardEl) {
  if (cardEl.dataset.busy) return;
  cardEl.dataset.busy = '1';
  const orig = cardEl.innerHTML;
  cardEl.style.opacity = '0.6';
  cardEl.innerHTML = '<div class="text-center p-2"><span class="spinner"></span></div>';

  const restore = () => { cardEl.innerHTML = orig; cardEl.style.opacity = ''; delete cardEl.dataset.busy; };

  try {
    const cases = await loader();
    if (!cases.length) {
      restore();
      _showGroupsAlert('ยังไม่มีเคสในระบบนี้ กำลังเพิ่มเนื้อหา — ลองเลือกระบบอื่นหรือ “สุ่มทุกระบบ” ดูนะ');
      return;
    }
    const pick = cases[Math.floor(Math.random() * cases.length)];
    Router.go('chat', { caseId: pick.id, random: true });
  } catch (_) {
    restore();
    _showGroupsAlert('เกิดข้อผิดพลาด กรุณาลองใหม่');
  }
}

// เดิมใช้ alert() ซึ่งบล็อกทั้งหน้าและหน้าตาหลุดจากธีมทั้งแอป
// ใช้ .alert component ที่มีอยู่แล้วแทน + role="alert" ให้ screen reader อ่านทันที
function _showGroupsAlert(msg) {
  const box = document.getElementById('groups-alert');
  if (!box) return;
  box.className = 'alert alert-warning mb-3';
  box.setAttribute('role', 'alert');
  box.textContent = msg;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function renderGroups(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">← กลับ</button>
        <div style="flex:1">
          <h2>เริ่มซักประวัติ</h2>
          <p class="text-dim text-sm">สุ่มทุกระบบ หรือเลือกเจาะจงระบบโรค — ระบบจะสุ่มเคสให้โดยอัตโนมัติ</p>
        </div>
      </div>

      <div id="groups-alert" class="hidden mb-3"></div>

      <!-- สุ่มทุกระบบ -->
      <div class="card mb-3" id="pick-all" style="cursor:pointer;text-align:center;transition:all 0.2s;
            border:1px solid var(--accent);background:var(--teal-glow);">
        <div style="font-size:2.2rem;margin-bottom:0.35rem;">🎲</div>
        <h3>สุ่มทุกระบบ</h3>
        <p class="text-dim text-sm mt-1">สุ่มเคสจากทุกกลุ่มโรค</p>
      </div>

      <p class="text-dim text-sm mb-2">หรือเลือกเจาะจงระบบโรค</p>
      <div id="systems-grid"
           style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.75rem;">
        ${SYSTEMS.map(s => `
          <div class="card" data-group="${s.id}" style="cursor:pointer;text-align:center;transition:all 0.2s;">
            <div style="font-size:2rem;margin-bottom:0.35rem;">${s.emoji}</div>
            <div class="font-bold">${s.labelTh}</div>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => Router.go('dashboard'));

  // Hover feedback
  document.querySelectorAll('.card[id], .card[data-group]').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-2px)'; });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
      if (el.id !== 'pick-all') el.style.borderColor = '';
    });
  });

  // สุ่มทุกระบบ → เคส active ทั้งหมด
  const pickAll = document.getElementById('pick-all');
  pickAll.addEventListener('click', function () {
    _startRandomCase(getAllCases, this);
  });
  makeClickable(pickAll, 'สุ่มเคสจากทุกกลุ่มโรค');

  // เลือกระบบ → สุ่มเคส active ในระบบนั้น
  document.querySelectorAll('.card[data-group]').forEach(card => {
    card.addEventListener('click', function () {
      const groupId = this.dataset.group;
      _startRandomCase(() => getCasesByGroup(groupId), this);
    });
    // labelTh มี <br> ปนอยู่ — ใช้ textContent ของการ์ดเป็น label แทน
    makeClickable(card, 'สุ่มเคสจากระบบ ' + card.textContent.trim().replace(/\s+/g, ' '));
  });
}
