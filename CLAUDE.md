# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PharmBot v2 — ระบบจำลองร้านขายยาชุมชนสำหรับนักศึกษาเภสัชศาสตร์ฝึกซักประวัติและจ่ายยา
Deployed on GitHub Pages (static) + Firebase (Auth + Firestore backend).

## Development

**No build step.** Pure vanilla JS — edit files and commit directly. To test locally just open `index.html` in a browser or use a static file server:
```
npx serve .
```

Deploy happens automatically via GitHub Actions on push to `main`.

## Setup Scripts (`setup/`)

Requires `setup/serviceAccountKey.json` (gitignored — download from Firebase Console → Project Settings → Service accounts).

```bash
cd setup
npm install

node create-participants.js   # สร้าง Firebase Auth accounts + Firestore /users
node seed-drugs.js            # seed /drugs collection
node seed-cases.js            # seed /diseaseGroups + /cases collections
node reset-passwords.js       # reset รหัสผ่านทุก participant → participants-reset.csv
```

**Update Gemini model/key in Firestore:**
```bash
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('gemini').set({
  apiKey: 'AIza...',
  model: 'gemini-1.5-flash'   // หรือ gemini-2.0-flash, gemini-2.5-flash
},{merge:true}).then(()=>{console.log('done');process.exit(0)});
"
```

## Architecture

### Script Load Order (index.html — critical)
```
firebase-config.js  → initializes firebase + auth + db globals
gemini.js           → uses db (loadGeminiConfig)
auth.js             → uses db, loadGeminiConfig
db.js               → uses db
prompts.js          → pure functions
drug-data.js        → DRUG_SEED array
screens/*.js        → use all of the above
router.js           → init() called last, after onAuthReady()
```
All JS is global scope. Adding a `<script>` out of order will cause "X is not defined" at runtime.

### Routing
Hash-based SPA (`js/router.js`). Routes: `#login → #dashboard → #groups → #cases → #chat → #summary`. Params passed via `Router.go('chat', { caseId })` and read with `Router.getParams()` — params are lost on page refresh.

### Firestore Collections
| Collection | Purpose |
|---|---|
| `/config/gemini` | `{ apiKey, model }` — loaded into memory after login via `loadGeminiConfig()` |
| `/users/{uid}` | `{ participantId, role: 'student'|'admin' }` |
| `/diseaseGroups/{id}` | `{ label, sortOrder }` |
| `/cases/{id}` | case data — see Case Schema below |
| `/drugs/{drugCode}` | `{ name, strength, form, category, isOtc, isActive }` |
| `/sessions/{id}` | created per attempt, stores chatHistory + dispensedDrugs + counselingHistory |
| `/results/{id}` | eval JSON scores, linked to sessionId + userId |

### 4-Step Session Flow (`js/screens/chat.js`)
1. **History Taking** — student chats with AI patient; `buildSystemPrompt()` controls patient behavior
2. **Drug Dispensing** — student selects drugs from modal; drugs come from `/drugs` collection
3. **Counseling** — student explains medication to AI patient; `buildCounselingPrompt()` used
4. **Evaluation** — `buildEvalPrompt()` sends full transcript to Gemini → returns JSON scores → saved to `/results`

Rate limit: 5 sessions per user per day (`getTodaySessionCount` in `db.js`).

### Case Schema (Firestore `/cases`)
```js
{
  groupId: 'INF_URI',          // matches diseaseGroups document ID
  difficulty: 'easy|medium|hard',
  title: 'ชื่อเคส',
  gender: 'male|female|random',
  age: 0,                      // 0 = สุ่ม 18-50
  occupation: 'random',
  sceneDesc: 'ฉากเปิด...',
  chiefComplaint: 'เจ็บคอค่ะ',
  secretInfo: '...',           // hidden patient data — revealed only when asked
  specificChecklist: '...',    // disease-specific eval criteria (optional)
  diagnosisAnswer: '...',
  drugAnswer: {
    firstLine: ['amoxicillin_500'],         // drugCode strings (simple format)
    alternatives: ['azithromycin_500'],
    unacceptable: [],
    regimen: { amoxicillin_500: 'กิน 1 เม็ด...' },
    counseling: ['คำแนะนำ 1', 'คำแนะนำ 2']
  },
  isActive: true
}
```
`drugAnswer.firstLine` can also be an array of objects (rich format) with `{ drugs, regimen, scorePercent, note }` — `buildEvalPrompt()` in `prompts.js` handles both.

### Gemini Config
API key is **never in source code** — stored in Firestore `/config/gemini` and loaded into `_geminiKey` memory variable after login. If `_geminiKey` is null, all AI calls throw `'Gemini API key not loaded'`. Current model: `gemini-1.5-flash`.

### Firestore Security Rules
Rules in `firestore.rules` must be deployed separately via Firebase CLI — they are **not** deployed by the GitHub Pages workflow. Students can read cases/drugs/their own sessions; only admin can write cases/drugs/groups.

Required composite indexes (create in Firebase Console → Firestore → Indexes):
- `cases`: `(groupId ASC, isActive ASC)`
- `sessions`: `(userId ASC, startedAt ASC)`
- `results`: `(userId ASC, createdAt ASC)`

Firestore will log a direct creation link on first query failure if an index is missing.

### Admin Panel
Login as `admin@pharmbot.local` → navigate to `#admin`. Supports adding/editing cases and drugs via UI, and viewing all student results.

When creating/editing a case, `secretInfo` is built from 13 structured form fields (stored as `secretInfoFields` in Firestore for re-editing). The `_assembleSecretInfo()` function in `admin.js` assembles them into the 6-section AI prompt format, skipping empty fields. The assembled string is stored in `secretInfo` and used by `buildSystemPrompt()` at chat time.

### Participant Auth
Participants only see/type a code like `P00001` — the login screen internally maps it to `p00001@pharmbot.local` (fake domain never shown to users). Firebase Auth accounts use this internal email format.

`loadGeminiConfig()` in `gemini.js` is **non-fatal** — login succeeds even if `/config/gemini` doesn't exist yet. If Gemini key is missing, AI calls will fail when a session starts, not at login.
