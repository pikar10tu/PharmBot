// ============================================================
//  screens/dashboard.js
// ============================================================

// ── A11y helper (global) ──────────────────────────────────────
// การ์ดทั้งแอปเป็น <div> + cursor:pointer → Tab ไม่ถึง กด Enter ไม่ได้
// เปลี่ยนเป็น <button> จริงจะพัง layout (flex/grid + padding ของ .card)
// จึงใส่ role/tabindex/keydown ให้แทน — screen reader และคีย์บอร์ดใช้ได้เท่ากัน
function makeClickable(el, label) {
  if (!el || el.dataset.a11yBound) return;
  el.dataset.a11yBound = '1';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  if (label) el.setAttribute('aria-label', label);
  el.addEventListener('keydown', e => {
    // Space ต้อง preventDefault ไม่งั้นหน้าเลื่อนลงไปด้วย
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      el.click();
    }
  });
}

// ── Theme helpers (global) ────────────────────────────────────
function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name || 'dispensa');
  localStorage.setItem('pharmbot-theme', name || 'dispensa');
  document.querySelectorAll('.theme-dot').forEach(d => {
    const on = d.dataset.theme === name;
    d.classList.toggle('active', on);
    d.setAttribute('aria-pressed', on ? 'true' : 'false');   // บอก screen reader ว่าอันไหนถูกเลือก
  });
}

function initTheme() {
  const saved = localStorage.getItem('pharmbot-theme') || 'dispensa';
  document.documentElement.setAttribute('data-theme', saved);
}

const THEMES = [
  // id ยังเป็น 'dispensa' โดยตั้งใจ — เก็บไว้ใน localStorage ของผู้ใช้เดิมแล้ว
  // เปลี่ยน id = ธีมที่เขาเลือกไว้จะไม่ match CSS ไหนเลย หน้าตาเพี้ยนจนกว่าจะเลือกใหม่
  { id: 'dispensa', color: '#22c1dd', label: '💠 Pharm From Home' },
  { id: 'sakura',   color: '#ec4899', label: '🌸 Sakura'   },
  { id: 'sky',      color: '#0284c7', label: '🩵 Sky'       },
  { id: 'lavender', color: '#c084fc', label: '💜 Lavender'  },
  { id: 'matcha',   color: '#6ee7b7', label: '🍵 Matcha'    },
  { id: 'peach',    color: '#fb923c', label: '🍑 Peach'     },
];

async function renderDashboard(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();
  const isAdm   = isAdmin();

  // Skeleton
  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center justify-between mb-3" style="flex-wrap:wrap;gap:0.75rem;">
        <div>
          <h2>สวัสดี ${pid || ''}</h2>
          <p class="text-dim text-sm mt-1">เลือกหมวดโรคเพื่อเริ่มการฝึกปฏิบัติ</p>
        </div>
        <div id="rate-display"></div>
      </div>

      <div id="rate-alert" class="hidden mb-3"></div>

      <!-- Action cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;" class="mb-3">
        <div class="card" style="cursor:pointer;text-align:center;transition:all 0.2s;" id="btn-start">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;">🩺</div>
          <h3>เริ่มเคสใหม่</h3>
          <p class="text-dim text-sm mt-1">เลือกหมวดโรคและเริ่มสนทนากับผู้ป่วย AI</p>
        </div>

        <div class="card" style="cursor:pointer;text-align:center;transition:all 0.2s;" id="btn-history">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;">📋</div>
          <h3>ประวัติการฝึก</h3>
          <p class="text-dim text-sm mt-1">ดูผลการประเมินและ feedback ที่ผ่านมา</p>
        </div>

        ${isAdm ? `
        <div class="card" style="cursor:pointer;text-align:center;transition:all 0.2s;" id="btn-admin">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;">⚙️</div>
          <h3>Admin</h3>
          <p class="text-dim text-sm mt-1">จัดการเคส ยา และดูผลทั้งหมด</p>
        </div>` : ''}
      </div>

      <!-- Theme picker -->
      <div class="flex items-center gap-2" style="margin-top:0.25rem;">
        <span class="text-dim text-sm" id="theme-label">ธีม</span>
        <div class="theme-picker" role="group" aria-labelledby="theme-label">
          ${THEMES.map(t => `<button type="button" class="theme-dot" data-theme="${t.id}"
            title="${t.label}" aria-label="ธีม ${t.label}" style="background:${t.color};"></button>`).join('')}
        </div>
      </div>
    </div>
  `;

  // Load rate limit (admin has no limit)
  if (isAdm) {
    document.getElementById('rate-display').innerHTML =
      `<div class="text-sm text-dim">👑 Admin — ไม่จำกัดจำนวนครั้ง</div>`;
  } else {
    try {
      const uid   = getCurrentUser().uid;
      const count = await getTodaySessionCount(uid);
      const max   = 5;

      const pips = Array.from({ length: max }, (_, i) =>
        `<div class="rate-pip ${i < count ? (count >= max ? 'full' : 'used') : ''}"></div>`
      ).join('');

      document.getElementById('rate-display').innerHTML = `
        <div>
          <div class="text-sm text-dim mb-1">วันนี้ใช้ไป ${count}/${max} ครั้ง</div>
          <div class="rate-bar">${pips}</div>
        </div>
      `;

      if (count >= max) {
        _setStartCardDisabled(true);
      }
    } catch (e) { console.warn('rate limit check failed', e); }
  }

  // Hover effect on cards
  document.querySelectorAll('.card[id]').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-2px)'; });
    el.addEventListener('mouseleave', () => { el.style.borderColor = ''; el.style.transform = ''; });
  });

  // การ์ดพวกนี้ทำหน้าที่เป็นปุ่ม — ต้อง Tab ถึงและกด Enter/Space ได้
  makeClickable(document.getElementById('btn-start'),   'เริ่มเคสใหม่');
  makeClickable(document.getElementById('btn-history'), 'ประวัติการฝึก');
  if (isAdm) makeClickable(document.getElementById('btn-admin'), 'Admin Panel');

  document.getElementById('btn-start').addEventListener('click', async () => {
    if (!isAdm) {
      const uid   = getCurrentUser().uid;
      const count = await getTodaySessionCount(uid);
      // เดิม return เงียบๆ — นักศึกษากดแล้วไม่มีอะไรเกิดขึ้น ไม่รู้ว่าพังหรือโควต้าหมด
      if (count >= 5) { _setStartCardDisabled(true); return; }
    }
    Router.go('groups');
  });

  // Mark active theme dot + wire clicks
  const savedTheme = localStorage.getItem('pharmbot-theme') || 'dispensa';
  document.querySelectorAll('.theme-dot').forEach(dot => {
    const on = dot.dataset.theme === savedTheme;
    dot.classList.toggle('active', on);
    dot.setAttribute('aria-pressed', on ? 'true' : 'false');   // ต้องตั้งตอน render แรกด้วย ไม่ใช่แค่ตอนคลิก
    dot.addEventListener('click', () => applyTheme(dot.dataset.theme));
  });

  document.getElementById('btn-history').addEventListener('click', () => Router.go('history'));
  if (isAdm) {
    document.getElementById('btn-admin')?.addEventListener('click', () => Router.go('admin'));
  }
}

// โควต้าเต็ม — ต้องบอกให้รู้ทั้งทางสายตาและทาง screen reader
// และเลื่อนข้อความเตือนให้เห็นเมื่อกดซ้ำ ไม่ใช่เงียบไปเฉยๆ
function _setStartCardDisabled(disabled) {
  const card  = document.getElementById('btn-start');
  const alert = document.getElementById('rate-alert');
  if (!card) return;

  card.style.opacity = disabled ? '0.4' : '';
  card.style.cursor  = disabled ? 'not-allowed' : 'pointer';
  card.setAttribute('aria-disabled', disabled ? 'true' : 'false');

  if (alert && disabled) {
    alert.className = 'alert alert-warning mb-3';
    alert.setAttribute('role', 'status');
    alert.innerHTML = '⚠️ คุณใช้ครบ 5 ครั้งสำหรับวันนี้แล้ว สามารถกลับมาฝึกใหม่ได้พรุ่งนี้';
    alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderNavbar(pid) {
  return `
    <nav class="navbar">
      <span class="navbar-brand">
        <img src="img/logo.jpg?v=2" alt="Pharm From Home" class="navbar-brand-logo" />
        Pharm From Home
      </span>
      <div class="navbar-right">
        <span class="text-dim text-sm">${pid || ''}</span>
        <button class="btn btn-ghost btn-sm" id="logout-btn">ออกจากระบบ</button>
      </div>
    </nav>
  `;
}

// ปุ่ม logout อยู่ใน navbar ที่ถูก re-render ทุกหน้าจอ จึงใช้ delegate ที่ document
// ระดับเดียว แทนการผูก listener ใหม่ทุกครั้ง (ฟังก์ชัน attachLogout() เดิมไม่เคยถูกเรียก
// จากที่ไหนเลย — ลบทิ้งแล้ว)
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'logout-btn') logout();
});
