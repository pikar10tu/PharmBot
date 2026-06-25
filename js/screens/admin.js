// ============================================================
//  screens/admin.js — Admin CMS panel
//  Tabs: Cases | Drugs | Results
// ============================================================

let _adminTab     = 'groups';
let _adminGroups  = [];
let _adminCases   = [];
let _adminDrugs   = [];
let _adminResults = [];
let _drugIndications     = []; // [{ id, name, drugs:[{drugCode,category,regimen}] }]
let _caseRubric          = []; // [{ id, domain, label, weight, critical, femaleOnly, active }]

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
        <button class="btn btn-sm tab-btn ${_adminTab==='groups'  ? 'btn-primary' : 'btn-ghost'}" data-tab="groups">🗂️ หมวดโรค</button>
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
    if (_adminTab === 'groups')  await _renderGroupsTab(body);
    if (_adminTab === 'cases')   await _renderCasesTab(body);
    if (_adminTab === 'drugs')   await _renderDrugsTab(body);
    if (_adminTab === 'results') await _renderResultsTab(body);
  } catch (e) {
    body.innerHTML = `<div class="alert alert-error">โหลดล้มเหลว: ${_escA(e.message)}</div>`;
  }
}

// ── Cases Tab ─────────────────────────────────────────────────

async function _renderCasesTab(body) {
  [_adminCases, _adminGroups, _adminDrugs] = await Promise.all([getAllCases(), getGroups(), getDrugs()]);

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

  _setupDrugPicker();
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
  const groupOptions = _adminGroups.length
    ? _adminGroups.map(g => `<option value="${g.id}">${g.emoji ? g.emoji + ' ' : ''}${g.id}${g.label ? ' — ' + g.label : ''}</option>`).join('')
    : '<option value="">— โหลดหมวดโรคไม่ได้ —</option>';

  const fieldStyle = 'font-size:0.85rem;';
  const sectionHdr = (label, sub = '') => `
    <div style="margin:1rem 0 0.5rem;padding-bottom:0.4rem;border-bottom:1px solid var(--glass-border);">
      <span class="font-bold text-sm">${label}</span>
      ${sub ? `<span class="text-dim text-xs" style="margin-left:0.5rem;">${sub}</span>` : ''}
    </div>`;

  return `
    <input type="hidden" id="case-id" />

    ${sectionHdr('ข้อมูลพื้นฐาน')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;" class="mb-2">
      <div>
        <label class="input-label">หมวดโรค</label>
        <select class="input" id="cf-groupId">
          ${groupOptions}
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
      <label class="input-label">Chief Complaint — อาการที่ผู้ป่วยบอกเอง (กระชับ ไม่ระบุระยะเวลา)</label>
      <input class="input" type="text" id="cf-chiefComplaint" placeholder="เช่น เจ็บคอค่ะ / ท้องร่วงครับ" />
    </div>

    ${sectionHdr('โพยลับผู้ป่วย', '— กรอกเฉพาะที่มี ช่องที่ว่างจะไม่แสดงในระบบ')}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;" class="mb-2">
      <div>
        <label class="input-label">โทนอารมณ์ผู้ป่วย <span class="text-dim text-xs">(มีผลกับเสียง/การพูด)</span></label>
        <select class="input" id="cf-si-tone" style="${fieldStyle}">
          ${TONE_OPTIONS.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="input-label">ลักษณะอาการ <span class="text-dim text-xs">(เช่น แสบ/ปวดตุบๆ/แน่น/คัน)</span></label>
        <input class="input" type="text" id="cf-si-symptomCharacter"
          placeholder="เช่น เจ็บแสบเวลากลืน / ปวดตุบๆ เป็นพักๆ" style="${fieldStyle}" />
      </div>
    </div>

    <div class="mb-2">
      <label class="input-label">อาการหลัก <span class="text-dim text-xs">(บอกทันทีถ้าถาม)</span></label>
      <textarea class="input" id="cf-si-mainSymptoms" rows="2" style="resize:vertical;${fieldStyle}"
        placeholder="เช่น เจ็บคอ กลืนลำบาก / ถ่ายเหลว ไม่มีเลือดหรือมูก"></textarea>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;" class="mb-2">
      <div>
        <label class="input-label">ระยะเวลาที่เป็น</label>
        <input class="input" type="text" id="cf-si-duration"
          placeholder="เช่น เป็นมา 3 วัน" style="${fieldStyle}" />
      </div>
      <div>
        <label class="input-label">ความรุนแรง</label>
        <input class="input" type="text" id="cf-si-severity"
          placeholder="เช่น ปวดมาก 7/10 / เล็กน้อย ยังทำงานได้" style="${fieldStyle}" />
      </div>
    </div>

    <div class="mb-2">
      <label class="input-label">อาการร่วม</label>
      <textarea class="input" id="cf-si-associated" rows="2" style="resize:vertical;${fieldStyle}"
        placeholder="เช่น มีไข้ 38°C ไม่ไอ ไม่มีน้ำมูก"></textarea>
    </div>

    <div class="mb-2">
      <label class="input-label">ปัจจัยที่ทำให้แย่ลง / ดีขึ้น</label>
      <input class="input" type="text" id="cf-si-factors"
        placeholder="เช่น แย่ลงเมื่อกลืนอาหาร ดีขึ้นเมื่อนอนพัก" style="${fieldStyle}" />
    </div>

    <div class="mb-2">
      <label class="input-label">ประวัติเคยเป็นโรคนี้มาก่อน</label>
      <input class="input" type="text" id="cf-si-pastHistory"
        placeholder="เช่น เคยเป็นแบบนี้ตอนเด็กๆ / ไม่เคยเป็น" style="${fieldStyle}" />
    </div>

    <div class="mb-2">
      <label class="input-label">ยาที่ใช้รักษาอาการนี้มาก่อน</label>
      <input class="input" type="text" id="cf-si-prevTreatment"
        placeholder="เช่น ยังไม่ได้กินยาอะไร / ลองกิน Paracetamol แล้วดีขึ้นนิดหน่อย" style="${fieldStyle}" />
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;" class="mb-2">
      <div>
        <label class="input-label">โรคประจำตัว</label>
        <input class="input" type="text" id="cf-si-underlyingDisease"
          placeholder="ไม่มี / เบาหวาน ความดัน" style="${fieldStyle}" />
      </div>
      <div>
        <label class="input-label">ยาที่ทานประจำ</label>
        <input class="input" type="text" id="cf-si-regularMeds"
          placeholder="ไม่มี / Metformin 500mg" style="${fieldStyle}" />
      </div>
      <div>
        <label class="input-label">ประวัติแพ้ยา ⚠️</label>
        <input class="input" type="text" id="cf-si-drugAllergy"
          placeholder="ไม่มี / แพ้ Penicillin" style="${fieldStyle}" />
      </div>
    </div>

    <div class="mb-2">
      <label class="input-label">ข้อมูลเพิ่มเติม <span class="text-dim text-xs">(เช่น ประวัติครอบครัว สังคม พฤติกรรม)</span></label>
      <textarea class="input" id="cf-si-additional" rows="2" style="resize:vertical;${fieldStyle}"
        placeholder="เช่น กินอาหารนอกบ้านเมื่อคืน / เลี้ยงแมวที่บ้าน"></textarea>
    </div>

    <div class="mb-2">
      <label class="input-label">Red Flags <span class="text-dim text-xs">(ตอบถ้าถูกถามเฉพาะ)</span></label>
      <textarea class="input" id="cf-si-redFlags" rows="2" style="resize:vertical;${fieldStyle}"
        placeholder="เช่น ไม่มีไข้สูง ไม่เจ็บคอ ไม่หายใจลำบาก"></textarea>
    </div>

    ${sectionHdr('การวินิจฉัย')}
    <div class="mb-2">
      <label class="input-label">การวินิจฉัยที่ถูกต้อง (diagnosisAnswer)</label>
      <input class="input" type="text" id="cf-diagnosisAnswer"
        placeholder="เช่น ไข้หวัดธรรมดา (Common Cold / Viral URTI)" />
    </div>

    ${sectionHdr('ยาที่แนะนำ', '— ค้นหาและเลือกยาที่ถูกต้องสำหรับเคสนี้')}
    ${_buildDrugPickerHtml()}

    ${sectionHdr('เกณฑ์การให้คะแนน (Rubric)', '— แต่ละข้อกำหนดน้ำหนักได้ · คำแนะนำอยู่ในหมวด Counseling')}
    <div id="rubric-editor"></div>`;
}

// ── Drug Picker helpers ───────────────────────────────────────

function _buildDrugPickerHtml() {
  return `
    <div id="drug-indications" class="mb-2"></div>
    <button class="btn btn-ghost btn-sm" id="add-indication-btn" style="font-size:0.8rem;">+ เพิ่มข้อบ่งใช้</button>`;
}

let _indicationUid = 0;
function _newIndicationId() { return 'ind' + Date.now().toString(36) + (_indicationUid++).toString(36); }
function _findIndication(iid) { return _drugIndications.find(x => x.id === iid); }
function _findDrugEntry(iid, idx) { const ind = _findIndication(iid); return ind ? ind.drugs[idx] : null; }

function _setupDrugPicker() {
  const addBtn = document.getElementById('add-indication-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    _drugIndications.push({ id: _newIndicationId(), name: '', drugs: [] });
    _renderDrugIndications();
  });

  const host = document.getElementById('drug-indications');
  if (!host) return;

  // ── delegated events (rows are re-rendered dynamically) ──
  host.addEventListener('input', e => {
    const s = e.target.closest('.di-search');
    if (s) { _renderIndicationDropdown(s.dataset.iid, s.value); return; }
    const n = e.target.closest('.di-name');
    if (n) { const ind = _findIndication(n.dataset.iid); if (ind) ind.name = n.value; return; }
    const r = e.target.closest('.di-regimen');
    if (r) { const d = _findDrugEntry(r.dataset.iid, +r.dataset.idx); if (d) d.regimen = r.value; return; }
  });

  host.addEventListener('change', e => {
    const c = e.target.closest('.di-cat');
    if (!c) return;
    const d = _findDrugEntry(c.dataset.iid, +c.dataset.idx);
    if (d) { d.category = c.value; _renderDrugIndications(); }   // re-render → toggle regimen visibility
  });

  host.addEventListener('click', e => {
    const item = e.target.closest('.dp-item');
    if (item) {
      const ind = _findIndication(item.dataset.iid);
      if (ind && !ind.drugs.find(x => x.drugCode === item.dataset.code)) {
        ind.drugs.push({ drugCode: item.dataset.code, category: 'firstLine', regimen: '' });
      }
      _renderDrugIndications();
      return;
    }
    const rmDrug = e.target.closest('.di-drug-remove');
    if (rmDrug) {
      const ind = _findIndication(rmDrug.dataset.iid);
      if (ind) ind.drugs.splice(+rmDrug.dataset.idx, 1);
      _renderDrugIndications();
      return;
    }
    const rmInd = e.target.closest('.di-remove');
    if (rmInd) {
      const i = _drugIndications.findIndex(x => x.id === rmInd.dataset.iid);
      if (i >= 0) _drugIndications.splice(i, 1);
      _renderDrugIndications();
    }
  });

  // close dropdowns on outside click — self-removes when picker leaves DOM
  document.addEventListener('click', function _diOutside(e) {
    const h = document.getElementById('drug-indications');
    if (!h) { document.removeEventListener('click', _diOutside, true); return; }
    if (!e.target.closest('.di-search') && !e.target.closest('.di-dropdown')) {
      h.querySelectorAll('.di-dropdown').forEach(d => { d.style.display = 'none'; });
    }
  }, true);
}

function _renderIndicationDropdown(iid, query) {
  const drop = document.querySelector(`.di-dropdown[data-iid="${iid}"]`);
  if (!drop) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) { drop.style.display = 'none'; return; }

  const ind     = _findIndication(iid);
  const already = new Set((ind?.drugs || []).map(e => e.drugCode));
  const matches = _adminDrugs.filter(d =>
    !already.has(d.id) && (
      (d.name || '').toLowerCase().includes(q) ||
      (d.strength || '').toLowerCase().includes(q) ||
      (d.category || '').toLowerCase().includes(q)
    )
  ).slice(0, 14);

  if (!matches.length) { drop.style.display = 'none'; return; }

  drop.innerHTML = matches.map(d => `
    <div class="dp-item" data-iid="${_escA(iid)}" data-code="${_escA(d.id)}"
      style="padding:0.45rem 0.75rem;cursor:pointer;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.07));">
      <div style="font-size:0.84rem;font-weight:600;">${_escA(d.name)} <span style="font-weight:400;">${_escA(d.strength || '')}</span></div>
      <div style="font-size:0.73rem;opacity:0.55;">${_escA(d.form || '')} · ${_escA(d.category || '')}</div>
    </div>`).join('');
  drop.style.display = 'block';
}

function _drugEntryHtml(iid, entry, i, drugMap) {
  const d = drugMap[entry.drugCode] || {};
  const noRegimen = entry.category === 'unacceptable';
  return `
    <div class="dp-entry" style="display:grid;grid-template-columns:1fr auto;gap:0.35rem 0.5rem;
      padding:0.45rem 0.6rem;background:var(--glass-bg,rgba(255,255,255,0.04));
      border:1px solid var(--glass-border,rgba(255,255,255,0.08));border-radius:8px;margin-bottom:0.35rem;align-items:start;">
      <div>
        <span style="font-size:0.83rem;font-weight:600;">${_escA(d.name || entry.drugCode)}</span>
        <span style="font-size:0.73rem;opacity:0.5;margin-left:0.3rem;">${_escA(d.strength || '')} ${_escA(d.form || '')}</span>
      </div>
      <div class="flex gap-1 items-center">
        <select class="input di-cat" data-iid="${_escA(iid)}" data-idx="${i}"
          style="font-size:0.78rem;padding:0.18rem 0.35rem;height:auto;min-width:8rem;">
          <option value="firstLine"    ${entry.category === 'firstLine'    ? 'selected' : ''}>✅ First line</option>
          <option value="alternatives" ${entry.category === 'alternatives' ? 'selected' : ''}>🔄 Alternative</option>
          <option value="unacceptable" ${entry.category === 'unacceptable' ? 'selected' : ''}>❌ ห้ามจ่าย</option>
        </select>
        <button class="btn btn-danger btn-sm di-drug-remove" data-iid="${_escA(iid)}" data-idx="${i}"
          style="padding:0.18rem 0.45rem;font-size:0.8rem;line-height:1.2;">✕</button>
      </div>
      <div style="grid-column:span 2;${noRegimen ? 'display:none;' : ''}">
        <input class="input di-regimen" data-iid="${_escA(iid)}" data-idx="${i}" type="text"
          value="${_escA(entry.regimen || '')}"
          placeholder="วิธีใช้ เช่น กิน 1 เม็ด วันละ 3 ครั้ง หลังอาหาร"
          style="font-size:0.8rem;" />
      </div>
    </div>`;
}

function _renderDrugIndications() {
  const host = document.getElementById('drug-indications');
  if (!host) return;

  if (!_drugIndications.length) {
    host.innerHTML = '<div class="text-dim text-xs" style="text-align:center;padding:0.4rem 0;">ยังไม่มีข้อบ่งใช้ — กด "+ เพิ่มข้อบ่งใช้"</div>';
    return;
  }

  const drugMap = {};
  _adminDrugs.forEach(d => { drugMap[d.id] = d; });

  host.innerHTML = _drugIndications.map((ind, ii) => {
    const drugs = ind.drugs.map((entry, i) => _drugEntryHtml(ind.id, entry, i, drugMap)).join('')
      || '<div class="text-dim text-xs" style="padding:0.25rem 0 0.4rem;">ยังไม่ได้เลือกยาในข้อบ่งใช้นี้</div>';
    return `
      <div class="di-card" style="border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:10px;
        padding:0.6rem 0.65rem;margin-bottom:0.6rem;background:rgba(255,255,255,0.02);">
        <div class="flex items-center gap-1" style="margin-bottom:0.45rem;">
          <span class="text-dim text-xs" style="white-space:nowrap;">ข้อบ่งใช้ ${ii + 1}</span>
          <input class="input di-name" data-iid="${_escA(ind.id)}" type="text" value="${_escA(ind.name)}"
            placeholder="เช่น ลดไข้/แก้ปวด, ฆ่าเชื้อ, แก้ไอ" style="font-size:0.83rem;font-weight:600;" />
          <button class="btn btn-danger btn-sm di-remove" data-iid="${_escA(ind.id)}" title="ลบข้อบ่งใช้นี้"
            style="padding:0.15rem 0.45rem;font-size:0.8rem;line-height:1.2;">✕</button>
        </div>
        <div class="di-drugs">${drugs}</div>
        <div style="position:relative;margin-top:0.4rem;">
          <input class="input di-search" data-iid="${_escA(ind.id)}" type="text" autocomplete="off"
            placeholder="พิมพ์ชื่อยาเพื่อเพิ่มในข้อบ่งใช้นี้..." style="font-size:0.8rem;" />
          <div class="di-dropdown" data-iid="${_escA(ind.id)}" style="display:none;position:absolute;z-index:20;width:100%;
            background:var(--bg2,#1e293b);color:var(--text,#e2e8f0);
            border:1px solid var(--glass-border,rgba(255,255,255,0.12));
            border-radius:8px;max-height:230px;overflow-y:auto;margin-top:2px;
            box-shadow:0 4px 16px rgba(0,0,0,0.4);"></div>
        </div>
      </div>`;
  }).join('');
}

function _loadDrugAnswerIntoPicker(drugAnswer) {
  _drugIndications = [];

  if (drugAnswer && Array.isArray(drugAnswer.indications) && drugAnswer.indications.length) {
    // โครงสร้างใหม่ (จัดกลุ่มตามข้อบ่งใช้)
    drugAnswer.indications.forEach(ind => {
      _drugIndications.push({
        id:    _newIndicationId(),
        name:  ind.name || '',
        drugs: (ind.drugs || []).map(x => {
          const code = typeof x === 'string' ? x : x.drugCode;
          return {
            drugCode: code,
            category: (typeof x === 'object' && x.category) ? x.category : 'firstLine',
            regimen:  (typeof x === 'object' ? (x.regimen || '') : '') || drugAnswer.regimen?.[code] || '',
          };
        }).filter(d => d.drugCode),
      });
    });
  } else if (drugAnswer) {
    // เคสเดิม (flat) → รวมเป็นข้อบ่งใช้เดียว
    const drugs = [];
    const add = (codes, cat) => {
      if (!Array.isArray(codes)) return;
      codes.forEach(item => {
        const code = typeof item === 'string' ? item : (item?.drugs?.[0] || null);
        if (!code) return;
        const regimen = drugAnswer.regimen?.[code] ||
                        (typeof item === 'object' ? (item.regimen || '') : '') || '';
        drugs.push({ drugCode: code, category: cat, regimen });
      });
    };
    add(drugAnswer.firstLine,    'firstLine');
    add(drugAnswer.alternatives, 'alternatives');
    add(drugAnswer.unacceptable, 'unacceptable');
    if (drugs.length) _drugIndications.push({ id: _newIndicationId(), name: '', drugs });
  }

  _renderDrugIndications();
  // counseling ย้ายไปอยู่ในหมวด counseling ของ Rubric editor แล้ว
}

function _buildDrugAnswerFromPicker() {
  // โครงสร้างจัดกลุ่มตามข้อบ่งใช้ (source of truth ใหม่)
  const indications = _drugIndications.map(ind => ({
    name:  (ind.name || '').trim(),
    drugs: ind.drugs.map(e => ({
      drugCode: e.drugCode,
      category: e.category,
      regimen:  (e.regimen || '').trim(),
    })),
  }));

  // derive flat fields (รวมทุกข้อบ่งใช้) ให้ eval/โค้ดเดิมใช้ได้เหมือนเดิม
  const firstLine = [], alternatives = [], unacceptable = [], regimen = {};
  _drugIndications.forEach(ind => {
    ind.drugs.forEach(e => {
      if (e.category === 'firstLine')         firstLine.push(e.drugCode);
      else if (e.category === 'alternatives') alternatives.push(e.drugCode);
      else if (e.category === 'unacceptable') unacceptable.push(e.drugCode);
      if (e.category !== 'unacceptable' && (e.regimen || '').trim() && !regimen[e.drugCode]) {
        regimen[e.drugCode] = e.regimen.trim();
      }
    });
  });

  // counseling = label ของข้อในหมวด counseling ของ rubric (mirror ไว้เพื่อความเข้ากันได้)
  const counseling = _caseRubric
    .filter(it => it.domain === 'counseling' && it.active !== false)
    .map(it => (it.label || '').trim())
    .filter(Boolean);

  return { firstLine, alternatives, unacceptable, regimen, counseling, indications };
}

// ── Rubric editor ─────────────────────────────────────────────
let _rubricUid = 0;
function _newRubricId(domain) {
  return `${domain[0]}x${Date.now().toString(36)}${(_rubricUid++).toString(36)}`;
}

function _renderRubricEditor() {
  const host = document.getElementById('rubric-editor');
  if (!host) return;

  host.innerHTML = DOMAIN_ORDER.map(dom => {
    const items   = _caseRubric.filter(it => it.domain === dom);
    const total   = items.filter(it => it.active !== false)
                         .reduce((s, it) => s + (Number(it.weight) || 0), 0);
    const domPct  = Math.round((DOMAIN_WEIGHTS[dom] || 0) * 100);

    const rows = items.map(it => {
      const dim = it.active === false ? 'opacity:0.45;' : '';
      const tags = `${it.critical ? '<span class="badge" style="font-size:0.62rem;background:rgba(239,68,68,0.18);">CRITICAL</span>' : ''}${it.femaleOnly ? '<span class="badge" style="font-size:0.62rem;">♀ เฉพาะหญิง</span>' : ''}`;
      return `
        <div class="dp-entry" data-id="${_escA(it.id)}" style="display:grid;grid-template-columns:auto 1fr auto auto;gap:0.4rem 0.5rem;align-items:center;
          padding:0.4rem 0.55rem;background:var(--glass-bg,rgba(255,255,255,0.04));
          border:1px solid var(--glass-border,rgba(255,255,255,0.08));border-radius:8px;margin-bottom:0.35rem;${dim}">
          <input type="checkbox" class="rb-active" data-id="${_escA(it.id)}" ${it.active !== false ? 'checked' : ''} title="เปิด/ปิดข้อนี้" />
          <input class="input rb-label" data-id="${_escA(it.id)}" type="text" value="${_escA(it.label)}"
            style="font-size:0.8rem;padding:0.25rem 0.45rem;" />
          <div class="flex items-center gap-1">
            ${tags}
            <input class="input rb-weight" data-id="${_escA(it.id)}" type="number" min="0" max="50" value="${Number(it.weight) || 0}"
              style="font-size:0.8rem;width:3.4rem;padding:0.25rem 0.35rem;text-align:center;" title="น้ำหนักข้อ" />
          </div>
          <button class="btn btn-danger btn-sm rb-remove" data-id="${_escA(it.id)}"
            style="padding:0.15rem 0.4rem;font-size:0.78rem;line-height:1.2;">✕</button>
        </div>`;
    }).join('') || '<div class="text-dim text-xs" style="padding:0.3rem 0;">ยังไม่มีข้อในหมวดนี้</div>';

    return `
      <div style="margin-bottom:1rem;">
        <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:0.4rem;margin-bottom:0.4rem;">
          <div class="font-bold text-sm">${_escA(DOMAIN_LABELS[dom])}
            <span class="text-dim text-xs">· น้ำหนักหมวด ${domPct}% · รวม ${total} แต้ม</span>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-sm rb-add" data-domain="${dom}" style="font-size:0.74rem;">+ เพิ่มข้อ</button>
            <button class="btn btn-ghost btn-sm rb-reset" data-domain="${dom}" style="font-size:0.74rem;">↺ ค่าเริ่มต้น</button>
          </div>
        </div>
        ${rows}
      </div>`;
  }).join('');

  _wireRubricEditor();
}

function _wireRubricEditor() {
  const host = document.getElementById('rubric-editor');
  if (!host) return;

  const find = id => _caseRubric.find(it => it.id === id);

  host.querySelectorAll('.rb-label').forEach(inp =>
    inp.addEventListener('input', () => { const it = find(inp.dataset.id); if (it) it.label = inp.value; }));

  host.querySelectorAll('.rb-weight').forEach(inp =>
    inp.addEventListener('input', () => {
      const it = find(inp.dataset.id);
      if (it) { it.weight = parseInt(inp.value) || 0; _refreshRubricTotals(); }
    }));

  host.querySelectorAll('.rb-active').forEach(chk =>
    chk.addEventListener('change', () => {
      const it = find(chk.dataset.id);
      if (it) { it.active = chk.checked; _renderRubricEditor(); }
    }));

  host.querySelectorAll('.rb-remove').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = _caseRubric.findIndex(it => it.id === btn.dataset.id);
      if (i >= 0) { _caseRubric.splice(i, 1); _renderRubricEditor(); }
    }));

  host.querySelectorAll('.rb-add').forEach(btn =>
    btn.addEventListener('click', () => {
      const dom = btn.dataset.domain;
      _caseRubric.push({ id: _newRubricId(dom), domain: dom, label: '', weight: 3, critical: false, active: true, custom: true });
      _renderRubricEditor();
    }));

  host.querySelectorAll('.rb-reset').forEach(btn =>
    btn.addEventListener('click', () => {
      const dom = btn.dataset.domain;
      if (!confirm(`รีเซ็ตหมวดนี้เป็นค่าเริ่มต้น? ข้อที่แก้ไว้ในหมวดนี้จะหายไป`)) return;
      _caseRubric = _caseRubric.filter(it => it.domain !== dom)
        .concat(getDefaultRubric().filter(it => it.domain === dom));
      _renderRubricEditor();
    }));
}

// อัปเดตเฉพาะตัวเลขรวมต่อหมวด (ไม่ re-render ทั้งหมด เพื่อไม่ให้ช่องที่กำลังพิมพ์เด้ง)
function _refreshRubricTotals() {
  const host = document.getElementById('rubric-editor');
  if (!host) return;
  const blocks = host.querySelectorAll('.font-bold .text-dim');
  DOMAIN_ORDER.forEach((dom, i) => {
    const total = _caseRubric.filter(it => it.domain === dom && it.active !== false)
      .reduce((s, it) => s + (Number(it.weight) || 0), 0);
    const el = blocks[i];
    if (el) el.textContent = `· น้ำหนักหมวด ${Math.round((DOMAIN_WEIGHTS[dom] || 0) * 100)}% · รวม ${total} แต้ม`;
  });
}

function _openCaseForm(c) {
  const wrap = document.getElementById('case-form-wrap');
  wrap.className = 'mt-3';
  document.getElementById('case-form-title').textContent = c ? 'แก้ไขเคส' : 'เพิ่มเคสใหม่';

  document.getElementById('case-id').value              = c?.id || '';
  document.getElementById('cf-groupId').value           = c?.groupId      || 'GI';
  document.getElementById('cf-difficulty').value        = c?.difficulty   || 'easy';
  document.getElementById('cf-title').value             = c?.title        || '';
  document.getElementById('cf-occupation').value        = c?.occupation   || '';
  document.getElementById('cf-gender').value            = c?.gender       || 'random';
  document.getElementById('cf-age').value               = c?.age          ?? 0;
  document.getElementById('cf-chiefComplaint').value    = c?.chiefComplaint || '';
  document.getElementById('cf-diagnosisAnswer').value   = c?.diagnosisAnswer   || '';
  _loadDrugAnswerIntoPicker(c?.drugAnswer || null);

  // โหลด rubric (เคสเดิมไม่มี → seed + migrate counseling/specificChecklist เดิม)
  _caseRubric = JSON.parse(JSON.stringify(buildRubricForCase(c || {})));
  _renderRubricEditor();

  // โพยลับ — ใช้ secretInfoFields ถ้ามี (กรอกแบบ structured)
  const f = c?.secretInfoFields || {};
  document.getElementById('cf-si-tone').value           = TONE_OPTIONS.some(t => t.value === f.tone) ? f.tone : 'neutral';
  document.getElementById('cf-si-symptomCharacter').value = f.symptomCharacter || '';
  document.getElementById('cf-si-mainSymptoms').value   = f.mainSymptoms   || '';
  document.getElementById('cf-si-duration').value       = f.duration       || '';
  document.getElementById('cf-si-severity').value       = f.severity       || '';
  document.getElementById('cf-si-associated').value     = f.associated     || '';
  document.getElementById('cf-si-factors').value        = f.factors        || '';
  document.getElementById('cf-si-pastHistory').value    = f.pastHistory    || '';
  document.getElementById('cf-si-prevTreatment').value  = f.prevTreatment  || '';
  document.getElementById('cf-si-underlyingDisease').value = f.underlyingDisease || '';
  document.getElementById('cf-si-regularMeds').value    = f.regularMeds    || '';
  document.getElementById('cf-si-drugAllergy').value    = f.drugAllergy    || '';
  document.getElementById('cf-si-additional').value     = f.additional     || '';
  document.getElementById('cf-si-redFlags').value       = f.redFlags       || '';

  wrap.scrollIntoView({ behavior: 'smooth' });
}

// ประกอบ secretInfo string จาก structured fields (ช่องว่างจะไม่แสดง)
function _assembleSecretInfo(f) {
  const lines = [];

  lines.push(`โทนอารมณ์: ${getToneLabel(f.tone)}`);

  const section1 = [f.mainSymptoms].filter(Boolean);
  if (section1.length) {
    lines.push('');
    lines.push('[หมวด 1: อาการหลัก — ตอบได้ทันทีถ้าถาม]');
    section1.forEach(s => s.split('\n').forEach(l => l.trim() && lines.push(`- ${l.trim()}`)));
  }

  const detail = [
    f.symptomCharacter && `ลักษณะอาการ: ${f.symptomCharacter}`,
    f.duration       && `ระยะเวลา: ${f.duration}`,
    f.severity       && `ความรุนแรง: ${f.severity}`,
    f.associated     && `อาการร่วม: ${f.associated}`,
    f.factors        && `ปัจจัยที่ทำให้แย่ลง/ดีขึ้น: ${f.factors}`,
  ].filter(Boolean);
  if (detail.length) {
    lines.push('');
    lines.push('[หมวด 2: รายละเอียดอาการ — ต้องถามเฉพาะ]');
    detail.forEach(d => lines.push(`- ${d}`));
  }

  const rx = [
    f.prevTreatment && `ยาที่ลองใช้แล้ว: ${f.prevTreatment}`,
    f.pastHistory   && `ประวัติเคยเป็น: ${f.pastHistory}`,
  ].filter(Boolean);
  if (rx.length) {
    lines.push('');
    lines.push('[หมวด 3: ประวัติการรักษา — ต้องถาม]');
    rx.forEach(r => lines.push(`- ${r}`));
  }

  const safety = [
    f.underlyingDisease && `โรคประจำตัว: ${f.underlyingDisease}`,
    f.regularMeds       && `ยาประจำ: ${f.regularMeds}`,
    f.drugAllergy       && `ประวัติแพ้ยา: ${f.drugAllergy}`,
  ].filter(Boolean);
  if (safety.length) {
    lines.push('');
    lines.push('[หมวด 4: ความปลอดภัย — CRITICAL ต้องถาม]');
    safety.forEach(s => lines.push(`- ${s}`));
  }

  if (f.additional) {
    lines.push('');
    lines.push('[หมวด 5: ข้อมูลเพิ่มเติม]');
    f.additional.split('\n').forEach(l => l.trim() && lines.push(`- ${l.trim()}`));
  }

  if (f.redFlags) {
    lines.push('');
    lines.push('[หมวด 6: Red Flags — ถ้าถูกถาม]');
    f.redFlags.split('\n').forEach(l => l.trim() && lines.push(`- ${l.trim()}`));
  }

  return lines.join('\n').trim();
}

async function _saveCaseForm() {
  const alertEl = document.getElementById('case-form-alert');
  alertEl.className = 'hidden mb-2';

  const drugAnswer = _buildDrugAnswerFromPicker();

  // รวบรวม structured fields
  const sif = {
    tone:              document.getElementById('cf-si-tone').value,
    symptomCharacter:  document.getElementById('cf-si-symptomCharacter').value.trim(),
    mainSymptoms:      document.getElementById('cf-si-mainSymptoms').value.trim(),
    duration:          document.getElementById('cf-si-duration').value.trim(),
    severity:          document.getElementById('cf-si-severity').value.trim(),
    associated:        document.getElementById('cf-si-associated').value.trim(),
    factors:           document.getElementById('cf-si-factors').value.trim(),
    pastHistory:       document.getElementById('cf-si-pastHistory').value.trim(),
    prevTreatment:     document.getElementById('cf-si-prevTreatment').value.trim(),
    underlyingDisease: document.getElementById('cf-si-underlyingDisease').value.trim(),
    regularMeds:       document.getElementById('cf-si-regularMeds').value.trim(),
    drugAllergy:       document.getElementById('cf-si-drugAllergy').value.trim(),
    additional:        document.getElementById('cf-si-additional').value.trim(),
    redFlags:          document.getElementById('cf-si-redFlags').value.trim(),
  };

  // rubric: ตัดข้อที่ไม่มี label และ normalize ค่า
  const rubric = _caseRubric
    .filter(it => (it.label || '').trim())
    .map(it => ({
      id:       it.id,
      domain:   it.domain,
      label:    it.label.trim(),
      weight:   Number(it.weight) || 0,
      critical: !!it.critical,
      active:   it.active !== false,
      ...(it.femaleOnly ? { femaleOnly: true } : {}),
      ...(it.custom ? { custom: true } : {}),
    }));

  const caseData = {
    groupId:           document.getElementById('cf-groupId').value,
    difficulty:        document.getElementById('cf-difficulty').value,
    title:             document.getElementById('cf-title').value.trim(),
    occupation:        document.getElementById('cf-occupation').value.trim() || 'random',
    gender:            document.getElementById('cf-gender').value,
    age:               parseInt(document.getElementById('cf-age').value) || 0,
    chiefComplaint:    document.getElementById('cf-chiefComplaint').value.trim(),
    secretInfo:        _assembleSecretInfo(sif),   // ประกอบจาก structured fields
    secretInfoFields:  sif,                         // เก็บต้นฉบับไว้แก้ไขครั้งหน้า
    diagnosisAnswer:   document.getElementById('cf-diagnosisAnswer').value.trim(),
    drugAnswer,
    rubric,
    sceneDesc:         '',   // ตัดออก → chat.js สร้างฉากเปิดอัตโนมัติ
    specificChecklist: '',   // ย้ายเข้าไปเป็นข้อใน rubric แล้ว
    isActive:          true,
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

// ── Groups Tab ────────────────────────────────────────────────

async function _renderGroupsTab(body) {
  _adminGroups = await getGroups();

  body.innerHTML = `
    <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:0.5rem;">
      <div class="text-dim text-sm">${_adminGroups.length} หมวดโรค</div>
      <button class="btn btn-primary btn-sm" id="add-group-btn">+ เพิ่มหมวด</button>
    </div>

    <!-- Group form (hidden by default) -->
    <div id="group-form-wrap" class="hidden card mb-3">
      <h3 class="mb-2" id="group-form-title">เพิ่มหมวดโรคใหม่</h3>
      <div id="group-form-alert" class="hidden mb-2"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0.75rem;" class="mb-2">
        <div style="grid-column:span 2;">
          <label class="input-label">Group ID <span class="text-dim text-xs">(เช่น INF_URI — ตัวพิมพ์ใหญ่)</span></label>
          <input class="input" type="text" id="gf-id" placeholder="INF_URI" />
        </div>
        <div>
          <label class="input-label">Emoji</label>
          <input class="input" type="text" id="gf-emoji" placeholder="🫁" />
        </div>
        <div>
          <label class="input-label">ลำดับ</label>
          <input class="input" type="number" id="gf-sortOrder" value="99" min="1" />
        </div>
        <div style="grid-column:span 4;">
          <label class="input-label">ชื่อหมวด (ภาษาไทย)</label>
          <input class="input" type="text" id="gf-label" placeholder="เช่น โรคระบบทางเดินหายใจส่วนบน" />
        </div>
      </div>
      <div class="flex gap-2" style="justify-content:flex-end;">
        <button class="btn btn-ghost" id="cancel-group-btn">ยกเลิก</button>
        <button class="btn btn-primary" id="save-group-btn">บันทึก</button>
      </div>
    </div>

    <!-- Groups list -->
    <div class="flex-col" style="display:flex;gap:0.5rem;">
      ${_adminGroups.length
        ? _adminGroups.map(g => _groupRow(g)).join('')
        : '<div class="card text-center p-3"><p class="text-dim">ยังไม่มีหมวดโรค — กด "+ เพิ่มหมวด"</p></div>'}
    </div>`;

  document.getElementById('add-group-btn').addEventListener('click', () => _openGroupForm(null));
  document.getElementById('cancel-group-btn').addEventListener('click', () => {
    document.getElementById('group-form-wrap').className = 'hidden card mb-3';
  });
  document.getElementById('save-group-btn').addEventListener('click', _saveGroupForm);

  body.querySelectorAll('.edit-group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = _adminGroups.find(x => x.id === btn.dataset.id);
      if (g) _openGroupForm(g);
    });
  });

  body.querySelectorAll('.delete-group-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm(`ลบหมวด "${id}" ออกเลยไหม?\nเคสที่อ้างอิงหมวดนี้จะยังคงอยู่ แต่ไม่แสดงในหน้าเลือกหมวด`)) return;
      try {
        await adminDeleteGroup(id);
        _loadAdminTab();
      } catch (e) { alert('ลบล้มเหลว: ' + e.message); }
    });
  });
}

function _groupRow(g) {
  return `
    <div class="history-item" style="cursor:default;">
      <div style="font-size:1.5rem;width:2rem;text-align:center;flex-shrink:0;">${_escA(g.emoji || '📦')}</div>
      <div style="flex:1;min-width:0;">
        <div class="font-bold text-sm">${_escA(g.id)}</div>
        <div class="text-dim text-xs">${_escA(g.label || '(ไม่มีชื่อ)')} · ลำดับ ${g.sortOrder ?? '—'}</div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm edit-group-btn" data-id="${g.id}">แก้ไข</button>
        <button class="btn btn-danger btn-sm delete-group-btn" data-id="${g.id}">ลบ</button>
      </div>
    </div>`;
}

function _openGroupForm(g) {
  const wrap  = document.getElementById('group-form-wrap');
  const idInp = document.getElementById('gf-id');
  wrap.className = 'card mb-3';
  document.getElementById('group-form-title').textContent = g ? `แก้ไข: ${g.id}` : 'เพิ่มหมวดโรคใหม่';
  idInp.value    = g?.id        || '';
  idInp.disabled = !!g;          // ID ของหมวดที่มีอยู่แล้วแก้ไม่ได้
  document.getElementById('gf-label').value     = g?.label     || '';
  document.getElementById('gf-emoji').value     = g?.emoji     || '';
  document.getElementById('gf-sortOrder').value = g?.sortOrder ?? 99;
  wrap.scrollIntoView({ behavior: 'smooth' });
}

async function _saveGroupForm() {
  const alertEl = document.getElementById('group-form-alert');
  alertEl.className = 'hidden mb-2';

  const idInp   = document.getElementById('gf-id');
  const groupId = (idInp.disabled ? idInp.value : idInp.value.trim().toUpperCase());
  if (!groupId) {
    alertEl.className = 'alert alert-error mb-2';
    alertEl.textContent = 'กรุณาระบุ Group ID';
    return;
  }

  const groupData = {
    label:     document.getElementById('gf-label').value.trim(),
    emoji:     document.getElementById('gf-emoji').value.trim(),
    sortOrder: parseInt(document.getElementById('gf-sortOrder').value) || 99,
  };

  const saveBtn = document.getElementById('save-group-btn');
  saveBtn.disabled = true; saveBtn.textContent = 'กำลังบันทึก…';
  try {
    await adminSaveGroup(groupData, groupId);
    document.getElementById('group-form-wrap').className = 'hidden card mb-3';
    _loadAdminTab();
  } catch (e) {
    alertEl.className   = 'alert alert-error mb-2';
    alertEl.textContent = `บันทึกล้มเหลว: ${e.message}`;
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = 'บันทึก';
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
    <div class="drug-grid drug-grid-compact mb-3" id="drugs-grid">
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
