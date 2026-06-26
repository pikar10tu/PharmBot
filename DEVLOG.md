# PharmBot v2 — Development Log (บันทึกการพัฒนา)

> บันทึกความคืบหน้าการพัฒนาเป็นช่วงๆ สำหรับใช้อ้างอิงในรายงาน/วิทยานิพนธ์
> รูปแบบ: ใหม่สุดอยู่บนสุด · แต่ละรอบระบุ วันที่ / สิ่งที่ทำ / เหตุผล / ไฟล์ที่แตะ / สถานะ

---

## 2026-06-26 (รอบ 8) — revert `languageCodes` ออกจาก Live setup (แก้ voice พังสนิท)

**ปัญหา:** ทีมเทสโหมดเสียงจริงวันนี้ → ต่อ Gemini Live ไม่ติดเลย WS ปิดทันทีด้วย `code=1007` พร้อม reason: `Invalid JSON payload received. Unknown name "languageCodes" at 'setup.input_audio_transcription': Cannot find field.` → setup timeout 20s → หล่นไป Web Speech ทุกครั้ง

**ต้นเหตุ:** การแก้รอบ 6 (commit `0e0eb0f`) เดาว่า `languageCodes` จะถูกเพิกเฉย (no-op) บน public API — **เดาผิด** จริงๆ คือ `AudioTranscriptionConfig` บน public Live API (`generativelanguage.googleapis.com` v1beta) **ไม่มี field นี้เลย** (มีเฉพาะฝั่ง Vertex) field แปลกปลอมทำให้ setup JSON ทั้งก้อน invalid → server ฆ่า connection

**สิ่งที่ทำ:** เปลี่ยน `inputAudioTranscription`/`outputAudioTranscription` กลับเป็น object ว่าง `{}` (ค่าที่ public API ต้องการเพื่อ "เปิด" transcription) — transcript ยังทำงาน Step 4 eval ยังได้ข้อความเหมือนเดิม + bump cache-bust `gemini-live.js?v=20→21` ใน `index.html`

**ยืนยันกับเอกสารทางการ:** ตรวจกับ skill `gemini-live-api-dev` (Google official) — ตัวอย่างใช้ `AudioTranscriptionConfig()` (object ว่าง ไม่มี argument) ตรงกับที่แก้; และระบุว่า native audio model "ตรวจจับ/สลับภาษาอัตโนมัติ" → **ไม่มีวิธี pin ภาษา STT บน public API** (การ pin ภาษามีเฉพาะ use case แปลภาษาด้วย `translationConfig` + คนละโมเดล) สรุปคือ `languageCodes` ไม่เคยช่วยอะไรตั้งแต่แรก

**ไฟล์ที่แตะ:** `js/gemini-live.js`, `index.html`

**ทดสอบ:** node --check ผ่าน — รอทีม verify เสียงจริง (เป้าหมาย: console ขึ้น `setupComplete` / state `ready` แทน close 1007)

**สถานะ:** ⏳ push ขึ้น main แล้ว รอผลทดสอบจากทีม

---

## 2026-06-25 (รอบ 7) — แก้พฤติกรรม AI ผู้ป่วย 3 จุด (จาก feedback ทีม)

**ที่มา:** ทีมทดลองใช้แล้วบ่น 3 เรื่อง — (1) อยากให้ผู้ป่วยถามวิธีใช้ยา (กินยังไง/กี่วัน) ตอน counseling, (2) ผู้ป่วยตอบไม่ตรงคำถาม (ถาม "เป็นเองไหม" ตอบ "เป็นมา 3 วัน"), (3) ผู้ป่วยทวงยาซ้ำๆ ทั้งที่เภสัชยังถามไม่จบ

**สิ่งที่ทำ (แก้ที่ต้นเหตุ = prompt design ทั้งหมด ใน `js/prompts.js` ไฟล์เดียว):**
1. **กฎข้อ 8 เขียนใหม่** — จาก "Signal พร้อมรับยา" (ให้ผู้ป่วยทวงถามมียาอะไรให้กิน) → "ให้เภสัชกรเป็นผู้นำ" ห้ามทวงขอยา/เร่งเอง รอเภสัชนำ ความรีบให้มาจาก tone='hurried' ของเคสเท่านั้น (แก้ปัญหา 3)
2. **เพิ่มกฎข้อ 9 ใหม่** — "ตอบให้ตรงคำถาม ไม่เข้าใจให้ถามกลับ ห้ามเดาตอบคนละเรื่อง" + ไล่เลขกฎเดิม 9→10, 10→11, 11→12 (แก้ปัญหา 2)
3. **`buildCounselingPrompt`** — เพิ่มตัวอย่างคำถามวิธีกินยา (กินยังไง/วันละกี่ครั้ง/กี่วัน/ก่อน-หลังอาหาร) + กฎ "ถ้าเภสัชยังไม่บอกวิธีกิน ให้ถามก่อนจบ" (แก้ปัญหา 1)

**เหตุผล:** ทั้ง 3 เป็นพฤติกรรมที่คุมด้วย prompt ล้วน แก้ต้นเหตุได้ในไฟล์เดียว ไม่ต้อง band-aid ใน chat.js; ยืนยันว่าการเลื่อน step มาจากปุ่มเภสัช (`_goStep2` ฯลฯ) ไม่ได้ดักประโยคผู้ป่วย → ลบบทพูดทวงยาได้ปลอดภัย

**ไฟล์ที่แตะ:** `js/prompts.js`, `docs/specs/2026-06-25-patient-behavior-fixes.md` (ใหม่)

**ทดสอบ:** `node --check js/prompts.js` ผ่าน — **ยังไม่ได้ทดสอบพฤติกรรมจริงในเบราว์เซอร์** (ทีมจะเช็คพรุ่งนี้)

**หมายเหตุ:** ปัญหา 2 (ตอบไม่ตรง) prompt ช่วยได้มากแต่อาจไม่หาย 100% เพราะส่วนหนึ่งเป็นข้อจำกัดโมเดล — lever ถัดไปคืออัป model (Phase 4) รอผลทีมก่อน

**สถานะ:** ⏳ โค้ดเสร็จ + node --check ผ่าน — ยังไม่ commit/push รอทีม verify

---

## 2026-06-25 (รอบ 6) — ล็อกภาษา transcript เป็นไทย (รอ verify)

**ปัญหา:** ตอนพูดในโหมดเสียง `inputAudioTranscription` ของ Gemini Live บางครั้ง auto-detect ภาษาผิด → transcript ขึ้นเป็นภาษาอื่น (กฎข้อ 11 ใน prompt คุมแค่ output ของผู้ป่วย ไม่ใช่ STT ฝั่ง input)

**สิ่งที่ทำ:** เพิ่ม `languageCodes: ['th-TH']` ใน `inputAudioTranscription` + `outputAudioTranscription` (`gemini-live.js`) เพื่อบังคับภาษาถอดเสียงเป็นไทย

**ข้อควรรู้:** param นี้ documented ฝั่ง Vertex AI แต่ public API (`generativelanguage.googleapis.com`) ที่แอปใช้ ไม่ระบุในเอกสาร → อาจถูกเพิกเฉย (no-op) ถ้าไม่หาย แผนถัดไปคือเอา Web Speech (th-TH) มาเป็น transcript หลักฝั่งเภสัชกร

**ไฟล์ที่แตะ:** `js/gemini-live.js`

**ทดสอบ:** node --check ผ่าน — **ยังไม่ได้ verify บนเครื่องจริง** (ต้องลองเสียงจริง: เขียว=ไทยแม่นขึ้น / เหลือง=ยังเพี้ยน(no-op) / แดง=setup reject แล้วหล่น Web Speech)

**สถานะ:** ⏳ push ขึ้น main แล้ว รอผลทดสอบจากผู้ใช้

---

## 2026-06-25 (รอบ 5) — จัดกลุ่มยาตามข้อบ่งใช้ + ลด voice path ให้เหลือ Live ล้วน

**สิ่งที่ทำ**
1. **รายการยาในหน้าเพิ่มเคส จัดกลุ่มตาม "ข้อบ่งใช้"** — ข้อบ่งใช้เป็นหัวข้อใหญ่ (ตั้งชื่อ/เพิ่ม/ลบได้) แต่ละข้อบ่งใช้มีรายการยา + ช่องค้นยาของตัวเอง คงตัวเลือก first-line/alternative/ห้ามจ่าย + regimen ที่ตัวยา (`drugAnswer.indications`); ยัง derive flat `firstLine/alternatives/unacceptable/regimen` ให้ eval ใช้เหมือนเดิม เคสเดิมโหลดเป็นข้อบ่งใช้เดียวอัตโนมัติ (commit `583773e`)
2. **ลด voice path ให้เหลือ transcript เดียว** — ลบ Web Speech recognizer (`_displayRecog`) ที่รันซ้อนกับ Gemini Live ออก ใช้ `inputTranscription`/`outputTranscription` ของ Gemini Live เป็นแหล่งเดียวสำหรับทั้งแสดงผลและ eval; คง Web Speech ไว้เฉพาะ fallback mode ตอน Live เชื่อมต่อไม่ได้

**เหตุผล:** (1) ผู้สอนจัดยาตามข้อบ่งใช้ได้ตรงเวชปฏิบัติ (2) ตัดความซ้ำซ้อนของ STT 2 ตัวที่ฟังไมค์เดียวกัน → โค้ด voice เข้าใจง่ายขึ้น และ transcript ที่เข้า eval มาจากแหล่งเดียวที่ AI เข้าใจบริบทจริง

**ไฟล์ที่แตะ:** `js/screens/admin.js` (รอบก่อน, pushed), `js/screens/chat.js`

**ทดสอบ:** node --check ผ่าน + drug picker round-trip 16/16 + Playwright ไม่มี hard regression ใหม่ (fail 2 ตัวเดิมที่เป็น known-failing) — ยังไม่ได้ทดสอบโหมดเสียงจริงในเบราว์เซอร์

**สถานะ:** ✅ เสร็จ + push ขึ้น main

**งานถัดไปที่แนะนำ:** ทดสอบโหมดเสียงจริง 1 เคส (Live transcript เข้า chat + eval ครบ) และฟอร์มข้อบ่งใช้ในเบราว์เซอร์

---

## 2026-06-25 (รอบ 4) — Rubric รายข้อ + ปรับหน้าเพิ่มเคส

**เป้าหมายรอบนี้:** ให้แต่ละเคสกำหนดน้ำหนักคะแนนรายข้อได้เอง, คำแนะนำเป็นข้อๆ มีน้ำหนัก, ลดช่อง free-text, แก้ bug หน้าเพิ่มเคส

**สิ่งที่ทำ**
1. **ระบบคะแนนรายข้อ (Rubric)** — เคสมี field `rubric` = ข้อประเมินที่กำหนดน้ำหนักได้ จัดกลุ่มเป็น 4 domain เดิม (history/diagnosis/drug/counseling) คงตัวแปรวิจัยเดิมครบ
2. **AI ไม่คิดคะแนนเอง** — eval prompt ให้ AI ตัดสินแค่ earned รายข้อ (0/0.5/1) แล้ว `scoreRubric()` ใน JS คำนวณคะแนน domain + overall แบบ deterministic (น้ำหนักถูกเคารพ 100%)
3. **หน้าเพิ่มเคส** — เพิ่ม Rubric editor (แก้น้ำหนัก/เพิ่ม-ลบข้อ/รีเซ็ตค่าเริ่มต้น/รวมแต้ม live), counseling เป็นข้อๆ มีน้ำหนัก, เพิ่มช่อง "ลักษณะอาการ"
4. **ตัด free-text** — `personality` → dropdown โทนอารมณ์ (5 ระดับ, ป้อนเข้า patient prompt + โทนเสียง Live); ตัด `sceneDesc` → `buildSceneDesc()` สร้างฉากเปิดอัตโนมัติ; `specificChecklist` → ข้อ custom ใน rubric
5. **แก้ bug จอดำ** — dropdown ค้นยาใช้ตัวแปร `--surface` ที่ไม่มีใน `:root` → เปลี่ยนเป็น `--bg2`/`--text` ที่มีจริง
6. **Backward compatible** — เคสเดิมไม่มี rubric → `buildRubricForCase()` seed default + migrate counseling/specificChecklist เดิมอัตโนมัติ

**เหตุผล:** ให้ผู้สอนคุมน้ำหนักการประเมินต่อเคสได้ละเอียด และทำให้คะแนนเสถียร/ตรวจสอบได้สำหรับงานวิจัย (ไม่พึ่ง AI คำนวณเลข)

**ไฟล์ที่แตะ:** `js/prompts.js`, `js/screens/chat.js`, `js/screens/admin.js`, `docs/specs/2026-06-25-case-rubric-redesign.md` (ใหม่)

**ทดสอบ:** syntax check ผ่านทั้ง 3 ไฟล์ + unit test logic คะแนน 14/14 (คำนวณถูก, migrate, ตัด pregnancy เมื่อผู้ป่วยชาย, eval prompt ไม่ leak) — **ยังไม่ได้ทดสอบฟอร์มจริงในเบราว์เซอร์**

**สถานะ:** ✅ โค้ดเสร็จ + push ขึ้น main

**งานถัดไปที่แนะนำ:** ทดสอบฟอร์ม admin จริง (rubric editor + บันทึก/โหลด); ถ้าจะใส่ rubric ตั้งต้นในไฟล์ `seed-cases.js` ค่อยทำภายหลัง (ตอนนี้ทำงานได้ผ่าน migration)

---

## 2026-06-25 (รอบ 3) — ปรับ temperature

**สิ่งที่ทำ:** ลด temperature เพื่อความเที่ยง/มาตรฐาน — ผู้ประเมิน `0.2 → 0` (คะแนน reproducible), ผู้ป่วย `0.8 → 0.6` ทั้งโหมดข้อความ (`gemini.js` geminiChat) และเสียง (`gemini-live.js` เพิ่ม temperature ใน generationConfig)

**เหตุผล:** ผู้ประเมินต้องคงที่สูงสุด; ผู้ป่วยลดแบบปานกลางให้สม่ำเสมอขึ้น (มาตรฐานต่อผู้เข้าร่วม) แต่ยังเป็นธรรมชาติ ไม่ลงต่ำจนพูดแข็ง

**ไฟล์ที่แตะ:** `js/gemini.js`, `js/gemini-live.js` + อัปเดต `System_Prompting_Config_Rationale.docx`, `CLAUDE_CODE_HANDOFF.md`

**สถานะ:** ✅ เสร็จ (gemini.js ผ่าน node --check; gemini-live.js ตรวจฝั่งจริงครบถ้วน) — รวมใน commit ของ handoff

---

## 2026-06-25 (รอบ 2) — เลือกและปรับใช้ชุด prompt/config + ปักภาษาไทย

**เป้าหมายรอบนี้:** ตัดสินใจเลือกชุด prompt/config ที่ดีที่สุด ณ ปัจจุบัน เพื่อเดินหน้าทำ validation กับผู้เชี่ยวชาญ (เลื่อนการทดสอบ A/B เป็นการศึกษาอนาคต)

**สิ่งที่ทำ**
1. **ปักภาษาไทยใน prompt ผู้ป่วย** — เพิ่มกฎข้อ 11 ใน `buildSystemPrompt` ให้ตอบภาษาไทยเสมอ แม้เภสัชกรพูดอังกฤษ/ชื่อยาอังกฤษ (กัน native audio สลับภาษา)
2. **ตั้ง thinkingLevel = minimal ชัดเจน** — เพิ่ม `thinkingConfig` ใน `gemini-live.js` setup (เดิม default อยู่แล้ว แต่ระบุให้ชัด)
3. **คงค่า config อื่นตามเดิม** — VAD LOW/300, voice ตามเพศเคส, temperature ผู้ป่วย 0.8 / ผู้ประเมิน 0.2

**เหตุผล:** เปลี่ยนจากของเดิมจุดเดียว (ปักภาษา) ที่เป็นการแก้ชัดเจน-เสี่ยงต่ำ ส่วน config ใช้ค่าที่ระบบทำงานดีอยู่แล้ว → เริ่มเก็บข้อมูล/validation ได้ทันที

**ไฟล์ที่แตะ:** `js/prompts.js`, `js/gemini-live.js`, `CLAUDE_CODE_HANDOFF.md` (ใหม่), เอกสารประกอบ (System_Prompting_Config_Rationale.docx, Prompt_Config_Selection.html, Voice_Prompt_Tuning_Playbook.html)

**ทดสอบ:** ทั้งสองไฟล์ผ่าน `node --check`

**สถานะ:** ✅ เสร็จ — ส่งต่อ Claude Code review + test + commit ตาม `CLAUDE_CODE_HANDOFF.md`

---

## 2026-06-25 — ยกระดับคุณภาพ AI (Prompt quality + Model separation)

**เป้าหมายรอบนี้:** เพิ่มความน่าเชื่อถือของผู้ป่วยจำลองและการให้คะแนน เพื่อรองรับความถูกต้องของงานวิจัย

**สิ่งที่ทำ**
1. **กันผู้ป่วยจำลองแต่งข้อมูลเอง** — เพิ่มกฎใน prompt (Step 1 และ Step 3) ให้ AI ตอบ "ไม่แน่ใจ/จำไม่ได้/ไม่ได้สังเกต" เมื่อถูกถามเรื่องที่ไม่มีในเคส แทนการสุ่มสร้างอาการใหม่
2. **ให้ AI ผู้ประเมินคิดก่อนให้คะแนน** — เพิ่ม field `reasoning` ใน eval JSON ให้วิเคราะห์ทีละหมวดโดยอ้างหลักฐานจาก transcript ก่อนสรุปคะแนน
3. **ปรับ checklist ให้ตรงน้ำหนักคะแนน** — จาก 30/20/50 เป็น 4 หมวดจับคู่ 1:1 กับ domain น้ำหนัก 25/15/40/20 (เกณฑ์เฉพาะโรคเลื่อนเป็นหมวด 5)
4. **Phase 4 — แยก eval model ออกจาก patient model** — เพิ่ม `_evalModel` + `getEvalModel()` ใน `gemini.js`, ขั้นตอนประเมินใช้ model แยก + เปิด reasoning/thinking, รองรับ config เดิมแบบ backward-compatible
5. **สคริปต์อัพเดต model** — `setup/update-models.js` พร้อมรัน (patient=gemini-2.0-flash, eval=gemini-2.5-flash)

**เหตุผล:** ลดความแปรปรวนของข้อมูลผู้ป่วยและคะแนนระหว่างรอบ → เพิ่มความเที่ยงของเครื่องมือวัด; แยก model ให้ผู้ประเมินใช้ตัวที่ reasoning แม่นขึ้น

**ไฟล์ที่แตะ:** `js/prompts.js`, `js/gemini.js`, `setup/update-models.js` (ใหม่), `PROGRESS_REPORT.html` (ใหม่)

**ทดสอบ:** syntax check ผ่าน + functional test ผ่าน (กฎใหม่มีครบ, eval มี reasoning + น้ำหนักถูก, model fallback ทำงานและไม่ทำให้ระบบเดิมพัง)

**สถานะ:** ✅ เสร็จ — ยังไม่ commit (แนะนำ commit จากเครื่องตัวเอง)

**งานถัดไปที่แนะนำ:** Phase 1 (ระบบแบบสอบถาม confidence + SUS + CSV export + pretest/posttest) = blocker ใหญ่สุดของการเก็บข้อมูลวิจัย

---

<!-- เพิ่มรอบใหม่เหนือเส้นนี้ โดยคัดลอกหัวข้อด้านบนเป็นแม่แบบ -->
