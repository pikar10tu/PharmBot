# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PharmBot v2** — ระบบจำลองร้านขายยาชุมชนสำหรับนักศึกษาเภสัชศาสตร์ฝึกซักประวัติและจ่ายยา
**วัตถุประสงค์วิจัย:** ประเมินผลต่อ (1) ทักษะการซักประวัติ (2) ความมั่นใจ (3) ความพึงพอใจ
**Research design:** Quasi-experimental One-group pretest-posttest
Deployed on GitHub Pages (static) + Firebase (Auth + Firestore backend).

---

## Quick Orientation — อ่านก่อนทำงาน

| ต้องการ | ไปที่ |
|--------|------|
| แก้ prompt ผู้ป่วย / prompt ประเมิน | `js/prompts.js` (221 บรรทัด, pure functions) |
| แก้ flow session 4 ขั้นตอน | `js/screens/chat.js` (1,067 บรรทัด — ⚠️ ใหญ่) |
| แก้ scoring weights | `prompts.js` บรรทัด 199–203 (hardcoded — ดู Config section ด้านล่าง) |
| แก้/เพิ่ม Firestore queries | `js/db.js` (164 บรรทัด) |
| เพิ่ม/แก้ cases | `setup/seed-cases.js` แล้วรัน `node seed-cases.js` |
| Admin panel | `js/screens/admin.js` (889 บรรทัด) |
| เพิ่ม route ใหม่ | `js/router.js` + `index.html` (เพิ่ม `<script>`) |

---

## Research Protocol Mapping

### ตัวแปรและที่เก็บข้อมูล

| ตัวแปรตาม | วิธีวัด | เก็บที่ | สถานะ |
|----------|--------|--------|------|
| ทักษะการซักประวัติ | AI eval score (history_score) | Firestore `/results` | ✅ ทำแล้ว |
| ทักษะการจ่ายยา | drug_score + counseling_score | Firestore `/results` | ✅ ทำแล้ว |
| ความมั่นใจ (Self-efficacy) | Likert survey ก่อน-หลัง | Firestore `/surveys` | ❌ ยังไม่มี |
| ความพึงพอใจ (Usability) | SUS 10 ข้อ | Firestore `/surveys` | ❌ ยังไม่มี |

### Pretest-Posttest

ปัจจุบัน **ยังไม่มี** กลไกแยก pretest / posttest session
→ ต้องเพิ่ม `sessionNumber` ใน `/sessions` และ `isPretest` / `isPosttest` flags

### Scoring Weights (eval prompt)
```
overall = history_score×0.25 + diagnosis_score×0.15 + drug_score×0.40 + counseling_score×0.20
```
อยู่ใน `prompts.js` บรรทัด 199–203 — **hardcoded** ควรย้ายไป `config.js` (Phase 2)

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

node create-participants.js   # สร้าง Firebase Auth + Firestore /users
node seed-drugs.js            # seed /drugs
node seed-cases.js            # seed /diseaseGroups + /cases (5 cases ปัจจุบัน)
node reset-passwords.js       # reset passwords → participants-reset.csv
```

**Update Gemini model/key:**
```bash
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('gemini').set({
  apiKey: 'AIza...',
  model: 'gemini-2.0-flash'   // แนะนำ: 2.0-flash (patient) หรือ 2.5-flash (eval)
},{merge:true}).then(()=>{console.log('done');process.exit(0)});
"
```

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

### Routing
Hash-based SPA (`js/router.js`). Routes: `#login → #dashboard → #groups → #cases → #chat → #summary`.
Params passed via `Router.go('chat', { caseId })` — **params are lost on page refresh**.

### Firestore Collections

| Collection | Schema | Purpose |
|---|---|---|
| `/config/gemini` | `{ apiKey, model }` | API key loaded after login |
| `/users/{uid}` | `{ participantId, role }` | role: `'student'` or `'admin'` |
| `/diseaseGroups/{id}` | `{ label, sortOrder }` | 15 groups defined |
| `/cases/{id}` | see Case Schema below | 5 cases active |
| `/drugs/{drugCode}` | `{ name, strength, form, category, isOtc, isActive }` | drug library |
| `/sessions/{id}` | chatHistory, dispensedDrugs, counselingHistory, status | one per attempt |
| `/results/{id}` | score fields + feedbackJson | linked to sessionId + userId |
| `/surveys/{id}` | **ยังไม่มี — ต้องสร้าง Phase 1** | confidence + usability data |

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
| `buildSystemPrompt(caseData, voiceMode)` | Step 1 | 9 กฎเหล็ก, persona, secretInfo, voice overlay |
| `buildCounselingPrompt(caseData, dispensedDrugs, voiceMode)` | Step 3 | patient รับยาแล้ว รอ counseling |
| `buildEvalPrompt(caseData, chatHistory, dispensedDrugs, counselingHistory)` | Step 4 | returns strict JSON, 4 score domains |
| `randomizePatientData(caseData)` | chat.js | สุ่ม gender/age/name ถ้าเป็น 'random'/0 |

**Eval JSON output schema:**
```json
{
  "checklist_results": [{"item":1,"label":"...","done":true,"note":"..."}],
  "history_score": 0, "history_feedback": "", "history_missed": [],
  "diagnosis_score": 0, "diagnosis_feedback": "",
  "drug_score": 0, "drug_feedback": "",
  "counseling_score": 0, "counseling_feedback": "", "counseling_missed": [],
  "overall": 0, "summary": ""
}
```
→ **ยังขาด `"reasoning"` field** — ควรเพิ่มเพื่อ validation ของ research

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

- `chat.js` 1,067 บรรทัด — ยากต่อการ audit; ควรแยกก่อนแก้ไขใหญ่
- Scoring weights hardcoded ใน `prompts.js:199`
- No `evalModel` separation — patient + evaluator ใช้ model เดียวกัน
- No survey/questionnaire system
- Playwright tests: `02-student-flow` (chat UI) และ `04-voice-ui` fail
