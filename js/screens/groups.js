// ============================================================
//  screens/groups.js
// ============================================================

const STATIC_GROUPS = [
  { id: 'MSK',       labelTh: 'Musculoskeletal — ปวดกล้ามเนื้อ/ข้อ',          emoji: '🦴', sortOrder: 1 },
  { id: 'CVD',       labelTh: 'Cardiovascular — หัวใจและหลอดเลือด',           emoji: '🫀', sortOrder: 2 },
  { id: 'DERM',      labelTh: 'Dermatologic — ผิวหนัง',                        emoji: '🩹', sortOrder: 3 },
  { id: 'ENDO',      labelTh: 'Endocrine — ต่อมไร้ท่อ / เบาหวาน',             emoji: '💉', sortOrder: 4 },
  { id: 'GI',        labelTh: 'Gastrointestinal — ทางเดินอาหาร',              emoji: '🤢', sortOrder: 5 },
  { id: 'HEMO',      labelTh: 'Hematologic — โลหิตวิทยา',                     emoji: '🩸', sortOrder: 6 },
  { id: 'IMMUNO',    labelTh: 'Immunologic/Allergy — ภูมิแพ้',                emoji: '🤧', sortOrder: 7 },
  { id: 'INF_URI',   labelTh: 'Infectious — Upper Respiratory',               emoji: '🫁', sortOrder: 8 },
  { id: 'INF_UTI',   labelTh: 'Infectious — Urinary Tract',                   emoji: '💊', sortOrder: 9 },
  { id: 'INF_OTHER', labelTh: 'Infectious — STD / Other',                     emoji: '🦠', sortOrder: 10 },
  { id: 'NEURO',     labelTh: 'Neurologic — ระบบประสาท',                      emoji: '🧠', sortOrder: 11 },
  { id: 'PSYCH',     labelTh: 'Psychiatric — จิตเวช',                         emoji: '🧘', sortOrder: 12 },
  { id: 'PULM',      labelTh: 'Pulmonary — ระบบทางเดินหายใจ',                 emoji: '🌬️', sortOrder: 13 },
  { id: 'GYN',       labelTh: 'Gynecologic — นรีเวช',                         emoji: '🌸', sortOrder: 14 },
  { id: 'ENT_EYE',   labelTh: 'Eye & Ear Disorder — ตาและหู',                 emoji: '👁️', sortOrder: 15 },
  { id: 'RENAL',     labelTh: 'Renal — ไต',                                   emoji: '🫘', sortOrder: 16 },
  { id: 'REFER',     labelTh: 'Red Flag — เคสต้องส่งต่อ',                     emoji: '🚨', sortOrder: 17 },
  { id: 'SPECIAL',   labelTh: 'Special — Polypharmacy / ตั้งครรภ์',           emoji: '⚠️', sortOrder: 18 },
];

async function renderGroups(container) {
  const profile = getUserProfile();
  const pid     = profile?.participantId || getCurrentUser()?.email?.split('@')[0].toUpperCase();

  container.innerHTML = `
    ${renderNavbar(pid)}
    <div class="container fade-in">
      <div class="flex items-center gap-2 mb-3">
        <button class="btn btn-ghost btn-sm" id="back-btn">← กลับ</button>
        <div>
          <h2>เลือกหมวดโรค</h2>
          <p class="text-dim text-sm">เลือกหมวดที่ต้องการฝึก</p>
        </div>
      </div>
      <div id="groups-grid" class="group-grid">
        <div class="text-center p-3" style="grid-column:1/-1;"><span class="spinner"></span></div>
      </div>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => Router.go('dashboard'));

  // Load groups from Firestore; fallback to STATIC_GROUPS if empty/error
  let groups;
  try {
    const rows = await getGroups();
    groups = rows.length
      ? rows.map(g => ({
          id:       g.id,
          labelTh:  g.label || g.labelTh || g.id,
          emoji:    g.emoji || STATIC_GROUPS.find(s => s.id === g.id)?.emoji || '📦',
          sortOrder: g.sortOrder ?? 99,
        }))
      : STATIC_GROUPS;
  } catch (_) {
    groups = STATIC_GROUPS;
  }

  document.getElementById('groups-grid').innerHTML = groups.map(g => `
    <div class="group-card" data-group="${g.id}">
      <div class="group-emoji">${g.emoji}</div>
      <div class="group-label">${g.labelTh}</div>
    </div>`).join('');

  document.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => {
      const groupId    = card.dataset.group;
      const groupLabel = groups.find(g => g.id === groupId)?.labelTh || groupId;
      Router.go('cases', { groupId, groupLabel });
    });
  });
}
