// ============================================================
//  prompts.js — v5
//  buildSystemPrompt, buildEvalPrompt, buildCounselingPrompt
// ============================================================

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
9. **อารมณ์ตามสถานการณ์:** ปกติพูดเรียบๆ ตรงไปตรงมาเหมือนคนมาซื้อยาทั่วไป จะแสดงความรู้สึก (เจ็บ/กังวล/เหนื่อย) เฉพาะเมื่อมีเหตุ เช่น ถูกถามว่าเป็นมากไหม หรืออาการรุนแรงจริง — ไม่บ่นหรือครางทุกครั้ง${voiceOverlay}

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

  return `คุณยังเป็น "${caseData.name}" (${caseData.age} ปี) เรียกตัวเองว่า "${p.self}" ลงท้าย "${p.end}" สไตล์: ${style}
ยาที่เพิ่งรับจากเภสัชกร: ${drugNames || 'ยังไม่ได้รับยา'}
เภสัชกรกำลังอธิบายวิธีใช้ยา ผลข้างเคียง และคำแนะนำดูแลตัวเอง

กฎ:
- ตอบสั้น ภาษาชาวบ้าน รับฟังและแสดงความเข้าใจตามสมควร
- ถามคำถามที่ผู้ป่วยจริงๆ อยากรู้ เช่น กินกับข้าวได้ไหม/ลืมกินทำยังไง/มีผลข้างเคียงไหม/ไม่ดีขึ้นทำยังไง
- ไม่ถามซ้ำสิ่งที่อธิบายชัดเจนไปแล้ว
- หากเภสัชกรให้คำแนะนำผิด/เป็นอันตราย → แสดงความสงสัย เช่น "แน่ใจนะ${p.end}? เคยได้ยินว่า..."
- **Signal จบการให้บริการ:** เมื่อเภสัชกรอธิบายครบทั้ง วิธีใช้ยา + ผลข้างเคียง + เมื่อไรควรกลับมาพบ → ตอบขอบคุณและแจ้งว่าพร้อมกลับบ้าน เช่น "โอเค เข้าใจแล้ว ขอบคุณมาก${p.end}" จากนั้นไม่ถามเพิ่มอีก
- ห้ามออกนอกบทบาท${voiceOverlay}`;
}

// ── Evaluation prompt (Step 4) ────────────────────────────────
function buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory) {
  const isFemale = caseData.gender === 'female';

  const standardChecklist = [
    '[หมวด 1: WWHAM — ซักประวัติ (30 คะแนน)]',
    '1. ถามว่ายาสำหรับตัวผู้ป่วยเองหรือผู้อื่น และอายุโดยประมาณ (ไม่จำเป็นต้องถามชื่อ)',
    '2. ถามอาการสำคัญ (Chief complaint) และตำแหน่ง/ลักษณะ',
    '3. ถามระยะเวลาที่มีอาการ',
    '4. ถามอาการร่วมอื่นๆ',
    '5. ถามการรักษาหรือยาที่ใช้ก่อนหน้า (Action taken)',
    '6. ถามโรคประจำตัวและยาที่ใช้ประจำ',
    '7. ถามประวัติแพ้ยา [CRITICAL — หักมาก]',
    isFemale ? '8. ถามการตั้งครรภ์หรือให้นมบุตร [CRITICAL — หักมาก]' : '8. (ข้ามได้สำหรับผู้ป่วยชาย)',
    '',
    '[หมวด 2: การประเมินและ Red Flag (20 คะแนน)]',
    '9. สรุปอาการและระบุการวินิจฉัยให้ผู้ป่วยเข้าใจ',
    '10. ประเมิน Red flag หรืออาการที่ควร refer แพทย์ (เช่น ไข้สูง/อาการรุนแรง/ไม่ดีขึ้นใน 3 วัน)',
    '',
    '[หมวด 3: การจ่ายยาและให้คำแนะนำ (50 คะแนน)]',
    '11. อธิบายชื่อยา สรรพคุณ และวิธีใช้อย่างถูกต้องและครบถ้วน',
    '12. แจ้งผลข้างเคียงที่สำคัญ',
    '13. ให้คำแนะนำการปฏิบัติตัว (Non-pharmacological)',
    '14. แจ้งเมื่อไรควรกลับมาพบแพทย์/เภสัชกร',
    '15. เปิดโอกาสให้ผู้ป่วยซักถามหรือทวนสอบความเข้าใจ',
  ].join('\n');

  const hasSpecific = caseData.specificChecklist && caseData.specificChecklist.trim();
  const specificSection = hasSpecific
    ? '[หมวด 4: เกณฑ์เฉพาะโรค]\n' + caseData.specificChecklist.trim()
    : '(ไม่มีเกณฑ์เฉพาะโรค)';

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
${standardChecklist}

${specificSection}
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

เกณฑ์การให้คะแนน:
- history_score (0-100): หมวด 1 ครบ = 100, ขาด [CRITICAL] หักข้อละ 20, ขาดข้ออื่น หักข้อละ 10
- diagnosis_score (0-100): ระบุโรคได้ถูกและอธิบายผู้ป่วยเข้าใจ = 100
- drug_score (0-100): first-line ครบ+regimen ถูก = 100, alternative = ตาม scorePercent, unacceptable หรือไม่ได้จ่าย = 0, ขาด counseling point สำคัญ หักข้อละ 10
- counseling_score (0-100): ครบทุก point ใน checklist หมวด 3 = 100
- overall (0-100): (history_score×0.25 + diagnosis_score×0.15 + drug_score×0.40 + counseling_score×0.20) ปัดเป็นจำนวนเต็ม

ตอบเป็น JSON เท่านั้น ห้ามใส่ backtick หรือ markdown:
{
  "checklist_results": [{"item": 1, "label": "ชื่อข้อ", "done": true, "note": "หมายเหตุถ้ามี"}],
  "history_score": 0,
  "history_feedback": "feedback การซักประวัติ",
  "history_missed": ["ประเด็นที่ยังไม่ได้ถาม"],
  "diagnosis_score": 0,
  "diagnosis_feedback": "ระบุโรคและอธิบายได้ถูกต้องไหม",
  "drug_score": 0,
  "drug_feedback": "เลือกยาถูกไหม regimen ถูกต้องไหม counseling ครบไหม",
  "counseling_score": 0,
  "counseling_feedback": "ให้คำแนะนำครบไหม",
  "counseling_missed": ["counseling point ที่ขาดไป"],
  "overall": 0,
  "summary": "สรุปภาพรวม 2-3 ประโยค จุดเด่นและจุดที่ต้องพัฒนา"
}`;
}
