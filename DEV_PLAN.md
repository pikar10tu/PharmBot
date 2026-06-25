# PharmBot v2 — Development Plan

> แผนพัฒนาฉบับละเอียด สำหรับใช้เป็น brief ให้ Claude Code ดำเนินการ
> อ่าน CLAUDE.md ก่อนทุกครั้งที่เริ่ม session ใหม่

---

## Phase 2 — Code Refactoring
**เป้าหมาย:** แยก chat.js ที่ยาวเกินไปออกเป็นไฟล์ย่อย และรวม magic numbers ไว้ที่เดียว

### 2A — สร้าง `js/config.js`

สร้างไฟล์ใหม่ `js/config.js` แล้วย้ายค่าคงที่ทั้งหมดมาไว้ที่นี่:

```js
// js/config.js
const PHARMBOT_CONFIG = {
  // Session timer
  SESSION_TIME_LIMIT_SEC: 5 * 60,   // 5 นาที
  TIMER_WARNING_SEC: 30,             // บลิ๊งก์แดงตอน 30 วินาทีสุดท้าย

  // Rate limit
  RATE_LIMIT_PER_DAY: 5,

  // Scoring weights (ต้องตรงกับ buildEvalPrompt ใน prompts.js)
  SCORE_WEIGHTS: {
    history:     0.25,
    diagnosis:   0.15,
    drug:        0.40,
    counseling:  0.20,
  },

  // Gemini Live
  LIVE_MODEL:         'models/gemini-3.1-flash-live-preview',
  LIVE_THINKING_LEVEL: 'minimal',   // minimal = latency ต่ำสุด

  // localStorage keys
  CHAR_MODE_KEY: 'pharmbot-char',
};
```

แล้วแก้ทุกที่ที่ hardcode ค่าเหล่านี้ใน `chat.js` และ `prompts.js` ให้อ้างอิง `PHARMBOT_CONFIG.*` แทน

**index.html:** เพิ่ม `<script src="js/config.js"></script>` ก่อน `firebase-config.js` (ต้องโหลดก่อนทุกอย่าง)

---

### 2B — แยก `chat.js` เป็น 4 ไฟล์

**หลักการ:** แยกตาม responsibility ไม่ให้ไฟล์ไหนยาวเกิน 300 บรรทัด

#### ไฟล์ที่ต้องสร้าง/แก้

| ไฟล์ | บรรทัดประมาณ | เนื้อหา |
|------|-------------|--------|
| `js/screens/chat.js` | ~200 | entry point `renderChat()`, state variables, `_addMsg()`, `_escH()` |
| `js/screens/chat-timer.js` | ~80 | `_startSessionTimer()`, `_stopSessionTimer()`, `_onTimeUp()`, `_lockInput()` |
| `js/screens/chat-voice.js` | ~300 | `_initVoiceMode()`, `_startVoiceLive()`, `_startVoiceWebSpeech()`, `_startDisplayRecog()` |
| `js/screens/chat-steps.js` | ~400 | `_renderStep1()` ถึง `_renderStep4()`, `_goToStep2/3/4()`, `_runEval()` |

**State variables** (`_caseData`, `_step`, `_chatHistory`, ฯลฯ) คงอยู่ใน `chat.js` เพราะไฟล์อื่นใช้ร่วมกัน (global scope)

**Script load order ใน index.html** (เพิ่มก่อน `router.js`):
```html
<script src="js/screens/chat-timer.js"></script>
<script src="js/screens/chat-voice.js"></script>
<script src="js/screens/chat-steps.js"></script>
<script src="js/screens/chat.js"></script>
```

---

### 2C — เพิ่ม `thinkingLevel` ใน gemini-live.js

ใน `connect()` method ของ `GeminiLiveClient`, เพิ่ม `thinkingConfig` ใน generationConfig:

```js
generationConfig: {
  responseModalities: ['AUDIO'],
  thinkingConfig: { thinkingLevel: PHARMBOT_CONFIG.LIVE_THINKING_LEVEL },
  speechConfig: { ... }
}
```

---

### 2D — Verify

หลัง refactor ให้รัน Playwright tests:
```bash
npx playwright test
```
ต้องผ่านอย่างน้อยเท่าเดิมกับก่อน refactor (login + admin tests)

---

## Phase 1 — Research Instruments
**เป้าหมาย:** เก็บข้อมูลครบตาม research design (ทักษะ + ความมั่นใจ + ความพึงพอใจ)

### 1A — Firestore Schema เพิ่มเติม

#### เพิ่ม field ใน `/sessions`
```js
sessionNumber: number   // ลำดับ session ทั้งหมดของ user นับตั้งแต่ครั้งแรก (1, 2, 3...)
```

#### Collection ใหม่: `/surveys/{id}`
```js
{
  userId:        string,
  participantId: string,
  sessionId:     string | null,    // null สำหรับ SUS ที่ไม่ผูกกับ session เดียว
  sessionNumber: number | null,
  type:          'confidence_pre' | 'confidence_post' | 'sus',
  responses:     { q1: number, q2: number, ... },   // 1-5 ทุกข้อ
  totalScore:    number,           // คำนวณแล้ว
  createdAt:     Timestamp,
}
```

**Firestore index เพิ่ม:**
- `surveys`: `(userId ASC, createdAt ASC)`

**Firestore rules เพิ่ม:**
```
match /surveys/{id} {
  allow read, write: if request.auth.uid == resource.data.userId
                     || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

---

### 1B — `db.js` — เพิ่ม functions

```js
// นับ session ทั้งหมด (ไม่ใช่แค่วันนี้) เพื่อ assign sessionNumber
async function getUserTotalSessionCount(userId) { ... }

// อัพเดต createSession() ให้รับ sessionNumber
async function createSession(userId, caseData, sessionNumber) {
  // เพิ่ม sessionNumber: sessionNumber ใน sessionData
}

// บันทึก survey
async function saveSurvey(userId, participantId, surveyData) {
  // surveyData: { type, sessionId, sessionNumber, responses, totalScore }
  const ref = await db.collection('surveys').add({
    userId, participantId, ...surveyData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// Admin: ดึง surveys ทั้งหมด
async function adminGetAllSurveys() {
  const snap = await db.collection('surveys').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

---

### 1C — สร้าง `js/screens/survey.js`

Screen ใหม่สำหรับแบบสอบถาม รองรับ 3 types

#### Confidence Survey (type: `confidence_pre` / `confidence_post`)
5 ข้อ Likert 1–5 (1=ไม่มั่นใจเลย, 5=มั่นใจมากที่สุด)

```
คำถาม:
q1: "ฉันมั่นใจว่าสามารถซักประวัติผู้ป่วยได้อย่างครบถ้วน"
q2: "ฉันสามารถระบุโรคได้จากอาการที่ผู้ป่วยบอก"
q3: "ฉันมั่นใจว่าสามารถเลือกยาและวิธีใช้ที่เหมาะสมให้ผู้ป่วยได้"
q4: "ฉันสามารถให้คำแนะนำการใช้ยาแก่ผู้ป่วยได้อย่างครบถ้วน"
q5: "ฉันพร้อมที่จะให้บริการที่ร้านขายยาชุมชนด้วยตนเอง"
```

Score: ค่าเฉลี่ย q1–q5 (1.0–5.0) × 20 = 0–100

#### SUS Questionnaire (type: `sus`)
10 ข้อมาตรฐาน Likert 1–5 (1=ไม่เห็นด้วยอย่างยิ่ง, 5=เห็นด้วยอย่างยิ่ง)

```
q1:  "ฉันคิดว่าอยากใช้ระบบนี้บ่อยๆ"                                    (odd — บวก)
q2:  "ฉันพบว่าระบบนี้ซับซ้อนโดยไม่จำเป็น"                               (even — ลบ)
q3:  "ฉันคิดว่าระบบนี้ใช้งานง่าย"                                        (odd — บวก)
q4:  "ฉันคิดว่าต้องการความช่วยเหลือจากผู้เชี่ยวชาญเพื่อใช้ระบบนี้"      (even — ลบ)
q5:  "ฉันพบว่าฟังก์ชันต่างๆ ในระบบนี้ผสานกันได้ดี"                       (odd — บวก)
q6:  "ฉันพบว่ามีความไม่สอดคล้องกันมากเกินไปในระบบนี้"                    (even — ลบ)
q7:  "ฉันคิดว่าคนส่วนใหญ่จะเรียนรู้การใช้ระบบนี้ได้อย่างรวดเร็ว"         (odd — บวก)
q8:  "ฉันพบว่าระบบนี้ยากต่อการใช้งานมาก"                                 (even — ลบ)
q9:  "ฉันรู้สึกมั่นใจมากเมื่อใช้ระบบนี้"                                 (odd — บวก)
q10: "ฉันต้องเรียนรู้สิ่งต่างๆ มากมายก่อนที่จะใช้ระบบนี้ได้"             (even — ลบ)
```

SUS Score calculation (มาตรฐาน):
```js
const oddSum  = (q1-1) + (q3-1) + (q5-1) + (q7-1) + (q9-1);
const evenSum = (5-q2) + (5-q4) + (5-q6) + (5-q8) + (5-q10);
const susScore = (oddSum + evenSum) * 2.5;   // 0–100
```

#### Function signature
```js
async function renderSurvey(container, params = {}) {
  // params: { type, sessionId, sessionNumber, nextRoute, nextParams }
  // หลัง submit → Router.go(params.nextRoute, params.nextParams)
}
```

---

### 1D — เพิ่ม Route ใหม่

ใน `js/router.js` เพิ่ม route `survey`:
```js
survey: (c, p) => renderSurvey(c, p)
```

ใน `index.html` เพิ่ม:
```html
<script src="js/screens/survey.js"></script>
```
(ก่อน `router.js`)

---

### 1E — แก้ Flow ใน Cases + Summary

**`js/screens/cases.js`** — ก่อนไป chat ให้แวะ survey ก่อน:
```js
// เดิม:
Router.go('chat', { caseId });

// ใหม่:
const sessionNumber = await getUserTotalSessionCount(user.uid) + 1;
Router.go('survey', {
  type: 'confidence_pre',
  sessionId: null,
  sessionNumber,
  nextRoute: 'chat',
  nextParams: { caseId, sessionNumber },
});
```

**`js/screens/chat.js`** — รับ `sessionNumber` จาก params แล้วส่งต่อ `createSession()`

**`js/screens/summary.js`** — หลัง eval result แสดง ให้แวะ survey ก่อน "ฝึกเคสใหม่":
```js
// ปุ่ม "ฝึกเคสใหม่" เปลี่ยนเป็น:
Router.go('survey', {
  type: 'confidence_post',
  sessionId: result.sessionId,
  sessionNumber: result.sessionNumber,
  nextRoute: 'groups',
  nextParams: {},
});

// ถ้า sessionNumber >= SUS_TRIGGER_SESSION (default 3) และยังไม่เคยทำ SUS:
// ต่อท้าย confidence_post ด้วย SUS อีกที
// วิธีเช็ค: query /surveys where userId=... and type='sus' → ถ้าว่าง = ยังไม่เคยทำ
```

**ค่า SUS_TRIGGER_SESSION** เพิ่มใน `config.js`:
```js
SUS_TRIGGER_SESSION: 3,   // แสดง SUS หลังจาก session ที่ 3 เป็นต้นไป (ปรับได้)
```

---

### 1F — Admin CSV Export

ใน `js/screens/admin.js` เพิ่ม section "ส่งออกข้อมูลวิจัย" (เฉพาะ admin)

**ปุ่ม 1: ดาวน์โหลด Results CSV**
```
Headers: participantId, sessionNumber, caseId, caseTitle, groupId, difficulty,
         date, durationSec, historyScore, diagnosisScore, drugScore, counselingScore, overallScore
```

**ปุ่ม 2: ดาวน์โหลด Surveys CSV**
```
Headers: participantId, sessionNumber, type, date,
         q1, q2, q3, q4, q5, q6, q7, q8, q9, q10, totalScore
(confidence มีแค่ q1-q5, ช่อง q6-q10 ว่าง)
```

**วิธี generate CSV ใน browser (ไม่ต้องการ backend):**
```js
function _downloadCsv(filename, rows, headers) {
  const csv = [headers, ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  // ﻿ = BOM สำหรับ Excel ภาษาไทย
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
}
```

---

## Phase 3 — เพิ่ม Clinical Cases
**เป้าหมาย:** จาก 5 → 9 cases ขั้นต่ำ ครอบคลุมหลายกลุ่มโรค

### Cases ที่ต้องเพิ่มใน `setup/seed-cases.js`

| id | groupId | title | difficulty | จุดทดสอบสำคัญ |
|----|---------|-------|-----------|-------------|
| `case006_uti` | `INF_UTI` | ปัสสาวะแสบขัด — UTI | easy | ถามประจำเดือน/ตั้งครรภ์, แพ้ sulfа |
| `case007_rhinitis` | `ENT_EYE` | คัดจมูก น้ำมูกไหล — Allergic Rhinitis | easy | แยก allergic vs infection, antihistamine |
| `case008_gerd` | `GI` | แสบท้อง — GERD/Dyspepsia | medium | ถาม red flags (weight loss/dysphagia), lifestyle |
| `case009_pregnancy` | `GYN` | ปวดหัว ตั้งครรภ์ — Pregnancy Headache | medium | **ห้ามจ่าย NSAIDs**, paracetamol only, ถาม GA |
| `case010_polypharmacy` | `SPECIAL` | ผู้สูงอายุยาหลายตัว — Drug Interaction | hard | ตรวจสอบ interaction, refer |

**โครงสร้าง secretInfo ที่ดี** (ดูจาก case001 เป็นต้นแบบ):
- บุคลิก/อารมณ์
- ข้อมูลที่ต้องรอถาม (แต่ละ field ขึ้นบรรทัดใหม่ มี dash นำ)
- ข้อมูลที่บอกได้เลยถ้าถามถึงหมวดนั้น

หลังเพิ่ม cases ในไฟล์แล้วรัน:
```bash
cd setup && node seed-cases.js
```

---

## Phase 4 — AI Model Upgrade
**เป้าหมาย:** แยก model สำหรับ patient simulation vs evaluation

### 4A — Firestore `/config/gemini` schema ใหม่

```js
{
  apiKey:     'AIza...',
  model:      'gemini-2.0-flash',              // patient (Steps 1, 3, text mode)
  evalModel:  'gemini-2.5-flash',              // evaluator (Step 4) — ใช้ reasoning
  liveModel:  'models/gemini-3.1-flash-live-preview'  // voice mode (optional field)
}
```

### 4B — `js/gemini.js`

เพิ่ม:
```js
let _evalModel = null;

// ใน loadGeminiConfig():
_evalModel = data.evalModel || _geminiModel;  // fallback ไป model เดิมถ้าไม่มี

// เพิ่ม getter:
function getEvalModel() { return _evalModel; }
```

### 4C — `js/screens/chat.js` (หรือ chat-steps.js หลัง Phase 2)

ตอน Step 4 ที่เรียก Gemini API ให้เปลี่ยนเป็น `getEvalModel()`:
```js
// เดิม: ใช้ getGeminiModel() หรือ hardcode
// ใหม่:
const evalModel = getEvalModel();
```

### 4D — อัพเดต Firestore

รันใน `setup/`:
```bash
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('gemini').set({
  model:     'gemini-2.0-flash',
  evalModel: 'gemini-2.5-flash',
},{merge:true}).then(()=>{console.log('done');process.exit(0)});
"
```

---

## Claude Code Prompts — ใช้ทีละ Phase

### เริ่ม Phase 2A (config.js)
```
อ่าน CLAUDE.md และ DEV_PLAN.md ก่อน แล้วทำ Phase 2A:
สร้าง js/config.js ตาม spec ใน DEV_PLAN.md
แก้ chat.js และ prompts.js ให้ใช้ PHARMBOT_CONFIG แทน hardcoded values
เพิ่ม script tag ใน index.html ให้ถูก load order
```

### เริ่ม Phase 2B (แยก chat.js)
```
อ่าน CLAUDE.md และ DEV_PLAN.md ก่อน แล้วทำ Phase 2B:
แยก chat.js ออกเป็น chat.js + chat-timer.js + chat-voice.js + chat-steps.js
ตาม spec ใน DEV_PLAN.md รัน playwright test หลังเสร็จ ต้องผ่านอย่างน้อยเท่าเดิม
```

### เริ่ม Phase 1 (Research Instruments)
```
อ่าน CLAUDE.md และ DEV_PLAN.md ก่อน แล้วทำ Phase 1 ทั้งหมด:
1A: เพิ่ม sessionNumber ใน createSession + getUserTotalSessionCount ใน db.js
1B: เพิ่ม saveSurvey + adminGetAllSurveys ใน db.js
1C: สร้าง js/screens/survey.js พร้อม confidence + SUS ตาม spec
1D: เพิ่ม route 'survey' ใน router.js + script tag ใน index.html
1E: แก้ cases.js และ summary.js ให้ route ผ่าน survey
1F: เพิ่ม CSV export ใน admin.js
ทำทีละ step เรียงลำดับ รัน playwright test หลังทำครบ
```

### เริ่ม Phase 3 (New Cases)
```
อ่าน CLAUDE.md และ DEV_PLAN.md ก่อน แล้วทำ Phase 3:
เพิ่ม 5 cases ใน setup/seed-cases.js ตาม spec ใน DEV_PLAN.md
แต่ละ case ต้องมี secretInfo ครบ 6 section, specificChecklist, drugAnswer ครบ
ดู case001 เป็น template
```

### เริ่ม Phase 4 (Model Upgrade)
```
อ่าน CLAUDE.md และ DEV_PLAN.md ก่อน แล้วทำ Phase 4:
เพิ่ม _evalModel + getEvalModel() ใน gemini.js
แก้ Step 4 ใน chat.js (หรือ chat-steps.js) ให้ใช้ getEvalModel()
อัพเดต CLAUDE.md section Gemini Config ให้ตรง
```

---

## สถานะ (อัพเดตทุกครั้งที่ทำเสร็จ Phase)

- [ ] Phase 2A — config.js
- [ ] Phase 2B — แยก chat.js
- [ ] Phase 2C — thinkingLevel ใน gemini-live.js
- [ ] Phase 1A — sessionNumber ใน sessions
- [ ] Phase 1B — db.js functions
- [ ] Phase 1C — survey.js screen
- [ ] Phase 1D — route + script tag
- [ ] Phase 1E — flow changes
- [ ] Phase 1F — CSV export
- [ ] Phase 3 — 5 new cases
- [ ] Phase 4 — model upgrade
