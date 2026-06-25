// ============================================================
//  prompts.js — v6
//  buildSystemPrompt, buildEvalPrompt, buildCounselingPrompt
//  + Rubric system (per-item weights → 4 research domains)
// ============================================================

// ── Domain weights (คงที่เพื่อความเสถียรของงานวิจัย) ───────────
const DOMAIN_WEIGHTS = { history: 0.25, diagnosis: 0.15, drug: 0.40, counseling: 0.20 };
const DOMAIN_ORDER   = ['history', 'diagnosis', 'drug', 'counseling'];
const DOMAIN_LABELS  = {
  history:    'ซักประวัติ (WWHAM)',
  diagnosis:  'การประเมิน / Red Flag',
  drug:       'การเลือกและจ่ายยา',
  counseling: 'การให้คำแนะนำ (Counseling)',
};

// ── Patient tone (แทน free-text personality) ──────────────────
const TONE_OPTIONS = [
  { value: 'neutral',   label: 'เรียบเฉย (ปกติ)' },
  { value: 'anxious',   label: 'กังวล / เครียด' },
  { value: 'hurried',   label: 'รีบร้อน' },
  { value: 'tired',     label: 'อ่อนเพลีย / ไม่ค่อยมีแรง' },
  { value: 'irritable', label: 'หงุดหงิด / รำคาญ' },
];

function getToneLabel(tone) {
  return (TONE_OPTIONS.find(t => t.value === tone) || TONE_OPTIONS[0]).label;
}

function toneToStyle(tone) {
  switch (tone) {
    case 'anxious':   return 'น้ำเสียงกังวล พูดเร็วขึ้นเล็กน้อย ถามย้ำขอความมั่นใจบ้าง';
    case 'hurried':   return 'รีบร้อน อยากได้ยาเร็วๆ ตอบสั้น บางทีเร่งให้รีบ';
    case 'tired':     return 'อ่อนเพลีย พูดช้า เสียงเบา ดูไม่ค่อยมีแรง';
    case 'irritable': return 'หงุดหงิดเล็กน้อย รำคาญถ้าถูกถามเยอะ ตอบห้วนบ้าง';
    default:          return 'พูดเรียบๆ ตรงไปตรงมา เหมือนคนมาซื้อยาทั่วไป';
  }
}

function getCaseTone(caseData) {
  return caseData?.secretInfoFields?.tone || caseData?.tone || 'neutral';
}

// สร้างฉากเปิดอัตโนมัติ (แทน sceneDesc free-text)
function buildSceneDesc(caseData) {
  const g   = caseData.gender === 'male' ? 'ผู้ชาย' : 'ผู้หญิง';
  const job = caseData.occupation && caseData.occupation !== 'random'
    ? ` อาชีพ${caseData.occupation}` : '';
  const posture = {
    anxious:   ' ท่าทางกังวลเล็กน้อย',
    hurried:   ' ดูรีบๆ',
    tired:     ' ท่าทางอ่อนเพลีย',
    irritable: ' สีหน้าไม่ค่อยสบายอารมณ์',
  }[getCaseTone(caseData)] || '';
  return `${g}อายุราว ${caseData.age} ปี${job} เดินเข้ามาที่เคาน์เตอร์ร้านยา${posture}`;
}

// ── Rubric (เกณฑ์ให้คะแนนรายข้อ) ──────────────────────────────
// ชุดมาตรฐานใช้ seed เคสใหม่ / migrate เคสเดิมที่ยังไม่มี rubric
function getDefaultRubric() {
  return [
    { id: 'h1', domain: 'history',    label: 'ถามว่ายาสำหรับใคร และอายุโดยประมาณ',          weight: 2, critical: false, active: true },
    { id: 'h2', domain: 'history',    label: 'ถามอาการสำคัญ และตำแหน่ง/ลักษณะอาการ',         weight: 4, critical: false, active: true },
    { id: 'h3', domain: 'history',    label: 'ถามระยะเวลาที่มีอาการ',                        weight: 3, critical: false, active: true },
    { id: 'h4', domain: 'history',    label: 'ถามอาการร่วมอื่นๆ',                            weight: 3, critical: false, active: true },
    { id: 'h5', domain: 'history',    label: 'ถามการรักษา/ยาที่ใช้ก่อนหน้า',                 weight: 3, critical: false, active: true },
    { id: 'h6', domain: 'history',    label: 'ถามโรคประจำตัวและยาที่ใช้ประจำ',               weight: 3, critical: false, active: true },
    { id: 'h7', domain: 'history',    label: 'ถามประวัติแพ้ยา',                              weight: 6, critical: true,  active: true },
    { id: 'h8', domain: 'history',    label: 'ถามการตั้งครรภ์/ให้นมบุตร',                    weight: 6, critical: true,  active: true, femaleOnly: true },
    { id: 'd1', domain: 'diagnosis',  label: 'สรุปอาการและระบุการวินิจฉัยให้ผู้ป่วยเข้าใจ',  weight: 5, critical: false, active: true },
    { id: 'd2', domain: 'diagnosis',  label: 'ประเมิน Red flag / อาการที่ควร refer แพทย์',   weight: 5, critical: false, active: true },
    { id: 'r1', domain: 'drug',       label: 'เลือกยา first-line ถูกต้อง และ regimen ครบถ้วน', weight: 7, critical: true,  active: true },
    { id: 'r2', domain: 'drug',       label: 'อธิบายชื่อยาและสรรพคุณให้ผู้ป่วยเข้าใจ',        weight: 3, critical: false, active: true },
    { id: 'c1', domain: 'counseling', label: 'แจ้งผลข้างเคียงที่สำคัญ',                       weight: 3, critical: false, active: true },
    { id: 'c2', domain: 'counseling', label: 'ให้คำแนะนำการปฏิบัติตัว (Non-pharmacological)', weight: 3, critical: false, active: true },
    { id: 'c3', domain: 'counseling', label: 'แจ้งเมื่อไรควรกลับมาพบแพทย์/เภสัชกร',           weight: 3, critical: false, active: true },
    { id: 'c4', domain: 'counseling', label: 'เปิดโอกาสให้ผู้ป่วยซักถาม/ทวนสอบความเข้าใจ',    weight: 2, critical: false, active: true },
  ];
}

// คืน rubric ของเคส: ใช้ของเดิมถ้ามี ไม่งั้น seed + migrate (counseling เดิม, specificChecklist เดิม)
function buildRubricForCase(caseData) {
  if (Array.isArray(caseData?.rubric) && caseData.rubric.length) {
    return caseData.rubric;
  }
  const rubric = getDefaultRubric();

  // migrate counseling points เดิม → แทนหมวด counseling default
  const cPoints = (caseData?.drugAnswer?.counseling || []).filter(Boolean);
  if (cPoints.length) {
    for (let i = rubric.length - 1; i >= 0; i--) {
      if (rubric[i].domain === 'counseling') rubric.splice(i, 1);
    }
    cPoints.forEach((text, i) => {
      rubric.push({ id: `c${i + 1}`, domain: 'counseling', label: text, weight: 3, critical: false, active: true });
    });
  }

  // migrate specificChecklist เดิม → ข้อ custom หมวด diagnosis
  const spec = (caseData?.specificChecklist || '').trim();
  if (spec) {
    spec.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
      .forEach((label, i) => {
        rubric.push({ id: `s${i + 1}`, domain: 'diagnosis', label, weight: 3, critical: false, active: true, custom: true });
      });
  }
  return rubric;
}

// คำนวณคะแนนแบบ deterministic จาก rubric + ผลตัดสินรายข้อของ AI
// itemResults: [{ id, earned (0|0.5|1), note }]
// คืน { history_score, diagnosis_score, drug_score, counseling_score, overall, checklist_results }
function scoreRubric(caseData, itemResults, patientGender) {
  const rubric    = buildRubricForCase(caseData);
  const earnedMap = {};
  (itemResults || []).forEach(r => {
    let e = Number(r.earned);
    if (!(e >= 0)) e = 0;
    earnedMap[r.id] = { earned: Math.max(0, Math.min(1, e)), note: r.note || '' };
  });

  const applicable = rubric.filter(it =>
    it.active !== false && (!it.femaleOnly || patientGender === 'female')
  );

  const domainScore = {};
  DOMAIN_ORDER.forEach(dom => {
    const items = applicable.filter(it => it.domain === dom);
    const totalW = items.reduce((s, it) => s + (Number(it.weight) || 0), 0);
    if (!totalW) { domainScore[dom] = 0; return; }
    const earnedW = items.reduce((s, it) => s + (Number(it.weight) || 0) * (earnedMap[it.id]?.earned || 0), 0);
    domainScore[dom] = Math.round((earnedW / totalW) * 100);
  });

  const overall = Math.round(
    DOMAIN_ORDER.reduce((s, dom) => s + domainScore[dom] * DOMAIN_WEIGHTS[dom], 0)
  );

  const checklist_results = applicable.map((it, i) => {
    const e = earnedMap[it.id]?.earned ?? 0;
    return {
      item:   i + 1,
      id:     it.id,
      label:  it.label,
      weight: it.weight,
      done:   e >= 1,
      partial: e > 0 && e < 1,
      note:   earnedMap[it.id]?.note || (e >= 1 ? '' : (e > 0 ? 'ทำได้บางส่วน' : '')),
    };
  });

  return {
    history_score:    domainScore.history,
    diagnosis_score:  domainScore.diagnosis,
    drug_score:       domainScore.drug,
    counseling_score: domainScore.counseling,
    overall,
    checklist_results,
  };
}

function getPronoun(gender, age) {
  if (gender === 'male') {
    if (age >= 50) return { self: 'ลุง', other: 'หลาน/คุณ', end: 'นะครับ', style: 'พูดเป็นกันเอง สบายๆ อาจเรียกตัวเองว่าลุง' };
    return { self: 'ผม', other: 'คุณ', end: 'ครับ', style: 'พูดสุภาพ กึ่งทางการ ตรงไปตรงมา' };
  } else {
    if (age <= 25) return { self: 'หนู', other: 'พี่', end: 'ค่ะ', style: 'พูดสุภาพ เกรงใจ' };
    return { self: 'ฉัน', other: 'คุณ', end: 'ค่ะ', style: 'พูดสุภาพ มั่นใจ' };
  }
}

function getSpeechStyle(age) {
  if (age < 25) return 'วัยรุ่น/นักศึกษา: พูดสั้น เกรงใจ บางทีติด "อ่ะ" หรือ "นะ" ท้ายประโยค';
  if (age < 45) return 'วัยทำงาน: พูดตรง กระชับ สุภาพ บางทีรีบๆ เพราะต้องกลับไปทำงาน';
  if (age < 60) return 'วัยกลางคน: พูดช้า รอบคอบ อาจถามซ้ำถ้าไม่เข้าใจ';
  return 'ผู้สูงอายุ: พูดช้า เรียกตัวเองตามชื่อเล่นหรืออาวุโส จำชื่อยาได้ไม่ค่อยแม่น';
}

function randomizePatientData(caseData) {
  const data = { ...caseData };
  if (!data.gender || data.gender === 'random') {
    data.gender = Math.random() < 0.5 ? 'male' : 'female';
  }
  if (!data.age || data.age === 0) {
    data.age = Math.floor(Math.random() * (50 - 18 + 1)) + 18;
  }
  if (data.name === 'auto' || !data.name) {
    const maleNames   = ['สมชาย', 'วิชัย', 'ประสิทธิ์', 'นิรันดร์', 'อภิชาต', 'ธนากร', 'พงศ์พัฒน์'];
    const femaleNames = ['สมหญิง', 'วิไล', 'ประภา', 'นิภา', 'อัจฉรา', 'ธนิดา', 'พรทิพย์'];
    const pool = data.gender === 'male' ? maleNames : femaleNames;
    data.name = pool[Math.floor(Math.random() * pool.length)];
  }
  return data;
}

// ── History-taking prompt (Step 1) ───────────────────────────
function buildSystemPrompt(caseData, voiceMode = false) {
  const p     = getPronoun(caseData.gender, caseData.age);
  const style = getSpeechStyle(caseData.age);
  const tone  = toneToStyle(getCaseTone(caseData));

  const voiceOverlay = voiceMode ? `

[Voice Mode — ใช้เสียงพูดเท่านั้น]
- ตอบ 1 ประโยคเท่านั้น ยกเว้นจำเป็นจริงๆ ไม่เกิน 2 ประโยค
- ห้ามใช้ตัวเลข ข้อ หัวข้อ วงเล็บ ขีด หรือสัญลักษณ์ใดๆ ในการพูด
- พูดเป็นธรรมชาติ เหมือนคนคุยกัน ไม่ใช่อ่านรายการ
- เมื่อถูกขัดกลางประโยค → หยุดพูดทันที รอฟัง ไม่ต้องพูดต่อจากที่ค้าง
- สามารถขึ้นต้นด้วยคำสะท้อนสั้นๆ เช่น "อ่อ" "ค่ะ" "ครับ" "โอเค" ถ้าเป็นธรรมชาติ` : '';

  return `คุณคือ "${caseData.name}" อายุ ${caseData.age} ปี อาชีพ ${caseData.occupation} walk-in เข้ามาร้านขายยาชุมชน พูดกับ "เภสัชกรประจำร้าน"
เรียกตัวเองว่า "${p.self}" ลงท้ายด้วย "${p.end}" ตามธรรมชาติ — ใส่ตอนจบช่วงที่พูดเท่านั้น ไม่ต้องทุกประโยคย่อย และห้ามพูดคำลงท้ายซ้ำถี่เกินคนจริง
สไตล์: ${style} — ${p.style}
โทนอารมณ์ผู้ป่วยตอนนี้: ${tone}

${caseData.secretInfo}

กฎเหล็ก (ทำตามเคร่งครัดทุกข้อ):
1. ห้ามเปิดเผย โรคประจำตัว/แพ้ยา/ยาที่ใช้/รายละเอียดอาการเชิงลึก จนกว่าจะถูกถามตรงๆ
2. คำถามปลายเปิด ("มีอาการอะไรบ้าง" ฯลฯ) → ตอบแค่ "${caseData.chiefComplaint}" — ระยะเวลา/อาการร่วม/ยา/โรคประจำตัว/แพ้ยา ต้องถูกถามก่อนเสมอ
3. ตอบ 1-2 ประโยค สั้น กระชับ ภาษาชาวบ้าน ไม่ใช้ศัพท์แพทย์
4. ห้ามบอกชื่อยาที่ต้องการเอง
5. ถูกถามด้วยศัพท์แพทย์ที่ไม่รู้จัก → ถามกลับ: "คือยังไงหรอ${p.end}?"
6. ถามนอกบริบท: ครั้งแรกงงๆ ถามกลับ, ครั้งต่อมาหงุดหงิด, ถ้ารบกวนมากบอกจะไปร้านอื่น
7. ห้ามออกนอกบทบาทเด็ดขาด → "${p.self}ไม่เข้าใจว่าหมายความว่าอะไร${p.end}"
8. **Signal พร้อมรับยา:** เมื่อเภสัชกรถามเรื่องแพ้ยาหรือยาที่ใช้ประจำแล้ว (ไม่ว่าจะตอบว่าอะไร) → ในรอบถัดไปที่เป็นธรรมชาติ ให้ถามว่า "แล้วมียาอะไรให้${p.self}กินได้บ้าง${p.end}?" — ทำแค่ครั้งเดียว ห้ามถามซ้ำ
9. **อารมณ์ตามสถานการณ์:** ปกติพูดเรียบๆ ตรงไปตรงมาเหมือนคนมาซื้อยาทั่วไป จะแสดงความรู้สึก (เจ็บ/กังวล/เหนื่อย) เฉพาะเมื่อมีเหตุ เช่น ถูกถามว่าเป็นมากไหม หรืออาการรุนแรงจริง — ไม่บ่นหรือครางทุกครั้ง
10. **ห้ามแต่งข้อมูลเองเด็ดขาด:** ตอบได้เฉพาะข้อมูลที่ระบุไว้ข้างบนเท่านั้น ถ้าถูกถามเรื่องอาการ ประวัติ ผลตรวจ ตัวเลข หรือรายละเอียดที่ "ไม่มี" ในข้อมูลของคุณ → ตอบแนวไม่แน่ใจ/จำไม่ได้/ไม่ได้สังเกต เช่น "ไม่แน่ใจเหมือนกัน${p.end}" "จำไม่ได้${p.end}" หรือ "ไม่ได้สังเกต${p.end}" — ห้ามเดา ห้ามสร้างอาการ ค่าตรวจ หรือเหตุการณ์ใหม่ที่ไม่มีในเคสขึ้นมาเอง
11. **พูดภาษาไทยเสมอ:** ตอบเป็นภาษาไทยทุกครั้ง ไม่ว่าเภสัชกรจะพูดภาษาอะไร แม้ถูกถามเป็นภาษาอังกฤษหรือมีชื่อยา/ศัพท์ภาษาอังกฤษปนมา ก็ยังตอบเป็นภาษาไทย ห้ามสลับไปพูดภาษาอื่น${voiceOverlay}

รอในความเงียบจนกว่าเภสัชกรจะพูดก่อน ห้ามเริ่มพูดหรือทักทายเอง
เมื่อเภสัชกรทักทาย: ตอบรับสั้นๆ แล้วบอกอาการหลัก เช่น "มา${p.end} ${caseData.chiefComplaint}" — ถ้าอาการไม่รุนแรงพูดเรียบๆ ไม่ต้องเติมความรู้สึก`;
}

// ── Counseling prompt (Step 3) ────────────────────────────────
function buildCounselingPrompt(caseData, dispensedDrugs, voiceMode = false) {
  const p     = getPronoun(caseData.gender, caseData.age);
  const style = getSpeechStyle(caseData.age);
  const drugNames = dispensedDrugs.map(d => `${d.name} ${d.strength}`).join(', ');

  const voiceOverlay = voiceMode ? `
- [Voice] ตอบ 1 ประโยคต่อรอบ ถ้าถามคำถามให้ถามแค่ 1 ข้อต่อครั้ง
- [Voice] ห้ามใช้ตัวเลข หัวข้อ หรือสัญลักษณ์ใดๆ ในการพูด
- [Voice] เมื่อถูกขัดกลาง → หยุดทันที รอฟัง` : '';

  return `คุณยังเป็น "${caseData.name}" (${caseData.age} ปี) เรียกตัวเองว่า "${p.self}" ลงท้าย "${p.end}" สไตล์: ${style} (${toneToStyle(getCaseTone(caseData))})
ยาที่เพิ่งรับจากเภสัชกร: ${drugNames || 'ยังไม่ได้รับยา'}
เภสัชกรกำลังอธิบายวิธีใช้ยา ผลข้างเคียง และคำแนะนำดูแลตัวเอง

กฎ:
- ตอบสั้น ภาษาชาวบ้าน รับฟังและแสดงความเข้าใจตามสมควร
- ถามคำถามที่ผู้ป่วยจริงๆ อยากรู้ เช่น กินกับข้าวได้ไหม/ลืมกินทำยังไง/มีผลข้างเคียงไหม/ไม่ดีขึ้นทำยังไง
- ไม่ถามซ้ำสิ่งที่อธิบายชัดเจนไปแล้ว
- หากเภสัชกรให้คำแนะนำผิด/เป็นอันตราย → แสดงความสงสัย เช่น "แน่ใจนะ${p.end}? เคยได้ยินว่า..."
- **Signal จบการให้บริการ:** เมื่อเภสัชกรอธิบายครบทั้ง วิธีใช้ยา + ผลข้างเคียง + เมื่อไรควรกลับมาพบ → ตอบขอบคุณและแจ้งว่าพร้อมกลับบ้าน เช่น "โอเค เข้าใจแล้ว ขอบคุณมาก${p.end}" จากนั้นไม่ถามเพิ่มอีก
- ห้ามออกนอกบทบาท และห้ามแต่งข้อมูลใหม่ที่ไม่มีในบทบาท — ถ้าถูกถามเรื่องที่ไม่รู้/ไม่มีในข้อมูล ตอบว่าไม่แน่ใจหรือจำไม่ได้${voiceOverlay}`;
}

// ── Evaluation prompt (Step 4) ────────────────────────────────
// AI ตัดสินแค่ earned ต่อข้อ (0|0.5|1) — JS คำนวณคะแนนเองผ่าน scoreRubric()
function buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory) {
  const isFemale = caseData.gender === 'female';

  // rubric เฉพาะเคสนี้ (กรองข้อ active + femaleOnly ตามเพศจริง)
  const rubric = buildRubricForCase(caseData).filter(it =>
    it.active !== false && (!it.femaleOnly || isFemale)
  );

  const checklistText = DOMAIN_ORDER.map(dom => {
    const items = rubric.filter(it => it.domain === dom);
    if (!items.length) return '';
    const head = `[${DOMAIN_LABELS[dom]} | น้ำหนัก domain ${Math.round(DOMAIN_WEIGHTS[dom] * 100)}%]`;
    const lines = items.map(it =>
      `- (${it.id}) ${it.label} [น้ำหนักข้อ ${it.weight}${it.critical ? ', CRITICAL' : ''}]`
    ).join('\n');
    return `${head}\n${lines}`;
  }).filter(Boolean).join('\n\n');

  // Format drug answer
  const da = caseData.drugAnswer || {};
  const isSimple = Array.isArray(da.firstLine) && da.firstLine.length > 0
    && typeof da.firstLine[0] === 'string';

  let firstLineText, altText;
  if (isSimple) {
    firstLineText = (da.firstLine || []).map(id => {
      const reg = da.regimen?.[id] || '';
      return `${id}${reg ? ' — ' + reg : ''} (100%)`;
    }).join('; ');
    altText = (da.alternatives || []).map(id => {
      const reg = da.regimen?.[id] || '';
      return `${id}${reg ? ' — ' + reg : ''}`;
    }).join('; ');
  } else {
    firstLineText = (da.firstLine || []).map(opt =>
      `${(opt.drugs || []).join('+')} — ${JSON.stringify(opt.regimen || {})} (100%)`
    ).join('; ');
    altText = (da.alternatives || []).map(opt =>
      `${(opt.drugs || []).join('+')} (${opt.scorePercent ?? '?'}%) — ${opt.note || ''}`
    ).join('; ');
  }
  const counselingPoints = (da.counseling || []).join(' | ');
  const drugSummary = `First-line: ${firstLineText}\nAlternatives (ลดคะแนน): ${altText || 'ไม่มี'}\nUnacceptable: ${(da.unacceptable || []).join(', ') || 'ไม่มี'}\nCounseling points ที่ต้องบอก: ${counselingPoints}`;

  const dispensedText = dispensedDrugs.length
    ? dispensedDrugs.map(d => `${d.name} ${d.strength} (${d.form})`).join(', ')
    : 'ไม่ได้จ่ายยา';

  const chatText = chatHistory.map(m =>
    `[${m.role === 'user' ? 'เภสัชกร' : 'ผู้ป่วย'}]: ${m.text}`
  ).join('\n');

  const counselingText = counselingHistory.length
    ? counselingHistory.map(m =>
        `[${m.role === 'user' ? 'เภสัชกร' : 'ผู้ป่วย'}]: ${m.text}`
      ).join('\n')
    : '(ไม่มีการให้คำแนะนำ)';

  return `คุณคือ "อาจารย์เภสัชกรผู้ประเมิน OSPE" ประเมินนักศึกษาเภสัชศาสตร์จาก transcript การให้บริการที่ร้านขายยาชุมชน

<Case_Info>
ผู้ป่วย: ${caseData.name} อายุ ${caseData.age} ปี เพศ${isFemale ? 'หญิง' : 'ชาย'}
อาการหลัก: ${caseData.chiefComplaint}
การวินิจฉัยที่ถูกต้อง: ${caseData.diagnosisAnswer}
${drugSummary}
</Case_Info>

<Checklist>
${checklistText}
</Checklist>

<Dispensed_Drugs>
${dispensedText}
</Dispensed_Drugs>

<History_Transcript>
${chatText}
</History_Transcript>

<Counseling_Transcript>
${counselingText}
</Counseling_Transcript>

วิธีประเมิน (สำคัญมาก):
- หน้าที่ของคุณคือ "ตัดสินรายข้อ" เท่านั้น — **ห้ามคิดคะแนนรวมเอง** ระบบจะคำนวณคะแนนจากน้ำหนักให้เอง
- แต่ละข้อใน <Checklist> ให้ค่า "earned":
    1   = นักศึกษาทำครบถ้วน/ถูกต้อง
    0.5 = ทำได้บางส่วน หรือถามแต่ไม่ครบ/ไม่ชัด
    0   = ไม่ได้ทำ หรือทำผิด
- ข้อ CRITICAL ที่เกี่ยวกับความปลอดภัย (แพ้ยา/ตั้งครรภ์) ถ้าไม่ถาม → earned = 0 เสมอ
- ข้อเลือกยา: จ่าย first-line ถูก+regimen ครบ = 1, จ่าย alternative หรือ regimen ไม่ครบ = 0.5, จ่าย unacceptable หรือไม่จ่าย = 0
- อ้างอิงหลักฐานจาก transcript เสมอ ก่อนสรุป earned ให้เขียนวิเคราะห์ทีละหมวดใน "reasoning"

ตอบเป็น JSON เท่านั้น ห้ามใส่ backtick หรือ markdown ใช้ "id" ตรงตามวงเล็บใน <Checklist>:
{
  "reasoning": "วิเคราะห์ทีละหมวด อ้างหลักฐานจาก transcript: ซักประวัติ ... | ประเมิน/red flag ... | เลือกยา ... | counseling ...",
  "items": [{"id": "h1", "earned": 1, "note": "หมายเหตุ/หลักฐานสั้นๆ"}],
  "history_feedback": "feedback การซักประวัติ",
  "history_missed": ["ประเด็นที่ยังไม่ได้ถาม"],
  "diagnosis_feedback": "ระบุโรคและอธิบายได้ถูกต้องไหม",
  "drug_feedback": "เลือกยาถูกไหม regimen ถูกต้องไหม",
  "counseling_feedback": "ให้คำแนะนำครบไหม",
  "counseling_missed": ["counseling point ที่ขาดไป"],
  "summary": "สรุปภาพรวม 2-3 ประโยค จุดเด่นและจุดที่ต้องพัฒนา"
}

หมายเหตุ: ต้องมี "items" ครบทุก id ที่อยู่ใน <Checklist> ห้ามข้าม`;
}
