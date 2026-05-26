// ============================================================
//  screens/drugs-modal.js — Drug selection modal (Step 2)
// ============================================================

async function openDrugsModal(currentDrugs, onConfirm) {
  document.getElementById('drugs-modal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'drugs-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>💊 เลือกยาที่จะจ่าย</h3>
        <button class="btn btn-ghost btn-sm" id="modal-close">✕</button>
      </div>

      <div class="modal-body">
        <input class="input mb-2" type="text" id="drug-search" placeholder="ค้นหาชื่อยา หมวดหมู่ หรือความแรง…" autocomplete="off" />
        <div id="drug-list" class="drug-grid">
          <div style="grid-column:1/-1;text-align:center;padding:1rem;">
            <span class="spinner"></span>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="flex-direction:column;gap:0.75rem;">
        <div>
          <div class="text-sm text-dim mb-1">ยาที่เลือก:</div>
          <div id="selected-chips" class="dispensed-list"></div>
        </div>
        <div class="flex gap-2" style="justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="modal-cancel">ยกเลิก</button>
          <button class="btn btn-primary" id="modal-confirm">ยืนยัน (0 รายการ)</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  let selected = [...currentDrugs];
  let allDrugs = [];

  // ── Render helpers ───────────────────────────────────────

  function updateConfirmBtn() {
    const btn = document.getElementById('modal-confirm');
    if (btn) btn.textContent = `ยืนยัน (${selected.length} รายการ)`;
  }

  function renderSelected() {
    const cont = document.getElementById('selected-chips');
    if (!cont) return;
    if (!selected.length) {
      cont.innerHTML = '<span class="text-dim text-sm">ยังไม่ได้เลือก</span>';
    } else {
      cont.innerHTML = selected.map((d, i) => `
        <span class="dispensed-chip">
          ${_escM(d.name)} ${_escM(d.strength)}
          <button class="chip-remove" data-idx="${i}">×</button>
        </span>`).join('');
      cont.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          selected.splice(+btn.dataset.idx, 1);
          renderSelected();
          renderDrugList();
        });
      });
    }
    updateConfirmBtn();
  }

  function renderDrugList() {
    const list    = document.getElementById('drug-list');
    const keyword = document.getElementById('drug-search')?.value || '';
    if (!list) return;

    const filtered = keyword.trim() ? searchDrugs(keyword, allDrugs) : allDrugs;

    if (!filtered.length) {
      list.innerHTML = '<div class="text-dim text-sm p-2" style="grid-column:1/-1;">ไม่พบยา</div>';
      return;
    }

    list.innerHTML = filtered.map(d => {
      const isSel = selected.some(s => s.id === d.id);
      return `
        <div class="drug-card${isSel ? ' selected' : ''}" data-drug-id="${d.id}">
          <div class="drug-name">${_escM(d.name)}</div>
          <div class="drug-detail">${_escM(d.strength)} · ${_escM(d.form)}</div>
          <div><span class="drug-badge">${_escM(d.category)}</span></div>
        </div>`;
    }).join('');

    list.querySelectorAll('.drug-card').forEach(card => {
      card.addEventListener('click', () => {
        const drug = allDrugs.find(d => d.id === card.dataset.drugId);
        if (!drug) return;
        const idx = selected.findIndex(s => s.id === drug.id);
        if (idx >= 0) selected.splice(idx, 1);
        else          selected.push(drug);
        renderSelected();
        renderDrugList();
      });
    });
  }

  // ── Load drugs ───────────────────────────────────────────

  try {
    allDrugs = await getDrugs();
    renderDrugList();
    renderSelected();
  } catch (e) {
    document.getElementById('drug-list').innerHTML =
      `<div class="alert alert-error" style="grid-column:1/-1;">โหลดยาล้มเหลว: ${_escM(e.message)}</div>`;
  }

  // ── Events ───────────────────────────────────────────────

  document.getElementById('drug-search')?.addEventListener('input', renderDrugList);

  function closeModal() { modal.remove(); }

  document.getElementById('modal-close')?.addEventListener('click',  closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-confirm')?.addEventListener('click', () => {
    onConfirm(selected);
    closeModal();
  });

  // Close on overlay click
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  setTimeout(() => document.getElementById('drug-search')?.focus(), 80);
}

function _escM(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
