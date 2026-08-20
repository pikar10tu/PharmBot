# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pharm From Home** (ชื่อเดิม DISPENSA / PharmBot v2) — ระบบจำลองร้านขายยาชุมชนสำหรับนักศึกษาเภสัชศาสตร์ฝึกซักประวัติและจ่ายยา
Deployed on GitHub Pages (static) + Firebase (Auth + Firestore backend)

**⚠️ ชื่อภายในยังเป็นของแบรนด์เก่าทั้งหมด** — localStorage key `pharmbot-theme`/`pharmbot-char`,
auth domain `@pharmbot.local`, firebase project `pharmbot-8496c`,
และ **id ของธีมเริ่มต้นยังเป็น `dispensa`** (`css/main.css` selector + `dashboard.js` default)
— ตั้งใจไม่แตะ เพราะ id ธีมถูกเก็บใน localStorage ของผู้ใช้เดิมแล้ว เปลี่ยนแล้วหน้าตาจะเพี้ยนจนกว่าเขาจะเลือกธีมใหม่

---

## Quick Orientation — อ่านก่อนทำงาน

| ต้องการ | ไปที่ |
|--------|------|
| แก้ prompt ผู้ป่วย / prompt ประเมิน | `js/prompts.js` (434 บรรทัด, pure functions) |
| แก้ flow session 4 ขั้นตอน | `js/screens/chat.js` (1,058 บรรทัด — ⚠️ ใหญ่) |
| แก้ rubric / น้ำหนักคะแนน | `prompts.js` — `DOMAIN_WEIGHTS` บรรทัด 8, `getDefaultRubric()` บรรทัด 65 |
| แก้/เพิ่ม Firestore queries | `js/db.js` (168 บรรทัด) |
| เพิ่ม/แก้ cases | `setup/seed-cases.js` แล้วรัน `node seed-cases.js` |
| Admin panel | `js/screens/admin.js` (1,093 บรรทัด — ⚠️ ใหญ่) |
| เพิ่ม route ใหม่ | `js/router.js` + `index.html` (เพิ่ม `<script>`) |
| แก้หลักฐานอ้างอิงในเฉลย (annotation) | `docs/specs/2026-08-09-static-guideline-grounding.md` |

---

## Research Protocol Mapping

### ⚠️ คะแนนจาก AI ในแอปไม่ใช่ตัวแปรตามของงานวิจัย

| ตัวแปรตาม | วิธีวัดจริง | เก็บที่ |
|----------|-----------|--------|
| **ทักษะการซักประวัติ/จ่ายยา** | **ผู้เชี่ยวชาญให้คะแนนเอง จากวิดีโอที่นักศึกษาทำกับ standardized patient — นอกแอป** | นอกระบบ (การศึกษานำร่อง n=5) |
| ความมั่นใจ (Self-efficacy) | Likert 5 ข้อ ก่อน-หลัง (n=38, ผลลัพธ์หลัก) | ❌ ยังไม่มีในแอป |
| ความพึงพอใจ (SUS) | SUS 10 ข้อ (n=38) | ❌ ยังไม่มีในแอป |

**คะแนน/feedback ที่แอปคำนวณ = สื่อการเรียนรู้เชิงก่อรูป (formative) ไม่ใช่เครื่องมือวัด**
เก็บลง `/results` ต่อไปเพื่อ **วิเคราะห์เสริม** ว่าสอดคล้องกับคะแนนผู้เชี่ยวชาญแค่ไหน

ผลที่ตามมา:
- ทั้ง eval pipeline เป็นส่วนหนึ่งของ **intervention** ไม่ใช่ instrument → ตัว pipeline เองไม่ต้องทำ IOC แยก
  (แต่ **เนื้อหาเคส** รวมถึง annotation `rationale`/`sources` ที่เขียนลงแต่ละข้อ rubric **ต้องผ่านการตรวจของทีมผู้เชี่ยวชาญ** ก่อนใช้เก็บข้อมูลจริง — ดู Case Schema ด้านล่าง)
- **แอปไม่ต้องมีโหมด pretest/posttest** เพราะการสอบทักษะเกิดนอกแอป
- ข้อจำกัดที่เหลือคือ **treatment fidelity** — freeze prompt + rubric annotation + `GROUNDING_VERSION` (`js/prompts.js:20`) ก่อนเก็บข้อมูล ห้ามแก้กลางคัน

### ขอบเขตเนื้อหา (ตามเล่ม บท 3 ฉบับทีม 25 ก.ค.)

**3 กลุ่มโรค × 3 = 9 เคสฝึก + 2 เคสสอบ**

| กลุ่ม | เคส |
|---|---|
| `RESP` ระบบทางเดินหายใจ | Bacterial pharyngitis · Bacterial sinusitis · Allergic rhinitis |
| `GU_STI` ทางเดินปัสสาวะ + STI | Vulvovaginal candidiasis · Gonorrhea · Uncomplicated UTI |
| `NEURO` ระบบประสาท | Migraine without aura · Tension headache · Stroke |

**เคสสอบ (ผู้เรียนไม่รู้ล่วงหน้า):** Trichomoniasis · Bacterial pharyngitis แบบแพ้ Amoxicillin

### Scoring (deterministic — AI ไม่คิดเลขเอง)
```
domain_score = (Σ weight×earned ในหมวด ÷ Σ weight ในหมวด) × 100
overall = history×0.25 + diagnosis×0.15 + drug×0.40 + counseling×0.20
```
AI ตัดสินแค่ `earned` ต่อข้อ ∈ {0, 0.5, 1} → `scoreRubric()` ใน `prompts.js` คำนวณเอง
น้ำหนัก domain อยู่ที่ `DOMAIN_WEIGHTS` (`prompts.js:8`) — **hardcoded โดยตั้งใจ เพื่อความเสถียรของงานวิจัย**

---

## Development

**No build step.** Pure vanilla JS — edit files and commit directly.
```bash
npx serve .    # test locally
```
Deploy อัตโนมัติผ่าน GitHub Actions เมื่อ push to `main`.

---

## Setup Scripts (`setup/`)

ต้องมี `setup/serviceAccountKey.json` (gitignored — ดาวน์โหลดจาก Firebase Console → Service accounts)

```bash
cd setup && npm install
npm test                      # unit tests (node:test) — 79 tests

node create-participants.js   # สร้าง Firebase Auth + Firestore /users
node seed-drugs.js            # seed /drugs
node seed-cases.js            # seed /diseaseGroups + /cases
node reset-passwords.js       # reset passwords → participants-reset.csv
```

**คลังแนวทางเวชปฏิบัติ (offline — วัตถุดิบเขียน annotation)** (ดู `docs/plans/2026-08-08-rag-phase1-indexing.md`)
```bash
python extract-pdf.py         # PDF -> guidelines/.extracted/{docId}/p{NNN}.txt
node index-guidelines.js --dry     # ตรวจก่อน ไม่เรียก API ไม่เขียน Firestore
node index-guidelines.js           # chunk -> สรุปไทย -> embed -> Firestore
node eval-retrieval.js             # วัด recall@6 (เกณฑ์ >= 0.8) ก่อนเปิดใช้งาน
```
ไฟล์ PDF อยู่ `setup/guidelines/` (**gitignored** — ลิขสิทธิ์) สำรอง manifest ที่ `DOC/guidelines/manifest.json`

**Update Gemini model/key:**
```bash
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('gemini').set({
  apiKey: 'AIza...',
  model: 'gemini-2.5-flash'
},{merge:true}).then(()=>{console.log('done');process.exit(0)});
"
```
⚠️ `gemini-2.0-*` และ `gemini-1.5-*` **ถูกประกาศเลิกใช้แล้ว** ห้ามใช้

---

## Architecture

### Script Load Order (index.html — critical)
```
utils.js            → escapeHtml / escapeHtmlBr (ไม่มี dependency ต้องมาก่อนสุด)
firebase-config.js  → initializes firebase + auth + db globals
gemini.js           → uses db (loadGeminiConfig)
gemini-live.js      → WebSocket client for Gemini Live API (voice mode)
gemini-tts.js       → text-to-speech helper
auth.js             → uses db, loadGeminiConfig
db.js               → Firestore CRUD helpers
prompts.js          → pure prompt-builder functions (no side effects)
drug-data.js        → DRUG_SEED array
screens/*.js        → use all of the above
router.js           → init() called LAST, after onAuthReady()
```
All JS is **global scope**. Adding a `<script>` out of order causes "X is not defined" at runtime.
**No build step** — แก้ไฟล์แล้ว commit ตรงๆ
**ไม่ต้อง bump `?v=` เองแล้ว** — GitHub Actions รัน `scripts/stamp-assets.js` เขียน `?v=<md5 8 ตัว>`
จากเนื้อไฟล์จริงให้ก่อน upload artifact (ค่าใน repo จึงไม่สำคัญ ของที่ deploy เป็นตัวจริง)
ตรวจเองได้ด้วย `node scripts/stamp-assets.js --check`

**HTML escaping** — ใช้ `escapeHtml()` เสมอเมื่อยัดค่าลง attribute, `escapeHtmlBr()` เมื่อต้องคง `\n`
ทั้งสองอยู่ใน `js/utils.js` (เดิมมี helper ก๊อปกัน 5 ตัวและ 3 ตัวไม่ escape เครื่องหมายคำพูด)

### Routing
Hash-based SPA (`js/router.js`, 57 บรรทัด)
Routes: `#login #dashboard #groups #cases #chat #summary #history #admin`
Params ส่งผ่าน `Router.go('chat', { caseId })` — **params หายเมื่อ refresh หน้า**

### Firestore Collections

| Collection | Schema | Purpose |
|---|---|---|
| `/config/gemini` | `{ apiKey, model, evalModel? }` | API key loaded after login |
| `/users/{uid}` | `{ participantId, role }` | role: `'student'` or `'admin'` |
| `/diseaseGroups/{id}` | `{ label, sortOrder }` | **3 groups**: RESP, GU_STI, NEURO |
| `/cases/{id}` | see Case Schema below | เป้าหมาย 9 เคสฝึก |
| `/drugs/{drugCode}` | `{ name, strength, form, category, isOtc, isActive }` | drug library |
| `/sessions/{id}` | chatHistory, dispensedDrugs, counselingHistory, status | one per attempt |
| `/results/{id}` | score fields + feedbackJson + `guidelineRefs[]` + `groundingVersion` | linked to sessionId + userId |
| `/guidelineIndex/{groupId}_{shard}` | `{ corpusVersion, groupId, entries[] }` | **offline เท่านั้น** — วัตถุดิบเขียน annotation ไม่มีโค้ดฝั่งเบราว์เซอร์อ่าน |
| `/guidelineChunks/{chunkId}` | `{ docId, page, heading, text, summaryTh, hash }` | **offline เท่านั้น** — เนื้อหาเต็มสำหรับร่างเฉลย |
| `/surveys/{id}` | **ยังไม่มี** | confidence + SUS |

Required composite indexes (Firebase Console → Firestore → Indexes):
- `cases`: `(groupId ASC, isActive ASC)`
- `sessions`: `(userId ASC, startedAt ASC)`
- `results`: `(userId ASC, createdAt ASC)`

---

## 4-Step Session Flow (`js/screens/chat.js`)

1. **History Taking** — student chats with AI patient; prompt from `buildSystemPrompt()`
2. **Drug Dispensing** — student selects drugs from modal; drugs from `/drugs`
3. **Counseling** — student explains medication; prompt from `buildCounselingPrompt()`
4. **Evaluation** — `buildEvalPrompt()` → Gemini returns JSON → saved to `/results`

**Session timer:** 5:00 countdown spans Steps 1–3. Last 30 s blinks red. On expiry inputs lock.
`_startSessionTimer` / `_onTimeUp` / `_lockInput` in `chat.js` — `_timerExpired` flag prevents re-enable.

**Rate limit:** 5 sessions/user/day (`getTodaySessionCount` in `db.js`).

**Refresh guard:** `beforeunload` warns during live session. Auto-disabled on quit/eval saved.

---

## Prompts (`js/prompts.js`)

| Function | ใช้ใน | Key behavior |
|----------|------|-------------|
| `buildSystemPrompt(caseData, voiceMode)` | Step 1 | 12 กฎเหล็ก, persona, secretInfo, voice overlay |
| `buildCounselingPrompt(caseData, dispensedDrugs, voiceMode)` | Step 3 | patient รับยาแล้ว รอ counseling |
| `buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory)` | Step 4 | AI ตัดสิน earned รายข้อ — **ไม่คิดคะแนนรวมเอง** · เทิร์นที่ `via` เป็น `live`/`webspeech` ถูกกำกับ "(ถอดจากเสียง)" + แนบกฎผ่อนผัน ASR (ดู Voice Mode) |
| `buildRubricForCase(caseData)` | eval + admin | ใช้ rubric ของเคส ถ้าไม่มีก็ seed default + migrate ของเดิม |
| `collectGuidelineSources(caseData)` | Step 4 → summary | รวมแหล่งอ้างอิงจาก annotation ของ rubric ทั้งเคส (dedup, เรียงตาม `DOMAIN_ORDER`) |
| `scoreRubric(caseData, itemResults, gender)` | chat.js | **คำนวณคะแนนใน JS แบบ deterministic** |
| `randomizePatientData(caseData)` | chat.js | สุ่ม gender/age/name ถ้าเป็น 'random'/0 |

**Eval JSON output schema** (AI คืนแค่นี้ — คะแนนคำนวณฝั่ง JS):
```json
{
  "reasoning": "วิเคราะห์ทีละหมวด อ้างหลักฐานจาก transcript",
  "items": [{"id": "h1", "earned": 1, "note": "หลักฐานสั้นๆ"}],
  "history_feedback": "", "history_missed": [],
  "diagnosis_feedback": "", "drug_feedback": "",
  "counseling_feedback": "", "counseling_missed": [],
  "summary": ""
}
```

---

## Case Schema (Firestore `/cases`)

```js
{
  groupId: 'INF_URI',
  difficulty: 'easy|medium|hard',
  title: 'ชื่อเคส',
  gender: 'male|female|random',
  age: 0,           // 0 = สุ่ม 18-50
  occupation: 'random',
  sceneDesc: '...',
  chiefComplaint: 'เจ็บคอค่ะ',
  secretInfo: '...',           // ห้าม AI บอกเอง รอให้ถาม
  specificChecklist: '...',    // เกณฑ์เฉพาะโรค (optional)
  diagnosisAnswer: '...',
  drugAnswer: {
    firstLine: ['amoxicillin_500'],     // simple format (string array)
    alternatives: ['azithromycin_500'],
    unacceptable: [],
    regimen: { amoxicillin_500: 'กิน 1 เม็ด...' },
    counseling: ['คำแนะนำ 1', 'คำแนะนำ 2']
  },
  isActive: true
}
```
`drugAnswer.firstLine` รองรับ rich format (array of objects) ด้วย — `buildEvalPrompt()` handle ทั้งสองแบบ

**rubric item รองรับ annotation (static guideline grounding):**
```js
{ id: 'r1', domain: 'drug', label: '...', weight: 7, critical: true, active: true,
  rationale: 'เกณฑ์ตัดสินข้อนี้ตามหลักฐาน — ว่างได้',
  sources: [{ docId, title, page, url }] }
```
ทั้งสองฟิลด์ optional · ข้อที่ไม่มี `rationale` ได้ prompt เหมือนก่อนมีฟีเจอร์นี้ทุกประการ
· **ยังไม่มี UI แก้ไขใน admin** (pass-through อย่างเดียว) รอเคสที่ผ่าน IOC

**Cases ปัจจุบัน (7 cases — เคสทดสอบ ยังไม่ผ่าน IOC):**
- `case001_uri_pharyngitis` — เจ็บคอ (easy, RESP, female)
- `case002_gi_diarrhea` — ท้องเสีย (easy, GI, male)
- `case003_msk_backpain` — ปวดหลังส่วนล่าง (easy, MSK, random)
- `case004_derm_tinea_pedis` — เชื้อราที่เท้า (medium, DERM, male)
- `case005_refer_thunderclap` — Red Flag Headache (hard, REFER, female)
- `case006_gu_uti` — ปัสสาวะแสบขัด (medium, GU_STI, female)
- `case007_neuro_migraine` — ปวดหัวข้างเดียว / Migraine without aura (medium, NEURO, female)

**Cases ที่ต้องเพิ่ม (Phase 3):** Allergic Rhinitis, GERD/Dyspepsia, Pregnancy scenario (GYN)

---

## Voice Mode (Gemini Live)

`js/gemini-live.js` — `GeminiLiveClient` WebSocket to `models/gemini-3.1-flash-live-preview`
Streams mic audio (16 kHz PCM16) → receives audio (24 kHz) + text transcripts
Transcripts push to `_chatHistory` / `_counselingHistory` → Step 4 eval works unchanged
Voice: `Aoede` (female) / `Puck` (male). Falls back to text mode on connection failure.

- **Barge-in** — เมื่อนักศึกษาพูดแทรก คำตอบผู้ป่วยส่วนที่พูดไปแล้วจะถูกบันทึกลง history พร้อม `interrupted: true` และต่อท้ายด้วย `…` (นักศึกษาได้ยินไปแล้วจริง — ถ้าทิ้ง eval จะเห็นเทิร์นที่ผู้ป่วยเงียบ)
- **Session resumption ไม่ได้ต่อไว้โดยตั้งใจ** — session ถูกจำกัด 5 นาทีด้วย timer ต่ำกว่า connection lifetime ~10 นาที (วิธีเปิดอยู่ในคอมเมนต์ `gemini-live.js`)
- **Debug** — `GeminiLiveClient.debug = true` ใน console เพื่อ log audio frame ด้วย (ปกติ log เฉพาะ setup/transcript/error/goAway)
- คิวเล่นเสียงใน `audio/playback.worklet.js` จำกัด 45 วินาที ถ้าล้นจะ `console.warn` ไม่ดรอปเงียบ

**⚠️ transcript ไม่ใช่สิ่งที่โมเดลได้ยิน** — โมเดล native audio กินเสียงตรงๆ ส่วน `inputAudioTranscription`
เป็น ASR อีกสายที่วิ่งขนานกันเพื่อ log/แสดงผลเท่านั้น สองสายนี้ไม่ตรงกันได้ (ผู้ป่วยตอบถูกทั้งที่ข้อความเพี้ยน
หรือถอดออกมาเป็นภาษาลาว/เขมร) และ **public API ไม่มีทางล็อกภาษา** — `AudioTranscriptionConfig` ไม่มี field ใดๆ เลย
ผลคือ `buildEvalPrompt()` ต้องผ่อนผันให้ transcript ที่เพี้ยน โดยใช้ **คำตอบของผู้ป่วยเป็นหลักฐาน**
ว่านักศึกษาถามอะไรจริง (ผู้ป่วยตอบจากเสียง ไม่ได้ตอบจากข้อความ) — ห้ามลบกฎชุดนี้ออกจาก prompt

**โหมดเสียงล้วน (`VOICE_ONLY` ใน `chat.js`)** — โหมดพิมพ์ไม่อยู่ใน UI ปกติแล้ว
ฟองแชทถูกซ่อนจากผู้เรียน (DOM ยังอยู่ครบ) ทีมดู transcript ได้ที่หน้า summary เมื่อล็อกอินเป็น admin

⚠️ พลิก `VOICE_ONLY` เป็น `false` (แผนถอยกลางการทดลอง) คืนแค่ **UI ที่ผู้เรียนเห็น** (mode switcher/
ฟองแชท/โหมดพิมพ์กลับมาเรนเดอร์) — **ไม่ใช่ทั้งแอปกลับไปเหมือนเดิม** บันไดสำรองด้านล่างทำงานไม่มีเงื่อนไข
ไม่ได้อ่านค่า flag นี้เลย

บันไดสำรอง `L0 Live → L1 Web Speech → L2 โหมดพิมพ์ฉุกเฉิน` ลงได้อย่างเดียว
ตรรกะอยู่ใน `js/voice-ladder.js` (ฟังก์ชันบริสุทธิ์ มี unit test) การลดระดับถูกบันทึกลง
`/sessions.degraded` ผ่าน `markSessionDegraded()` เพื่อให้ทีมคัดเซสชันที่เจอปัญหาเทคนิคออกจากการวิเคราะห์ได้
— และเพราะ L1/L2 ใช้โมเดลข้อความ field นี้จึงเป็นบันทึก treatment fidelity ในตัว
(หมายเหตุ: `_addMsg()`/`_notify()` เขียนแค่ DOM node ของหน้านักศึกษา ไม่ persist และไม่ใช่สัญญาณที่ทีมใช้ —
`markSessionDegraded()` ต่างหากที่เป็นบันทึกที่ทีมอ่านได้จริง)

---

## Gemini Config

Key **never in source** — stored in Firestore `/config/gemini`, loaded into `_geminiKey` after login.

**โมเดลที่ใช้จริง** (ตรวจจาก `/config/gemini` เมื่อ 2026-08-13):

| Use case | Model | มาจากไหน |
|---------|-------|---------|
| Patient simulation (Steps 1,3) — โหมดพิมพ์ | `gemini-2.5-flash` | `/config/gemini.model` |
| Evaluation (Step 4) | `gemini-2.5-flash` | `/config/gemini.evalModel` **ยังไม่ตั้ง** → fallback เป็น `model` (`gemini.js:13`) |
| Patient simulation — โหมดเสียง | `gemini-3.1-flash-live-preview` | hardcoded ใน `gemini-live.js` (คนละ endpoint ไม่อ่านจาก config) |

⚠️ `gemini-2.0-*` และ `gemini-1.5-*` **เลิกใช้แล้ว ห้ามใช้**

ยังไม่มี `evalModel` แยก (Phase 4) — ตอนนี้ไม่พังเพราะ fallback แต่ถ้าจะแยกจริงต้องเซ็ตใน Firestore
ไม่ต้องแก้โค้ด (`setGeminiConfig()` รับ 3 ตัวอยู่แล้ว)

---

## Admin Panel

Login: `admin@pharmbot.local` → route `#admin`
Features: CRUD cases/drugs/groups, view all student results
`secretInfo` built from 13 structured fields → `_assembleSecretInfo()` in `admin.js`

**ยังขาด:** CSV export สำหรับ research data (Phase 1)

---

## Participant Auth

Students type code `P00001` → maps internally to `p00001@pharmbot.local` (ไม่แสดงต่อ user)

---

## Development Roadmap

### Phase 1 — Research Instruments ⚠️ ต้องทำก่อน deploy
- [ ] `/surveys` Firestore collection + schema
- [ ] Confidence survey (Likert 5 ข้อ) → แสดงก่อน session เริ่มและหลัง summary
- [ ] SUS Usability questionnaire (10 ข้อ) → หลัง session สุดท้าย
- [ ] Admin CSV export (results + surveys)
- [ ] `sessionNumber` field ใน `/sessions` (เพื่อ pretest-posttest analysis)

### Phase 2 — Code Refactoring (ก่อน audit ครั้งถัดไป)
- [ ] สร้าง `js/config.js` — ย้ายค่าคงที่ทั้งหมด (TIMER_SEC, RATE_LIMIT, SCORE_WEIGHTS)
- [ ] แยก `chat.js` → `chat.js` + `chat-steps.js` + `chat-voice.js` + `chat-timer.js`
- [ ] เพิ่ม `"reasoning"` field ใน eval JSON output

### Phase 3 — Clinical Content
- [ ] เพิ่ม cases ให้ครบ 9–12 (UTI, Allergic Rhinitis, GERD, GYN)
- [ ] Expert review patient behavior (อาจารย์เภสัชกร)

### Phase 4 — AI Upgrade
- [x] ~~Upgrade eval → gemini-2.5-flash~~ — ใช้อยู่แล้ว (ผ่าน fallback ของ `model`)
- [ ] ตั้ง `evalModel` ใน Firestore ให้ชัด แทนการพึ่ง fallback (แยก patient/eval ออกจากกันได้จริง)
- [ ] ตัดสินใจว่าโหมดพิมพ์ควรใช้โมเดลเดียวกับโหมดเสียงไหม — ตอนนี้คนละตัว (`gemini-2.5-flash` vs `gemini-3.1-flash-live-preview`) พฤติกรรมผู้ป่วยจึงไม่เหมือนกันเป๊ะระหว่างสองโหมด ซึ่งกระทบ treatment fidelity ถ้าผู้เรียนสลับโหมดกลางการทดลอง

### Phase 5 — Validation & Testing
- [x] Fix Playwright tests (chat UI + voice UI) — 2026-08-20
- [ ] Inter-rater reliability: AI score vs. human expert score
- [ ] ทดสอบโหมดฉุกเฉินด้วยมือก่อนเก็บข้อมูลจริง (ปฏิเสธสิทธิ์ไมค์ → ต้องลง L2 ทันที)

---

## Known Issues

- `chat.js` 1,058 บรรทัด — ยากต่อการ audit; ควรแยกก่อนแก้ไขใหญ่
- Scoring weights hardcoded ใน `prompts.js:8`
- No `evalModel` separation — patient + evaluator ใช้ model เดียวกัน
- No survey/questionnaire system
- ~~Playwright tests: `02-student-flow` (chat UI) และ `04-voice-ui` fail~~ — **2026-08-20 เขียวหมดแล้ว** 24/24 Playwright · 108/108 `setup/npm test` (`02-student-flow` ถูกเขียนใหม่ให้ตรง flow สุ่มเคส · `summary-citations.test.js` เลิกไล่หา `_escS` ที่ถูกยุบไปแล้ว)
- ยังไม่มี UI แก้ annotation (rationale/sources) ใน admin rubric editor
- ปุ่ม "↺ ค่าเริ่มต้น" ต่อหมวดใน rubric editor ลบ annotation ของหมวดนั้นทิ้ง (มี confirm dialog)
- ปุ่ม "✕" ลบข้อ rubric ทีละข้อ ถ้าข้อนั้นมี annotation จะมี confirm dialog ก่อนลบ (ข้อที่ไม่มี annotation ลบได้ทันทีไม่มี confirm)
