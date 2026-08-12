// ============================================================
//  screens/cases.js
//
//  ⚠️ หน้านี้เข้าไม่ถึงใน flow ปกติ — groups.js สุ่มเคสแล้วไป #chat ตรงๆ
//     (สเปกวิจัย §3.4.1: นักศึกษาเลือกเคสเจาะจงไม่ได้)
//     เหลือไว้เพราะยังเข้าได้ทาง URL และเพราะ diffLabel() ข้างล่างถูกใช้โดย
//     chat.js กับ admin.js — ลบไฟล์นี้ทิ้งสองหน้านั้นพังทันที
// ============================================================

async function renderCases(container, params = {}) {
  const { groupId, groupLabel } = params;

  // ไม่มี groupId = เปิด #cases ตรงๆ หรือ refresh แล้ว params หาย
  // เดิมปล่อยหลุดไปถึง Firestore แล้วโชว์ error อังกฤษดิบให้นักศึกษาเห็น:
  // "Function Query.where() called with invalid data. Unsupported field value: undefined"
  // (เทียบ chat.js กับ summary.js ที่ guard แบบนี้ไว้แล้ว)
  if (!groupId) { Router.go('groups'); return; }

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
      makeClickable(card, 'เริ่มเคส ' + card.textContent.trim().replace(/\s+/g, ' '));
    });
  } catch (e) {
    document.getElementById('cases-container').innerHTML =
      `<div class="alert alert-error">โหลดเคสล้มเหลว: ${e.message}</div>`;
  }
}

function diffLabel(d) {
  return d === 'hard' ? 'ยาก' : d === 'medium' ? 'ปานกลาง' : 'ง่าย';
}
