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
    // ดึง session เฉพาะตอนเป็น admin — ชั้นกันข้อมูลรั่วชั้นที่ 1 (ไม่ดึงมาตั้งแต่แรก)
    let session = null;
    if (isAdmin() && result.sessionId) {
      session = await getSessionById(result.sessionId).catch(() => null);
    }
    _renderSummaryUI(container, pid, result, session);
  } catch (e) {
    container.innerHTML = `
      ${renderNavbar(pid)}
      <div class="container fade-in" style="max-width:720px;">
        <div class="alert alert-error">โหลดผลล้มเหลว: ${escapeHtmlBr(e.message)}</div>
        <button class="btn btn-ghost btn-sm mt-2" onclick="Router.go('history')">← ประวัติการฝึก</button>
      </div>`;
  }
}

function _renderSummaryUI(container, pid, result, session = null) {
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
        <p class="mt-2 text-dim">${escapeHtmlBr(fb.summary || '')}</p>
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
          <p class="text-dim text-sm">${escapeHtmlBr(fb.behavior_note)}</p>
        </div>` : ''}

      <!-- Checklist -->
      ${checklist.length ? `
        <div class="card mb-3">
          <h3 class="mb-2">รายการ Checklist</h3>
          ${checklist.map(item => `
            <div class="checklist-item">
              <div class="checklist-icon">${item.done ? '✅' : '❌'}</div>
              <div class="checklist-text">
                <div>${item.item}. ${escapeHtmlBr(item.label)}</div>
                ${item.note ? `<div class="checklist-note">${escapeHtmlBr(item.note)}</div>` : ''}
              </div>
            </div>`).join('')}
        </div>` : ''}

      <!-- Guideline references (static grounding — ผูกกับข้อ rubric ของเคส) -->
      <!-- ⚠️ ลิขสิทธิ์: แสดงได้แค่ชื่อเอกสาร + หน้า + ลิงก์
           ห้ามแสดงข้อความต้นฉบับจากไกด์ไลน์ -->
      ${(result.guidelineRefs || []).length ? `
        <div class="card mb-3">
          <h3 class="mb-1">📚 อ้างอิงแนวทางเวชปฏิบัติ</h3>
          <p class="text-dim text-sm mb-2">เกณฑ์การประเมินเคสนี้อ้างอิงจากเอกสารต่อไปนี้</p>
          ${result.guidelineRefs.map(r => `
            <div class="checklist-item">
              <div class="checklist-icon">📄</div>
              <div class="checklist-text">
                <div>${escapeHtmlBr(r.title)}${r.page ? ` หน้า ${escapeHtmlBr(String(r.page))}` : ''}</div>
                ${r.url ? `<div class="checklist-note"><a href="${escapeHtmlBr(r.url)}" target="_blank" rel="noopener">เปิดเอกสาร</a></div>` : ''}
              </div>
            </div>`).join('')}
        </div>` : ''}

      ${_adminTranscriptBlock(session)}

      ${_adminFeedbackBlock(result)}

      <!-- Actions -->
      <div class="flex gap-2 mb-3" style="justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="Router.go('history')">📋 ประวัติการฝึก</button>
        <button class="btn btn-primary" onclick="Router.go('groups')">🩺 ฝึกเคสใหม่</button>
      </div>

      <!-- EC: ช่องทางติดต่อ ลดผลกระทบทางใจกรณีคะแนนต่ำ -->
      <div class="card mb-3 text-sm">
        <p class="mb-1">💬 ผลการประเมินนี้ใช้เพื่อการฝึกและพัฒนาตนเองเท่านั้น ไม่มีผลต่อผลการเรียน
          หากท่านมีข้อสงสัยเกี่ยวกับผลการประเมิน หรือต้องการคำปรึกษาเพิ่มเติม สามารถติดต่อผู้วิจัยได้ที่</p>
        ${researchContactHtml()}
      </div>

    </div>`;

  if (isAdmin()) _loadCaseFeedback(result.id);
}

function _feedbackBlock(title, feedback, missed) {
  if (!feedback && !(missed?.length)) return '';
  return `
    <div class="card mb-3">
      <h3 class="mb-1">${title}</h3>
      ${feedback ? `<p class="text-dim text-sm mb-1">${escapeHtmlBr(feedback)}</p>` : ''}
      ${missed?.length ? `
        <div class="mt-1">
          <div class="text-sm text-dim mb-1">ประเด็นที่ขาดไป:</div>
          ${missed.map(m => `<div class="text-sm" style="padding:0.2rem 0 0.2rem 0.75rem;border-left:2px solid var(--warning);">• ${escapeHtmlBr(m)}</div>`).join('')}
        </div>` : ''}
    </div>`;
}

// ── บทสนทนาเต็ม (เฉพาะทีมงาน) ────────────────────────────────
// ⚠️ นักศึกษาต้องไม่เห็นบล็อกนี้ — firestore.rules ยอมให้เขาอ่าน
//    session ของตัวเองได้ การกันจึงต้องอยู่ที่ฝั่งเรนเดอร์ด้วย
function _adminTranscriptBlock(session) {
  if (!isAdmin() || !session) return '';

  const turns = [...(session.chatHistory || []), ...(session.counselingHistory || [])];
  const count = turns.reduce((acc, m) => {
    if (m.role !== 'user') return acc;
    const k = m.via || 'text';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const viaSummary = ['live', 'webspeech', 'text']
    .map(k => `${k} ${count[k] || 0}`).join(' · ');

  const line = (m) => {
    const who   = m.role === 'user' ? 'เภสัชกร' : (session.caseSnapshot?.name || 'ผู้ป่วย');
    const badge = m.role === 'user'
      ? `<span class="badge" style="font-size:0.65rem;">${escapeHtmlBr(m.via || 'text')}</span>` : '';
    const cut   = m.interrupted ? ' <span class="text-dim text-xs">(ถูกพูดแทรก)</span>' : '';
    return `
      <div class="checklist-item">
        <div class="checklist-text">
          <div class="text-sm"><strong>${escapeHtmlBr(who)}</strong> ${badge}${cut}</div>
          <div class="checklist-note">${escapeHtmlBr(m.text || '')}</div>
        </div>
      </div>`;
  };

  const drugs = (session.dispensedDrugs || [])
    .map(d => `${d.name} ${d.strength} (${d.form})`).join(', ');

  const deg = session.degraded;

  return `
    <details class="card mb-3">
      <summary style="cursor:pointer;font-weight:bold;">🗂️ บทสนทนาเต็ม (เฉพาะทีมงาน)</summary>
      <div class="text-dim text-sm mt-2 mb-2">คุณภาพ transcript: ${escapeHtmlBr(viaSummary)}</div>
      ${deg ? `<div class="alert alert-warning text-sm mb-2">⚠️ เซสชันนี้ถูกลดระดับเป็น ${escapeHtmlBr(deg.level || '?')} เพราะ ${escapeHtmlBr(deg.reason || 'ไม่ระบุ')}</div>` : ''}
      <h4 class="mb-1 mt-2">ขั้นที่ 1 — ซักประวัติ</h4>
      ${(session.chatHistory || []).map(line).join('') || '<div class="text-dim text-sm">(ไม่มี)</div>'}
      <h4 class="mb-1 mt-2">ยาที่จ่าย</h4>
      <div class="text-sm">${escapeHtmlBr(drugs || 'ไม่ได้จ่ายยา')}</div>
      <h4 class="mb-1 mt-2">ขั้นที่ 3 — ให้คำแนะนำ</h4>
      ${(session.counselingHistory || []).map(line).join('') || '<div class="text-dim text-sm">(ไม่มี)</div>'}
    </details>`;
}


// ── กล่องฟีดแบ็คเคส (เฉพาะทีมงาน) ─────────────────────────────
// ทีม (ผู้วิจัย/เพื่อน/อาจารย์ ที่ล็อกอินเป็น admin) ลองเคสแล้วบอกว่าตรงไหนไม่สมจริง
// → dev ใช้ปรับ prompt · เก็บที่ /caseFeedback ผูก resultId/sessionId ไว้ย้อนดู transcript
const CASE_FEEDBACK_TAGS = [
  ['leak',      'ผู้ป่วยบอกข้อมูลก่อนถูกถาม'],
  ['proactive', 'ผู้ป่วยพูดขึ้นมาเองโดยไม่มีใครถาม'],
  ['wrongInfo', 'ตอบไม่ตรงข้อมูลเคส'],
  ['tooLong',   'ตอบยาว/เป็นทางการเกินไป'],
  ['unnatural', 'ภาษาไม่เป็นธรรมชาติ ไม่เหมือนคนไข้จริง'],
  ['offRole',   'หลุดบทบาท (พูดเหมือนหมอ/AI)'],
  ['voice',     'ปัญหาเสียง (ฟังไม่ชัด/ตัดคำ/ดีเลย์)'],
  ['scoring',   'คะแนน/ข้อประเมินไม่ตรงกับที่ทำจริง'],
];

function _adminFeedbackBlock(result) {
  if (!isAdmin()) return '';
  return `
    <div class="card mb-3" id="caseFbCard">
      <h3 class="mb-1">📝 ฟีดแบ็คเคสนี้ (เฉพาะทีมงาน)</h3>
      <p class="text-dim text-sm mb-2">ช่วยบอกว่าตรงไหนไม่เหมือนจริง — ทีมพัฒนาจะใช้ปรับ prompt ผู้ป่วยและเกณฑ์ประเมิน</p>
      <div class="text-sm mb-1">ความสมจริงของผู้ป่วยโดยรวม</div>
      <div class="flex gap-2 mb-2" style="flex-wrap:wrap;">
        ${[1,2,3,4,5].map(n => `<label class="text-sm"><input type="radio" name="cfRealism" value="${n}"> ${n}</label>`).join('')}
        <span class="text-dim text-xs">(1 = ไม่เหมือนเลย · 5 = เหมือนคนไข้จริง)</span>
      </div>
      <div class="text-sm mb-1">ปัญหาที่เจอ (เลือกได้หลายข้อ)</div>
      <div class="mb-2">
        ${CASE_FEEDBACK_TAGS.map(([k, label]) => `<label class="text-sm" style="display:block;"><input type="checkbox" name="cfTag" value="${k}"> ${label}</label>`).join('')}
      </div>
      <label class="text-sm">เกี่ยวกับผู้ป่วย / บทสนทนา — ยกตัวอย่างประโยคได้ยิ่งดี</label>
      <textarea id="cfPatient" class="input mb-2" rows="3" style="width:100%;" placeholder="เช่น ถามแค่ว่าเป็นอะไรมา แต่ผู้ป่วยเล่าว่ามีไข้ด้วยเลย ทั้งที่ควรรอให้ถาม"></textarea>
      <label class="text-sm">เกี่ยวกับคะแนน / เช็คลิสต์</label>
      <textarea id="cfScoring" class="input mb-2" rows="2" style="width:100%;" placeholder="เช่น ถามเรื่องแพ้ยาแล้วแต่ไม่ได้คะแนนข้อนี้"></textarea>
      <label class="text-sm">ผู้ให้ฟีดแบ็ค (ไม่บังคับ)</label>
      <input id="cfName" class="input mb-2" style="width:100%;" placeholder="ชื่อ/บทบาท เช่น อ.เภสัช, เพื่อนทีมวิจัย">
      <button class="btn btn-primary btn-sm" id="cfSave">ส่งฟีดแบ็ค</button>
      <span id="cfStatus" class="text-sm text-dim" style="margin-left:0.5rem;"></span>
      <div id="cfList" class="mt-2"></div>
    </div>`;
}

async function _loadCaseFeedback(resultId) {
  const btn = document.getElementById('cfSave');
  if (!btn) return;
  btn.onclick = async () => {
    const realism = document.querySelector('input[name="cfRealism"]:checked')?.value;
    const tags    = [...document.querySelectorAll('input[name="cfTag"]:checked')].map(i => i.value);
    const patient = document.getElementById('cfPatient').value.trim();
    const scoring = document.getElementById('cfScoring').value.trim();
    const status  = document.getElementById('cfStatus');
    if (!realism && !tags.length && !patient && !scoring) {
      status.textContent = 'ยังไม่ได้กรอกอะไรเลย'; return;
    }
    btn.disabled = true; status.textContent = 'กำลังบันทึก…';
    try {
      const snap = await db.collection('results').doc(resultId).get();
      const r = snap.data() || {};
      const s = r.sessionId ? await getSessionById(r.sessionId).catch(() => null) : null;
      await saveCaseFeedback({
        resultId,
        sessionId:  r.sessionId || null,
        caseId:     s?.caseId || null,
        caseTitle:  r.caseSnapshot?.title || null,
        realism:    realism ? Number(realism) : null,
        tags, patient, scoring,
        reviewer:   document.getElementById('cfName').value.trim() || null,
        reviewerUid: getCurrentUser()?.uid || null,
        // ระบุว่าฟีดแบ็คนี้มาจาก prompt/โมเดลรุ่นไหน — prompt จะเปลี่ยนเรื่อยๆ
        groundingVersion: typeof GROUNDING_VERSION !== 'undefined' ? GROUNDING_VERSION : null,
        overallScore: r.overallScore ?? null,
      });
      status.textContent = '✅ บันทึกแล้ว ขอบคุณครับ';
      ['cfPatient', 'cfScoring'].forEach(id => document.getElementById(id).value = '');
      document.querySelectorAll('input[name="cfTag"]').forEach(i => i.checked = false);
    } catch (e) {
      status.textContent = '❌ บันทึกไม่สำเร็จ: ' + e.message;
    }
    btn.disabled = false;
    _renderCaseFeedbackList(resultId);
  };
  _renderCaseFeedbackList(resultId);
}

async function _renderCaseFeedbackList(resultId) {
  const box = document.getElementById('cfList');
  if (!box) return;
  const items = await getCaseFeedbackForResult(resultId).catch(() => []);
  if (!items.length) { box.innerHTML = ''; return; }
  const tagLabel = Object.fromEntries(CASE_FEEDBACK_TAGS);
  box.innerHTML = `<div class="text-sm text-dim mb-1">ฟีดแบ็คที่ส่งแล้ว (${items.length})</div>` +
    items.map(f => `
      <div class="text-sm" style="padding:0.3rem 0 0.3rem 0.75rem;border-left:2px solid var(--primary);margin-bottom:0.4rem;">
        ${f.realism ? `ความสมจริง ${f.realism}/5 · ` : ''}${escapeHtmlBr((f.tags || []).map(t => tagLabel[t] || t).join(', '))}
        ${f.patient ? `<div>ผู้ป่วย: ${escapeHtmlBr(f.patient)}</div>` : ''}
        ${f.scoring ? `<div>คะแนน: ${escapeHtmlBr(f.scoring)}</div>` : ''}
        ${f.reviewer ? `<div class="text-dim text-xs">— ${escapeHtmlBr(f.reviewer)}</div>` : ''}
      </div>`).join('');
}
