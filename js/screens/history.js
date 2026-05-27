// ============================================================
//  screens/history.js — Training history for current user
// ============================================================

async function renderHistory(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();
  const uid     = getCurrentUser().uid;

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">← กลับ</button>
        <div>
          <h2>ประวัติการฝึก</h2>
          <p class="text-dim text-sm">ผลการประเมินทั้งหมดของคุณ</p>
        </div>
      </div>
      <div id="history-list">
        <div class="text-center p-3"><span class="spinner"></span></div>
      </div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => Router.go('dashboard'));

  try {
    const results = await getMyResults(uid);
    const cont    = document.getElementById('history-list');

    if (!results.length) {
      cont.innerHTML = `
        <div class="card text-center p-3">
          <div style="font-size:2.5rem;margin-bottom:0.5rem;">📋</div>
          <p class="text-dim">ยังไม่มีประวัติการฝึก</p>
          <button class="btn btn-primary btn-sm mt-2" onclick="Router.go('groups')">เริ่มเคสแรก →</button>
        </div>`;
      return;
    }

    cont.innerHTML = `<div class="flex-col" style="gap:0.75rem;display:flex;">
      ${results.map(r => _historyRow(r)).join('')}
    </div>`;

    cont.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        Router.go('summary', { resultId: el.dataset.resultId });
      });
    });

  } catch (e) {
    document.getElementById('history-list').innerHTML =
      `<div class="alert alert-error">โหลดประวัติล้มเหลว: ${_escH(e.message)}</div>`;
  }
}

function _historyRow(r) {
  const fb      = r.feedbackJson || {};
  const total   = r.overallScore || fb.overall || 0;
  const cls     = total >= 80 ? 'text-success' : total >= 60 ? 'text-warning' : 'text-danger';
  const snap    = r.caseSnapshot || fb.caseSnapshot || {};
  const title   = snap.title || r.caseId || 'เคสไม่ทราบชื่อ';
  const dateStr = r.createdAt?.toDate
    ? r.createdAt.toDate().toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' })
    : '—';

  const scores = [
    { l: 'ซักประวัติ', v: r.historyScore    || fb.history_score    || 0 },
    { l: 'วินิจฉัย',   v: r.diagnosisScore  || fb.diagnosis_score  || 0 },
    { l: 'ยา',         v: r.drugScore       || fb.drug_score       || 0 },
    { l: 'แนะนำ',      v: r.counselingScore || fb.counseling_score || 0 },
  ];

  return `
    <div class="history-item" data-result-id="${r.id}">
      <div class="history-score ${cls}">${total}</div>
      <div style="flex:1;min-width:0;">
        <div class="font-bold text-sm">${_escH(title)}</div>
        <div class="text-dim text-xs">${dateStr}</div>
        <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
          ${scores.map(s => `<span class="badge" style="font-size:0.7rem;">${s.l} ${s.v}</span>`).join('')}
        </div>
      </div>
      <div class="text-dim text-sm">→</div>
    </div>`;
}

function _escH(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
