# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DISPENSA** (ชื่อเดิม PharmBot v2) — ระบบจำลองร้านขายยาชุมชนสำหรับนักศึกษาเภสัชศาสตร์ฝึกซักประวัติและจ่ายยา
Deployed on GitHub Pages (static) + Firebase (Auth + Firestore backend)

**⚠️ ชื่อภายในยังเป็น pharmbot ทั้งหมด** — localStorage key `pharmbot-theme`/`pharmbot-char`,
auth domain `@pharmbot.local`, firebase project `pharmbot-8496c` — ตั้งใจไม่แตะ

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
**No build step** — แก้ไฟล์แล้ว commit ตรงๆ อย่าลืม bump `?v=` ใน `index.html` เมื่อแก้ไฟล์ที่ deploy แล้ว

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
| `buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory)` | Step 4 | AI ตัดสิน earned รายข้อ — **ไม่คิดคะแนนรวมเอง** |
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

**Cases ปัจจุบัน (5 cases):**
- `case001_uri_pharyngitis` — เจ็บคอ (easy, female)
- `case002_gi_diarrhea` — ท้องเสีย (easy, GI)
- `case003_msk_lbp` — ปวดหลัง (MSK)
- `case004_derm_tinea` — เชื้อราที่เท้า (DERM)
- `case005_refer_headache` — Red Flag Headache (REFER)

**Cases ที่ต้องเพิ่ม (Phase 3):** UTI, Allergic Rhinitis, GERD/Dyspepsia, Pregnancy scenario (GYN)

---

## Voice Mode (Gemini Live)

`js/gemini-live.js` — `GeminiLiveClient` WebSocket to `models/gemini-3.1-flash-live-preview`
Streams mic audio (16 kHz PCM16) → receives audio (24 kHz) + text transcripts
Transcripts push to `_chatHistory` / `_counselingHistory` → Step 4 eval works unchanged
Voice: `Aoede` (female) / `Puck` (male). Falls back to text mode on connection failure.

---

## Gemini Config

Key **never in source** — stored in Firestore `/config/gemini`, loaded into `_geminiKey` after login.

**Model recommendations:**
| Use case | Model | เหตุผล |
|---------|-------|-------|
| Patient simulation (Steps 1,3) | `gemini-2.0-flash` | Thai ดีขึ้น, เร็ว, ราคาใกล้เคียง 1.5-flash |
| Evaluation (Step 4) | `gemini-2.5-flash` | Thinking mode → scoring แม่นขึ้น |

ปัจจุบัน `/config/gemini` มีแค่ `model` field เดียว — ควรเพิ่ม `evalModel` (Phase 4)

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
- [ ] แยก `/config/gemini` เป็น `model` + `evalModel`
- [ ] Upgrade patient → gemini-2.0-flash
- [ ] Upgrade eval → gemini-2.5-flash (thinking mode)

### Phase 5 — Validation & Testing
- [ ] Fix Playwright tests (chat UI + voice UI)
- [ ] Inter-rater reliability: AI score vs. human expert score

---

## Known Issues

- `chat.js` 1,058 บรรทัด — ยากต่อการ audit; ควรแยกก่อนแก้ไขใหญ่
- Scoring weights hardcoded ใน `prompts.js:8`
- No `evalModel` separation — patient + evaluator ใช้ model เดียวกัน
- No survey/questionnaire system
- Playwright tests: `02-student-flow` (chat UI) และ `04-voice-ui` fail
- ยังไม่มี UI แก้ annotation (rationale/sources) ใน admin rubric editor
- ปุ่ม "↺ ค่าเริ่มต้น" ต่อหมวดใน rubric editor ลบ annotation ของหมวดนั้นทิ้ง (มี confirm dialog)
