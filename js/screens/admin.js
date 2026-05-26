// ============================================================
//  screens/admin.js — Admin CMS panel
//  Tabs: Cases | Drugs | Results
// ============================================================

let _adminTab     = 'cases';
let _adminCases   = [];
let _adminDrugs   = [];
let _adminResults = [];

async function renderAdmin(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container-lg fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">← กลับ</button>
        <div>
          <h2>⚙️ Admin Panel</h2>
          <p class="text-dim text-sm">จัดการเคส ยา และดูผลการประเมิน</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mb-3" style="border-bottom:1px solid var(--glass-border);padding-bottom:0.75rem;flex-wrap:wrap;">
        <button class="btn btn-sm tab-btn ${_adminTab==='cases'   ? 'btn-primary' : 'btn-ghost'}" data-tab="cases">📝 เคส</button>
        <button class="btn btn-sm tab-btn ${_adminTab==='drugs'   ? 'btn-primary' : 'btn-ghost'}" data-tab="drugs">💊 ยา</button>
        <button class="btn btn-sm tab-btn ${_adminTab==='results' ? 'btn-primary' : 'btn-ghost'}" data-tab="results">📊 ผลการประเมิน</button>
      </div>

      <div id="admin-body">
        <div class="text-center p-3"><span class="spinner"></span></div>
      </div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => Router.go('dashboard'));

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _adminTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.className = `btn btn-sm tab-btn ${b.dataset.tab === _adminTab ? 'btn-primary' : 'btn-ghost'}`;
      });
      _loadAdminTab();
    });
  });

  _loadAdminTab();
}

async function _loadAdminTab() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = '<div class="text-center p-3"><span class="spinner"></span></div>';

  try {
    if (_adminTab === 'cases')   await _renderCasesTab(body);
    if (_adminTab === 'drugs')   await _renderDrugsTab(body);
    if (_adminTab === 'results') await _renderResultsTab(body);
  } catch (e) {
    body.innerHTML = `<div class="alert alert-error">โหลดล้มเหลว: ${_escA(e.message)}</div>`;
  }
}

// ── Cases Tab ─────────────────────────────────────────────────

async function _renderCasesTab(body) {
  _adminCases = await getAllCases();

  body.innerHTML = `
    <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:0.5rem;">
      <div class="text-dim text-sm">${_adminCases.length} เคส (active)</div>
      <button class="btn btn-primary btn-sm" id="add-case-btn">+ เพิ่มเคสใหม่</button>
    </div>
    <div id="cases-table">
      ${_adminCases.length
        ? `<div class="flex-col" style="display:flex;gap:0.5rem;">
            ${_adminCases.map(c => _caseRow(c)).join('')}
           </div>`
        : '<div class="card text-center p-3"><p class="text-dim">ยังไม่มีเคส</p></div>'}
    </div>

    <!-- Case form (hidden by default) -->
    <div id="case-form-wrap" class="hidden mt-3">
      <div class="card">
        <h3 class="mb-2" id="case-form-title">เพิ่มเคสใหม่</h3>
        <div id="case-form-alert" class="hidden mb-2"></div>
        ${_buildCaseFormHtml()}
        <div class="flex gap-2 mt-3" style="justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="cancel-case-btn">ยกเลิก</button>
          <button class="btn btn-primary" id="save-case-btn">บันทึก</button>
        </div>
      </div>
    </div>`;

  document.getElementById('add-case-btn').addEventListener('click', () => _openCaseForm(null));
  document.getElementById('cancel-case-btn').addEventListener('click', () => {
    document.getElementById('case-form-wrap').className = 'hidden mt-3';
  });
  document.getElementById('save-case-btn').addEventListener('click', _saveCaseForm);

  body.querySelectorAll('.edit-case-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const c = _adminCases.find(x => x.id === btn.dataset.id);
      if (c) _openCaseForm(c);
    });
  });

  body.querySelectorAll('.toggle-case-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const newState = btn.dataset.active !== 'true';
      await adminToggleCase(btn.dataset.id, newState);
      _adminCases = await getAllCases();
      _loadAdminTab();
    });
  });
}

function _caseRow(c) {
  return `
    <div class="history-item" style="cursor:default;">
      <div style="flex:1;min-width:0;">
        <div class="font-bold text-sm">${_escA(c.title || c.id)}</div>
        <div class="text-dim text-xs">${_escA(c.groupId)} · ${diffLabel(c.difficulty)}</div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm edit-case-btn" data-id="${c.id}">แก้ไข</button>
        <button class="btn btn-sm toggle-case-btn ${c.isActive ? 'btn-danger' : 'btn-success'}"
          data-id="${c.id}" data-active="${c.isActive}">
          ${c.isActive ? 'ซ่อน' : 'เปิด'}
        </button>
      </div>
    </div>`;
}

function _buildCaseFormHtml() {
  const groups = ['MSK','CVD','DERM','ENDO','GI','HEMO','IMMUNO','INF_URI','INF_UTI',
                  'INF_OTHER','NEURO','PSYCH','PULM','GYN','ENT_EYE','RENAL','REFER','SPECIAL'];
  return `
    <input type="hidden" id="case-id" />
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;" class="mb-2">
      <div>
        <label class="input-label">หมวดโรค (groupId)</label>
        <select class="input" id="cf-groupId">
          ${groups.map(g => `<option value="${g}">${g}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="input-label">ความยาก</label>
        <select class="input" id="cf-difficulty">
          <option value="easy">ง่าย</option>
          <option value="medium">ปานกลาง</option>
          <option value="hard">ยาก</option>
        </select>
      </div>
      <div>
        <label class="input-label">ชื่อเคส</label>
        <input class="input" type="text" id="cf-title" placeholder="เช่น เจ็บคอ / Bacterial Pharyngitis" />
      </div>
      <div>
        <label class="input-label">อาชีพผู้ป่วย</label>
        <input class="input" type="text" id="cf-occupation" placeholder="นักศึกษา / random" />
      </div>
      <div>
        <label class="input-label">เพศ</label>
        <select class="input" id="cf-gender">
          <option value="random">สุ่ม</option>
          <option value="female">หญิง</option>
          <option value="male">ชาย</option>
        </select>
      </div>
      <div>
        <label class="input-label">อายุ (0 = สุ่ม)</label>
        <input class="input" type="number" id="cf-age" min="0" max="99" value="0" />
      </div>
    </div>
    <div class="mb-2">
      <label class="input-label">ฉากเปิด (sceneDesc)</label>
      <textarea class="input" id="cf-sceneDesc" rows="2" style="resize:vertical;"></textarea>
    </div>
    <div class="mb-2">
      <label class="input-label">Chief Complaint (กระชับ ไม่มี duration)</label>
      <input class="input" type="text" id="cf-chiefComplaint" placeholder="เช่น เจ็บคอค่ะ" />
    </div>
    <div class="mb-2">
      <label class="input-label">โพยลับ (secretInfo) — 6 หมวด</label>
      <textarea class="input" id="cf-secretInfo" rows="8" style="resize:vertical;font-size:0.85rem;"></textarea>
    </div>
    <div class="mb-2">
      <label class="input-label">เกณฑ์เฉพาะโรค (specificChecklist)</label>
      <textarea class="input" id="cf-specificChecklist" rows="4" style="resize:vertical;font-size:0.85rem;"></textarea>
    </div>
    <div class="mb-2">
      <label class="input-label">การวินิจฉัย (diagnosisAnswer)</label>
      <input class="input" type="text" id="cf-diagnosisAnswer" />
    </div>
    <div class="mb-2">
      <label class="input-label">drugAnswer (JSON)</label>
      <textarea class="input" id="cf-drugAnswer" rows="10" style="resize:vertical;font-family:monospace;font-size:0.8rem;"
        placeholder='{"firstLine":[],"alternatives":[],"unacceptable":[],"counseling":[]}'></textarea>
    </div>`;
}

function _openCaseForm(c) {
  const wrap = document.getElementById('case-form-wrap');
  wrap.className = 'mt-3';
  document.getElementById('case-form-title').textContent = c ? 'แก้ไขเคส' : 'เพิ่มเคสใหม่';

  document.getElementById('case-id').value         = c?.id || '';
  document.getElementById('cf-groupId').value      = c?.groupId      || 'GI';
  document.getElementById('cf-difficulty').value   = c?.difficulty   || 'easy';
  document.getElementById('cf-title').value        = c?.title        || '';
  document.getElementById('cf-occupation').value   = c?.occupation   || '';
  document.getElementById('cf-gender').value       = c?.gender       || 'random';
  document.getElementById('cf-age').value          = c?.age          ?? 0;
  document.getElementById('cf-sceneDesc').value    = c?.sceneDesc    || '';
  document.getElementById('cf-chiefComplaint').value = c?.chiefComplaint || '';
  document.getElementById('cf-secretInfo').value   = c?.secretInfo   || '';
  document.getElementById('cf-specificChecklist').value = c?.specificChecklist || '';
  document.getElementById('cf-diagnosisAnswer').value   = c?.diagnosisAnswer   || '';
  document.getElementById('cf-drugAnswer').value   = c?.drugAnswer
    ? JSON.stringify(c.drugAnswer, null, 2) : '{\n  "firstLine": [],\n  "alternatives": [],\n  "unacceptable": [],\n  "counseling": []\n}';

  wrap.scrollIntoView({ behavior: 'smooth' });
}

async function _saveCaseForm() {
  const alertEl = document.getElementById('case-form-alert');
  alertEl.className = 'hidden mb-2';

  let drugAnswer;
  try {
    drugAnswer = JSON.parse(document.getElementById('cf-drugAnswer').value);
  } catch (_) {
    alertEl.className = 'alert alert-error mb-2';
    alertEl.textContent = 'drugAnswer JSON ไม่ถูกต้อง';
    return;
  }

  const caseData = {
    groupId:         document.getElementById('cf-groupId').value,
    difficulty:      document.getElementById('cf-difficulty').value,
    title:           document.getElementById('cf-title').value.trim(),
    occupation:      document.getElementById('cf-occupation').value.trim() || 'random',
    gender:          document.getElementById('cf-gender').value,
    age:             parseInt(document.getElementById('cf-age').value) || 0,
    sceneDesc:       document.getElementById('cf-sceneDesc').value.trim(),
    chiefComplaint:  document.getElementById('cf-chiefComplaint').value.trim(),
    secretInfo:      document.getElementById('cf-secretInfo').value.trim(),
    specificChecklist: document.getElementById('cf-specificChecklist').value.trim(),
    diagnosisAnswer: document.getElementById('cf-diagnosisAnswer').value.trim(),
    drugAnswer,
    isActive:        true,
  };

  const saveBtn = document.getElementById('save-case-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'กำลังบันทึก…';

  try {
    const existingId = document.getElementById('case-id').value;
    await adminSaveCase(caseData, existingId || null);
    document.getElementById('case-form-wrap').className = 'hidden mt-3';
    _adminCases = await getAllCases();
    _loadAdminTab();
  } catch (e) {
    alertEl.className   = 'alert alert-error mb-2';
    alertEl.textContent = `บันทึกล้มเหลว: ${e.message}`;
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'บันทึก';
  }
}

// ── Drugs Tab ─────────────────────────────────────────────────

async function _renderDrugsTab(body) {
  _adminDrugs = await getDrugs();

  body.innerHTML = `
    <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:0.5rem;">
      <div class="text-dim text-sm">${_adminDrugs.length} รายการ (active)</div>
      <button class="btn btn-primary btn-sm" id="add-drug-btn">+ เพิ่มยา</button>
    </div>
    <div class="drug-grid mb-3" id="drugs-grid">
      ${_adminDrugs.map(d => `
        <div class="drug-card">
          <div class="drug-name">${_escA(d.name)}</div>
          <div class="drug-detail">${_escA(d.strength)} · ${_escA(d.form)}</div>
          <div><span class="drug-badge">${_escA(d.category)}</span></div>
        </div>`).join('')}
    </div>

    <!-- Add drug form -->
    <div id="drug-form-wrap" class="hidden">
      <div class="card">
        <h3 class="mb-2">เพิ่มยาใหม่</h3>
        <div id="drug-form-alert" class="hidden mb-2"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;" class="mb-2">
          <div><label class="input-label">ชื่อยา</label><input class="input" type="text" id="df-name" /></div>
          <div><label class="input-label">ความแรง</label><input class="input" type="text" id="df-strength" placeholder="500mg" /></div>
          <div><label class="input-label">รูปแบบ</label><input class="input" type="text" id="df-form" placeholder="เม็ด / แคปซูล / ครีม" /></div>
          <div><label class="input-label">หมวดหมู่</label><input class="input" type="text" id="df-category" placeholder="ยาปฏิชีวนะ" /></div>
        </div>
        <label class="flex items-center gap-1 text-sm mb-2" style="cursor:pointer;">
          <input type="checkbox" id="df-isOtc" /> OTC (ยาไม่ต้องใช้ใบสั่งแพทย์)
        </label>
        <div class="flex gap-2" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-drug-btn">ยกเลิก</button>
          <button class="btn btn-primary" id="save-drug-btn">เพิ่มยา</button>
        </div>
      </div>
    </div>`;

  document.getElementById('add-drug-btn').addEventListener('click', () => {
    document.getElementById('drug-form-wrap').className = 'mb-3';
    document.getElementById('df-name').focus();
  });
  document.getElementById('cancel-drug-btn').addEventListener('click', () => {
    document.getElementById('drug-form-wrap').className = 'hidden';
  });
  document.getElementById('save-drug-btn').addEventListener('click', _saveDrugForm);
}

async function _saveDrugForm() {
  const alertEl = document.getElementById('drug-form-alert');
  const name    = document.getElementById('df-name').value.trim();
  if (!name) {
    alertEl.className   = 'alert alert-error mb-2';
    alertEl.textContent = 'กรุณาระบุชื่อยา';
    return;
  }
  const drugData = {
    name,
    strength: document.getElementById('df-strength').value.trim(),
    form:     document.getElementById('df-form').value.trim(),
    category: document.getElementById('df-category').value.trim(),
    isOtc:    document.getElementById('df-isOtc').checked,
    isActive: true,
  };
  try {
    await adminSaveDrug(drugData);
    _loadAdminTab();
  } catch (e) {
    alertEl.className   = 'alert alert-error mb-2';
    alertEl.textContent = `บันทึกล้มเหลว: ${e.message}`;
  }
}

// ── Results Tab ───────────────────────────────────────────────

async function _renderResultsTab(body) {
  _adminResults = await adminGetAllResults();

  if (!_adminResults.length) {
    body.innerHTML = '<div class="card text-center p-3"><p class="text-dim">ยังไม่มีผลการประเมิน</p></div>';
    return;
  }

  body.innerHTML = `
    <div class="text-dim text-sm mb-2">${_adminResults.length} ผลการประเมิน (ล่าสุด 200 รายการ)</div>
    <div class="flex-col" style="display:flex;gap:0.5rem;">
      ${_adminResults.map(r => {
        const fb      = r.feedbackJson || {};
        const total   = r.overallScore || fb.overall || 0;
        const cls     = total >= 80 ? 'text-success' : total >= 60 ? 'text-warning' : 'text-danger';
        const dateStr = r.createdAt?.toDate
          ? r.createdAt.toDate().toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
          : '—';
        return `
          <div class="history-item admin-result" data-result-id="${r.id}" style="cursor:pointer;">
            <div class="history-score ${cls}">${total}</div>
            <div style="flex:1;min-width:0;">
              <div class="font-bold text-sm">${_escA(r.userId || '—')}</div>
              <div class="text-dim text-xs">${dateStr} · session: ${_escA(r.sessionId?.slice(0,8) || '—')}…</div>
              <div class="flex gap-1 mt-1" style="flex-wrap:wrap;">
                <span class="badge" style="font-size:0.7rem;">ซักประวัติ ${r.historyScore || 0}</span>
                <span class="badge" style="font-size:0.7rem;">ยา ${r.drugScore || 0}</span>
                <span class="badge" style="font-size:0.7rem;">แนะนำ ${r.counselingScore || 0}</span>
              </div>
            </div>
            <div class="text-dim text-sm">→</div>
          </div>`;
      }).join('')}
    </div>`;

  body.querySelectorAll('.admin-result').forEach(el => {
    el.addEventListener('click', () => Router.go('summary', { resultId: el.dataset.resultId }));
  });
}

function _escA(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
