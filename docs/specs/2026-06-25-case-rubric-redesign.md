# Spec — ปรับหน้าเพิ่มเคส + ระบบคะแนนรายข้อ (Rubric)

วันที่: 2026-06-25
สถานะ: อนุมัติ design แล้ว — กำลัง implement

## เป้าหมาย
ทำให้แต่ละเคสกำหนด **น้ำหนักคะแนนรายข้อ** ได้เอง, คำแนะนำเป็นข้อๆ มีน้ำหนัก, เพิ่มช่อง "ลักษณะอาการ",
แทน free-text บางช่องด้วยตัวเลือกสำเร็จรูป, และแก้ bug ช่องเลือกยาจอดำ — โดย**คงตัวแปรวิจัยเดิม** (history/diagnosis/drug/counseling score) ไว้ครบ

## โมเดลคะแนนใหม่
- เคสมี field ใหม่ `rubric`: `[{ id, domain, label, weight, critical, femaleOnly?, active }]`
  - `domain` ∈ `history | diagnosis | drug | counseling`
- AI (eval) **ตัดสินแค่** earned ต่อข้อ ∈ {0, 0.5, 1} + note/feedback/reasoning — **ไม่คิดเลขคะแนนเอง**
- **JS คำนวณ** (deterministic):
  - `domain_score = (Σ weight×earned ในหมวด ÷ Σ weight ในหมวด) × 100`
  - `overall = history×0.25 + diagnosis×0.15 + drug×0.40 + counseling×0.20`
  - ข้อ `femaleOnly` ที่ผู้ป่วยเป็นชาย → ตัดออกจากการคำนวณ (re-normalize อัตโนมัติ)
  - ข้อ `active=false` → ไม่นับ
- น้ำหนัก domain (25/15/40/20) คงที่ใน code (แก้ทีหลังได้ภายหลัง)

## Default rubric (seed เคสใหม่ / migrate เคสเดิม)
- **history**: ถามใคร+อายุ(2) · อาการสำคัญ+ตำแหน่ง/ลักษณะ(4) · ระยะเวลา(3) · อาการร่วม(3) · การรักษาก่อนหน้า(3) · โรคประจำตัว+ยาประจำ(3) · แพ้ยา(6,critical) · ตั้งครรภ์/ให้นม(6,critical,femaleOnly)
- **diagnosis**: สรุป+ระบุวินิจฉัย(5) · ประเมิน red flag/refer(5)
- **drug**: first-line ถูก+regimen ครบ(7,critical) · อธิบายชื่อยา/สรรพคุณ(3)
- **counseling**: seed จาก counseling points ของเคส (ข้อละ 3); ถ้าไม่มี → ผลข้างเคียง(3)·ปฏิบัติตัว(3)·เมื่อไรกลับมาพบแพทย์(3)·เปิดให้ซักถาม(2)

## ฟิลด์โพยลับที่ปรับ (`secretInfoFields`)
- `personality` (free-text) → `tone` (enum): `neutral`(default) `anxious` `hurried` `tired` `irritable`
  - ป้อนเข้า patient prompt + ใช้กำหนดโทนเสียง/ delivery ของ Gemini Live
- เพิ่ม `symptomCharacter` (ลักษณะอาการ): เช่น แสบ/ปวดตุบๆ/แน่น/คัน — แยกจาก mainSymptoms
- ตัดช่อง `sceneDesc` ออกจากฟอร์ม → `buildSceneDesc(caseData)` สร้างฉากเปิดอัตโนมัติจาก เพศ/อายุ/อาชีพ/อาการหลัก

## UI ฟอร์มเพิ่มเคส
- Rubric editor: จัดกลุ่มตาม domain, แต่ละข้อมี label + ช่อง weight (number) + toggle active + ปุ่มลบ (เฉพาะ custom)
- ปุ่ม "เพิ่มข้อ" ต่อ domain (แทน specificChecklist free-text)
- ปุ่ม "รีเซ็ตเป็นค่า default" ต่อ domain
- แสดงผลรวมน้ำหนักต่อ domain แบบ live
- หมวด counseling: แต่ละข้อ = {text, weight}
- แก้ bug จอดำ: `--surface` → ใช้ `--bg2`/`--glass-bg` ที่มีจริงใน `:root`

## Backward compatibility
- เคสเดิมไม่มี `rubric` → `buildRubricForCase()` seed default + ดึง `drugAnswer.counseling` เดิมมาเป็นข้อ counseling
- เคสเดิมมี `personality` (string) → map เข้า `tone` ถ้าจับคู่ได้ ไม่งั้น neutral
- `specificChecklist` เดิม → แปลงเป็นข้อ custom (กระจายตามคีย์เวิร์ด/ใส่หมวด diagnosis เป็นค่าเริ่มต้น) หรือคงไว้แสดงเฉยๆ

## ไฟล์ที่แตะ
- `js/prompts.js`: `getDefaultRubric`, `buildRubricForCase`, `scoreRubric`, `buildSceneDesc`, `toneToVoiceStyle`; แก้ `buildEvalPrompt`, `buildSystemPrompt`
- `js/screens/admin.js`: ฟอร์มเคส (tone, symptomCharacter, ตัด sceneDesc, rubric editor, counseling weighted, drug bug, live totals, reset), load/save/migrate
- `js/screens/chat.js`: ใช้ `buildSceneDesc` แทน sceneDesc; `_runEval` คำนวณคะแนนผ่าน `scoreRubric` ก่อน save
- `js/gemini-tts.js` / `gemini-live` (ถ้าจำเป็น): delivery ตาม tone — minimal

## ความเข้ากันได้ของหน้าผล (summary.js)
- ไม่ต้องแก้: ยังรับ `checklist_results` + `history_score`/.../`overall` เหมือนเดิม
- `scoreRubric` ประกอบ `checklist_results` (label จาก rubric, done จาก earned) ให้ครบ
