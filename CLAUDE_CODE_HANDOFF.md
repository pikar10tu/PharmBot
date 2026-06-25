# Handoff to Claude Code — 2026-06-25

เอกสารส่งต่อสำหรับสั่งงาน Claude Code terminal · สรุปมติและการเปลี่ยนแปลงที่ทำไปแล้ว

## มติ (ชุด prompt/config ที่เลือก)

ทีมเลือก **ชุดแนะนำ** จากใบเลือก `Prompt_Config_Selection.html`:

- **Prompt:** P2 = prompt เดิม + ปักภาษาไทย
- **Model (voice):** `gemini-3.1-flash-live-preview`
- **เสียง:** Aoede (เคสหญิง) / Puck (เคสชาย) — ตามเพศเคส
- **thinkingLevel:** `minimal`
- **VAD:** `startOfSpeechSensitivity = LOW`, `prefixPaddingMs = 300` (ค่าเดิม)
- **temperature:** ผู้ป่วย **0.6** (ทั้งข้อความและเสียง) / ผู้ประเมิน **0** — ปรับใหม่ 2026-06-25

## การเปลี่ยนแปลงที่ทำไปแล้ว — อย่าทำซ้ำ

> แก้ไขและผ่าน `node --check` เรียบร้อยแล้ว ขอให้ review เฉยๆ ไม่ต้องแก้ใหม่

1. **`js/prompts.js`** — ใน `buildSystemPrompt()` เพิ่มกฎข้อ 11 ต่อจากกฎข้อ 10 (ก่อน `${voiceOverlay}`):
   > `11. **พูดภาษาไทยเสมอ:** ตอบเป็นภาษาไทยทุกครั้ง ไม่ว่าเภสัชกรจะพูดภาษาอะไร แม้ถูกถามเป็นภาษาอังกฤษหรือมีชื่อยา/ศัพท์ภาษาอังกฤษปนมา ก็ยังตอบเป็นภาษาไทย ห้ามสลับไปพูดภาษาอื่น`

2. **`js/gemini-live.js`** — ใน `connect()` setup `generationConfig` เพิ่ม:
   ```js
   thinkingConfig: { thinkingLevel: 'minimal' },
   temperature: 0.6,
   ```
   (วางหลัง `responseModalities: ['AUDIO']`)

3. **temperature (ปรับ 2026-06-25):**
   - `js/gemini.js` → `geminiComplete` (ผู้ประเมิน): `0.2` → `0`
   - `js/gemini.js` → `geminiChat` (ผู้ป่วย ข้อความ): `0.8` → `0.6`
   - `js/gemini-live.js` → generationConfig (ผู้ป่วย เสียง): เพิ่ม `temperature: 0.6`

## งานที่ขอให้ Claude Code ทำ

- [ ] Review diff ของ 2 ไฟล์ข้างต้น
- [ ] ทดสอบ local: `npx serve .` แล้วลองโหมดเสียง 1 เคส — ตรวจว่าผู้ป่วยตอบ "ภาษาไทย" แม้เภสัชกรพูดภาษาอังกฤษ/ชื่อยาอังกฤษ
- [ ] รัน `npx playwright test` (ถ้าตั้ง env ได้) — อย่างน้อยอย่าให้ test ที่เคยผ่านพังเพิ่ม
- [ ] Commit การเปลี่ยนแปลง (ข้อความเสนอด้านล่าง)
- [ ] **ไม่ต้องแตะ** VAD / voice (ใช้ค่าเดิมตามมติ)

ข้อความ commit ที่เสนอ:
```
feat(prompt+config): pin Thai language, set Live thinkingLevel=minimal, tune temperatures

- prompts.js: add rule 11 to keep patient replies in Thai even when pharmacist
  uses English words/drug names (prevents native-audio language switching)
- gemini-live.js: set thinkingConfig.thinkingLevel='minimal'; add temperature 0.6
- gemini.js: eval temperature 0.2->0 (reproducible scoring); patient text 0.8->0.6
```

## งานในอนาคต (ยังไม่ต้องทำตอนนี้ — ใส่ไว้เป็น context)

- **Prompt Lab test menu** — เมนูสลับ preset prompt/config ในแอป (admin-only) สำหรับ A/B test เลื่อนเป็นการศึกษาอนาคต
- **Phase 1 survey** — รอมติอาจารย์ว่าใช้ Google Form (แบบผสม) หรือสร้างในแอป
- **Phase 4 model upgrade** — `setup/update-models.js` พร้อมรัน (ต้องมี `setup/serviceAccountKey.json`) ตั้ง patient=`gemini-2.0-flash`, eval=`gemini-2.5-flash`

## เอกสารประกอบในโปรเจค

- `System_Prompting_Config_Rationale.docx` — อธิบายแต่ละพารามิเตอร์ + เหตุผล (สำหรับวิทยานิพนธ์)
- `Prompt_Config_Selection.html` — ใบเลือก prompt/config
- `Voice_Prompt_Tuning_Playbook.html` — คู่มือจูน prompt เสียง (อนาคต)
- `Validation_Plan_PharmBot.docx` — แผนตรวจสอบคุณภาพเครื่องมือ
- `DEVLOG.md` — บันทึกการพัฒนา
