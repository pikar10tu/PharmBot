// ============================================================
//  screens/cases.js
// ============================================================

async function renderCases(container, params = {}) {
  const { groupId, groupLabel } = params;
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">← กลับ</button>
        <div>
          <h2>${groupLabel || groupId || 'รายการเคส'}</h2>
          <p class="text-dim text-sm">เลือกเคสเพื่อเริ่มการฝึก</p>
        </div>
      </div>

      <div id="cases-container">
        <div class="text-center p-3"><span class="spinner"></span></div>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => Router.go('groups'));

  try {
    const cases = await getCasesByGroup(groupId);
    const cont  = document.getElementById('cases-container');

    if (!cases.length) {
      cont.innerHTML = `
        <div class="card text-center p-3">
          <p class="text-dim">ยังไม่มีเคสในหมวดนี้</p>
          <p class="text-dim text-sm mt-1">Admin สามารถเพิ่มเคสได้ที่หน้า Admin Panel</p>
        </div>`;
      return;
    }

    cont.innerHTML = `<div class="case-list">${cases.map(c => `
      <div class="case-card" data-case="${c.id}">
        <div style="flex:1;">
          <div class="flex items-center gap-1 mb-1">
            <span class="font-bold">${c.title || c.id}</span>
            <span class="difficulty-badge difficulty-${c.difficulty || 'easy'}">${diffLabel(c.difficulty)}</span>
          </div>
          <div class="text-dim text-sm">${c.chiefComplaint || ''}</div>
        </div>
        <button class="btn btn-primary btn-sm">เริ่ม →</button>
      </div>
    `).join('')}</div>`;

    cont.querySelectorAll('.case-card').forEach(card => {
      card.addEventListener('click', () => {
        Router.go('chat', { caseId: card.dataset.case });
      });
    });
  } catch (e) {
    document.getElementById('cases-container').innerHTML =
      `<div class="alert alert-error">โหลดเคสล้มเหลว: ${e.message}</div>`;
  }
}

function diffLabel(d) {
  return d === 'hard' ? 'ยาก' : d === 'medium' ? 'ปานกลาง' : 'ง่าย';
}
