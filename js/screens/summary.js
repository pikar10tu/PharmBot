// ============================================================
//  screens/summary.js — OSPE result after session completes
// ============================================================

async function renderSummary(container, params = {}) {
  const { resultId } = params;
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in" style="max-width:720px;">
      <div class="text-center p-3"><span class="spinner"></span> กำลังโหลดผล…</div>
    </div>`;

  if (!resultId) { Router.go('history'); return; }

  try {
    const snap = await db.collection('results').doc(resultId).get();
    if (!snap.exists) { Router.go('history'); return; }
    const result = { id: snap.id, ...snap.data() };
    _renderSummaryUI(container, pid, result);
  } catch (e) {
    container.innerHTML = `
      ${renderNavbar(pid)}
      <div class="container fade-in" style="max-width:720px;">
        <div class="alert alert-error">โหลดผลล้มเหลว: ${_escS(e.message)}</div>
        <button class="btn btn-ghost btn-sm mt-2" onclick="Router.go('history')">← ประวัติการฝึก</button>
      </div>`;
  }
}

function _renderSummaryUI(container, pid, result) {
  const fb    = result.feedbackJson || {};
  const total = result.overallScore || fb.overall || 0;
  const cls   = total >= 80 ? 'good' : total >= 60 ? 'partial' : 'poor';

  // Score breakdown
  const scores = [
    { label: 'ซักประวัติ',  key: 'history_score',    val: result.historyScore    || fb.history_score    || 0 },
    { label: 'การวินิจฉัย', key: 'diagnosis_score',   val: result.diagnosisScore  || fb.diagnosis_score  || 0 },
    { label: 'การจ่ายยา',   key: 'drug_score',        val: result.drugScore       || fb.drug_score       || 0 },
    { label: 'คำแนะนำ',     key: 'counseling_score',  val: result.counselingScore || fb.counseling_score || 0 },
  ];

  // Checklist items
  const checklist = fb.checklist_results || [];

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in" style="max-width:720px;">

      <!-- Overall score -->
      <div class="card text-center mb-3" style="padding:2rem;">
        <div class="score-ring" style="margin:0 auto;">
          <div class="score-circle ${cls}" style="width:100px;height:100px;font-size:1.8rem;">${total}</div>
          <div class="score-label mt-1" style="font-size:1rem;">คะแนนรวม / 100</div>
        </div>
        <p class="mt-2 text-dim">${_escS(fb.summary || '')}</p>
      </div>

      <!-- Score breakdown -->
      <div class="card mb-3">
        <h3 class="mb-2">ผลคะแนนแยกหมวด</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:1rem;">
          ${scores.map(s => {
            const c = s.val >= 80 ? 'good' : s.val >= 60 ? 'partial' : 'poor';
            return `
              <div class="score-ring text-center">
                <div class="score-circle ${c}">${s.val}</div>
                <div class="score-label mt-1">${s.label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Feedback sections -->
      ${_feedbackBlock('ซักประวัติ', fb.history_feedback, fb.history_missed)}
      ${_feedbackBlock('การวินิจฉัย', fb.diagnosis_feedback, null)}
      ${_feedbackBlock('การจ่ายยา', fb.drug_feedback, null)}
      ${_feedbackBlock('คำแนะนำ', fb.counseling_feedback, fb.counseling_missed)}

      ${fb.behavior_note ? `
        <div class="card mb-3">
          <h3 class="mb-1">พฤติกรรมการสนทนา</h3>
          <p class="text-dim text-sm">${_escS(fb.behavior_note)}</p>
        </div>` : ''}

      <!-- Checklist -->
      ${checklist.length ? `
        <div class="card mb-3">
          <h3 class="mb-2">รายการ Checklist</h3>
          ${checklist.map(item => `
            <div class="checklist-item">
              <div class="checklist-icon">${item.done ? '✅' : '❌'}</div>
              <div class="checklist-text">
                <div>${item.item}. ${_escS(item.label)}</div>
                ${item.note ? `<div class="checklist-note">${_escS(item.note)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>` : ''}

      <!-- Actions -->
      <div class="flex gap-2 mb-3" style="justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="Router.go('history')">📋 ประวัติการฝึก</button>
        <button class="btn btn-primary" onclick="Router.go('groups')">🩺 ฝึกเคสใหม่</button>
      </div>

    </div>`;
}

function _feedbackBlock(title, feedback, missed) {
  if (!feedback && !(missed?.length)) return '';
  return `
    <div class="card mb-3">
      <h3 class="mb-1">${title}</h3>
      ${feedback ? `<p class="text-dim text-sm mb-1">${_escS(feedback)}</p>` : ''}
      ${missed?.length ? `
        <div class="mt-1">
          <div class="text-sm text-dim mb-1">ประเด็นที่ขาดไป:</div>
          ${missed.map(m => `<div class="text-sm" style="padding:0.2rem 0 0.2rem 0.75rem;border-left:2px solid var(--warning);">• ${_escS(m)}</div>`).join('')}
        </div>` : ''}
    </div>`;
}

function _escS(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
