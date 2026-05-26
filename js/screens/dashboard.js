// ============================================================
//  screens/dashboard.js
// ============================================================

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
        document.getElementById('rate-alert').className = 'alert alert-warning mb-3';
        document.getElementById('rate-alert').innerHTML =
          '⚠️ คุณใช้ครบ 5 ครั้งสำหรับวันนี้แล้ว สามารถกลับมาฝึกใหม่ได้พรุ่งนี้';
        document.getElementById('btn-start').style.opacity = '0.4';
        document.getElementById('btn-start').style.cursor  = 'not-allowed';
      }
    } catch (e) { console.warn('rate limit check failed', e); }
  }

  // Hover effect on cards
  document.querySelectorAll('.card[id]').forEach(el => {
    el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--accent)'; el.style.transform = 'translateY(-2px)'; });
    el.addEventListener('mouseleave', () => { el.style.borderColor = ''; el.style.transform = ''; });
  });

  document.getElementById('btn-start').addEventListener('click', async () => {
    if (!isAdm) {
      const uid   = getCurrentUser().uid;
      const count = await getTodaySessionCount(uid);
      if (count >= 5) return;
    }
    Router.go('groups');
  });

  document.getElementById('btn-history').addEventListener('click', () => Router.go('history'));
  if (isAdm) {
    document.getElementById('btn-admin')?.addEventListener('click', () => Router.go('admin'));
  }
}

function renderNavbar(pid) {
  return `
    <nav class="navbar">
      <span class="navbar-brand">💊 PharmBot</span>
      <div class="navbar-right">
        <span class="text-dim text-sm">${pid || ''}</span>
        <button class="btn btn-ghost btn-sm" id="logout-btn">ออกจากระบบ</button>
      </div>
    </nav>
  `;
}

// Attach logout after any screen that uses renderNavbar
function attachLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', logout);
}

// Call after DOM insertion for all screens using navbar
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'logout-btn') logout();
});
