# Voice-Only Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ตัดโหมดพิมพ์ออกจาก flow ปกติของ PharmBot ให้เหลือการสนทนาด้วยเสียงล้วน ซ่อนฟองแชทจากผู้เรียน และให้ทีมงานดู transcript ได้ในหน้า admin

**Architecture:** ควบคุมด้วยค่าคงที่ `VOICE_ONLY` ตัวเดียวใน `chat.js` ซ่อน UI ด้วยคลาสไม่ลบ DOM เพื่อให้โหมดฉุกเฉินเรียกกลับมาได้ · แยกตรรกะการลดระดับ (L0→L1→L2) ออกเป็นไฟล์บริสุทธิ์ `js/voice-ladder.js` ที่ทดสอบใน Node ได้โดยไม่ต้องมี DOM · หน้าดู transcript ต่อยอดหน้า `summary` ที่ admin เข้าถึงอยู่แล้ว

**Tech Stack:** Vanilla JS (global scope, ไม่มี build step) · Firebase Auth + Firestore (compat SDK) · Gemini Live API ผ่าน WebSocket · `node:test` สำหรับ unit test · Playwright สำหรับ UI test

**Spec:** `docs/specs/2026-08-13-voice-only-mode.md`

## Global Constraints

- **ไม่มี build step** — แก้ไฟล์แล้ว commit ตรงๆ ห้ามเพิ่ม bundler/transpiler
- **JS ทุกไฟล์อยู่ global scope** — ไฟล์ใหม่ต้องเพิ่ม `<script>` ใน `index.html` ตามลำดับ dependency ไม่งั้น runtime error "X is not defined"
- **ไม่ต้อง bump `?v=` เอง** — GitHub Actions รัน `scripts/stamp-assets.js` ให้
- **HTML escaping บังคับ** — ใช้ `escapeHtml()` เมื่อยัดค่าลง attribute, `escapeHtmlBr()` เมื่อต้องคง `\n` (ทั้งคู่อยู่ใน `js/utils.js`)
- **ข้อความ UI ทั้งหมดเป็นภาษาไทย** ให้เข้ากับของเดิม
- **commit message** ใช้ conventional commits (`feat:` / `fix:` / `test:` / `docs:`) ตามที่ repo ใช้อยู่
- **ห้าม commit ลง `main` ตรงๆ** — Task 0 สร้าง branch ก่อน
- `VOICE_ONLY` เป็นค่าที่ต้อง **freeze ก่อนเก็บข้อมูลจริง** ห้ามแก้กลางการทดลอง

---

### Task 0: สร้าง branch

**Files:** ไม่มี

- [ ] **Step 1: ยืนยันว่ายังอยู่บน main และมีงานค้าง**

```bash
cd pharmbot-v2 && git status --short && git branch --show-current
```

Expected: branch = `main`, มีไฟล์ค้าง 6 ไฟล์จากงาน audit voice mode (`js/gemini-live.js`, `js/screens/chat.js`, `js/prompts.js`, `audio/playback.worklet.js`, `CLAUDE.md`, `docs/specs/2026-08-13-voice-only-mode.md`)

- [ ] **Step 2: commit งานค้างก่อนเป็นฐาน**

งาน audit เป็นคนละเรื่องกับแผนนี้ แยก commit ให้ชัด

```bash
git checkout -b voice-only-mode
git add js/gemini-live.js audio/playback.worklet.js js/screens/chat.js js/prompts.js CLAUDE.md
git commit -m "fix(voice): keep interrupted replies, plug setup-timer leak, widen playback queue

- barge-in: emit the half-spoken reply instead of dropping it, reset UI state
- clear the setup timeout on every exit path so a discarded client cannot
  kill a later live session
- playback queue capped by duration (45 s) instead of 40 chunks, and it
  reports drops instead of silently swallowing audio
- tune end-of-speech VAD for Thai speakers who pause mid-sentence
- eval prompt now tolerates garbled ASR and uses the patient's replies as
  evidence of what was actually asked"
git add docs/specs/2026-08-13-voice-only-mode.md
git commit -m "docs(spec): voice-only mode design"
```

---

### Task 1: หน้าดู transcript ใน admin

ทำก่อนเพราะไม่แตะ flow ของนักศึกษาเลย — ทีมมองเห็นข้อมูลก่อนพฤติกรรมจะเปลี่ยน

**Files:**
- Modify: `js/screens/summary.js` (เพิ่ม `_adminTranscriptBlock()` + เรียกใน `_renderSummaryUI`, แก้ `renderSummary` ให้ดึง session)
- Test: `setup/test/summary-admin-transcript.test.js` (สร้างใหม่)

**Interfaces:**
- Consumes: `isAdmin()` จาก `js/auth.js:38` · `getSessionById(sessionId)` จาก `js/db.js:124` · `escapeHtmlBr()` จาก `js/utils.js`
- Produces: `_adminTranscriptBlock(session)` → HTML string (คืน `''` เมื่อ `!isAdmin()` หรือไม่มี session)

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้มก่อน**

สร้าง `setup/test/summary-admin-transcript.test.js` — eval `summary.js` ใน Node ได้เพราะไฟล์นี้อ้าง `db`/`Router`/`getUserProfile` ตอนถูกเรียกเท่านั้น ไม่ใช่ตอนโหลด

```js
// ============================================================
//  summary-admin-transcript.test.js
//  บล็อก transcript ต้องโผล่เฉพาะ admin
//  firestore.rules ยอมให้นักศึกษาอ่าน session ของตัวเองได้
//  ถ้าเรนเดอร์ให้ทุกคน = ข้อมูลรั่วทันที
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'summary.js'), 'utf8');

function load({ admin }) {
  const sandbox = {
    isAdmin:       () => admin,
    escapeHtmlBr:  (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    escapeHtml:    (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  };
  const keys = Object.keys(sandbox);
  const fn = new Function(...keys,
    `${SRC}; return { _adminTranscriptBlock };`);
  return fn(...keys.map(k => sandbox[k]));
}

const SESSION = {
  chatHistory: [
    { role: 'user',  text: 'เจ็บคอมากี่วันแล้วครับ', via: 'live' },
    { role: 'model', text: 'สามวันค่ะ' },
    { role: 'model', text: 'แล้วก็มีไข้', via: 'live', interrupted: true },
  ],
  counselingHistory: [{ role: 'user', text: 'กินหลังอาหาร', via: 'webspeech' }],
  dispensedDrugs: [{ name: 'Amoxicillin', strength: '500mg', form: 'capsule' }],
  degraded: { level: 'L2', reason: 'mic-denied' },
};

test('นักศึกษาต้องไม่เห็นบล็อก transcript', () => {
  const { _adminTranscriptBlock } = load({ admin: false });
  assert.strictEqual(_adminTranscriptBlock(SESSION), '');
});

test('admin เห็นบทสนทนาทั้งสองขั้นตอน', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock(SESSION);
  assert.ok(html.includes('เจ็บคอมากี่วันแล้วครับ'), 'ต้องมีเทิร์น Step 1');
  assert.ok(html.includes('กินหลังอาหาร'),          'ต้องมีเทิร์น Step 3');
  assert.ok(html.includes('Amoxicillin'),           'ต้องมียาที่จ่าย');
});

test('สรุปจำนวนเทิร์นแยกตาม via', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock(SESSION);
  assert.ok(/live\s*2/.test(html),      'live ต้องนับได้ 2');
  assert.ok(/webspeech\s*1/.test(html), 'webspeech ต้องนับได้ 1');
});

test('แสดงแถบเตือนเมื่อเซสชันถูกลดระดับ', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  assert.ok(_adminTranscriptBlock(SESSION).includes('mic-denied'));
});

test('ไม่มี session ให้เรนเดอร์ = คืนค่าว่าง ไม่ throw', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  assert.strictEqual(_adminTranscriptBlock(null), '');
});

test('escape ข้อความจากผู้ใช้', () => {
  const { _adminTranscriptBlock } = load({ admin: true });
  const html = _adminTranscriptBlock({ chatHistory: [{ role: 'user', text: '<img src=x>' }] });
  assert.ok(!html.includes('<img src=x>'), 'ต้องไม่ปล่อย tag ดิบออกไป');
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd pharmbot-v2/setup && node --test test/summary-admin-transcript.test.js
```

Expected: FAIL — `_adminTranscriptBlock is not defined`

- [ ] **Step 3: เขียน `_adminTranscriptBlock()` ใน `summary.js`**

แทรกก่อนบรรทัดสุดท้ายของไฟล์ (หลัง `_feedbackBlock`)

```js
// ── บทสนทนาเต็ม (เฉพาะทีมงาน) ────────────────────────────────
// ⚠️ นักศึกษาต้องไม่เห็นบล็อกนี้ — firestore.rules ยอมให้เขาอ่าน
//    session ของตัวเองได้ การกันจึงต้องอยู่ที่ฝั่งเรนเดอร์ด้วย
function _adminTranscriptBlock(session) {
  if (!isAdmin() || !session) return '';

  const turns = [...(session.chatHistory || []), ...(session.counselingHistory || [])];
  const count = turns.reduce((acc, m) => {
    if (m.role !== 'user') return acc;
    const k = m.via || 'text';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const viaSummary = ['live', 'webspeech', 'text']
    .map(k => `${k} ${count[k] || 0}`).join(' · ');

  const line = (m) => {
    const who   = m.role === 'user' ? 'เภสัชกร' : (session.caseSnapshot?.name || 'ผู้ป่วย');
    const badge = m.role === 'user'
      ? `<span class="badge" style="font-size:0.65rem;">${escapeHtmlBr(m.via || 'text')}</span>` : '';
    const cut   = m.interrupted ? ' <span class="text-dim text-xs">(ถูกพูดแทรก)</span>' : '';
    return `
      <div class="checklist-item">
        <div class="checklist-text">
          <div class="text-sm"><strong>${escapeHtmlBr(who)}</strong> ${badge}${cut}</div>
          <div class="checklist-note">${escapeHtmlBr(m.text || '')}</div>
        </div>
      </div>`;
  };

  const drugs = (session.dispensedDrugs || [])
    .map(d => `${d.name} ${d.strength} (${d.form})`).join(', ');

  const deg = session.degraded;

  return `
    <details class="card mb-3">
      <summary style="cursor:pointer;font-weight:bold;">🗂️ บทสนทนาเต็ม (เฉพาะทีมงาน)</summary>
      <div class="text-dim text-sm mt-2 mb-2">คุณภาพ transcript: ${escapeHtmlBr(viaSummary)}</div>
      ${deg ? `<div class="alert alert-warning text-sm mb-2">⚠️ เซสชันนี้ถูกลดระดับเป็น ${escapeHtmlBr(deg.level || '?')} เพราะ ${escapeHtmlBr(deg.reason || 'ไม่ระบุ')}</div>` : ''}
      <h4 class="mb-1 mt-2">ขั้นที่ 1 — ซักประวัติ</h4>
      ${(session.chatHistory || []).map(line).join('') || '<div class="text-dim text-sm">(ไม่มี)</div>'}
      <h4 class="mb-1 mt-2">ยาที่จ่าย</h4>
      <div class="text-sm">${escapeHtmlBr(drugs || 'ไม่ได้จ่ายยา')}</div>
      <h4 class="mb-1 mt-2">ขั้นที่ 3 — ให้คำแนะนำ</h4>
      ${(session.counselingHistory || []).map(line).join('') || '<div class="text-dim text-sm">(ไม่มี)</div>'}
    </details>`;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd pharmbot-v2/setup && node --test test/summary-admin-transcript.test.js
```

Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 5: ต่อท่อข้อมูลเข้าหน้า summary**

ใน `js/screens/summary.js` แก้ `renderSummary()` — เปลี่ยนบล็อก `try` (บรรทัด 18–22) เป็น

```js
  try {
    const snap = await db.collection('results').doc(resultId).get();
    if (!snap.exists) { Router.go('history'); return; }
    const result = { id: snap.id, ...snap.data() };
    // ดึง session เฉพาะตอนเป็น admin — ชั้นกันข้อมูลรั่วชั้นที่ 1 (ไม่ดึงมาตั้งแต่แรก)
    let session = null;
    if (isAdmin() && result.sessionId) {
      session = await getSessionById(result.sessionId).catch(() => null);
    }
    _renderSummaryUI(container, pid, result, session);
  } catch (e) {
```

แก้ signature และเพิ่มการเรียกใน `_renderSummaryUI`:

```js
function _renderSummaryUI(container, pid, result, session = null) {
```

แล้วแทรก `${_adminTranscriptBlock(session)}` ต่อจากบล็อก guideline references (ก่อน `<!-- Actions -->`)

- [ ] **Step 6: รันชุดเทสต์ทั้งหมด**

```bash
cd pharmbot-v2/setup && npm test
```

Expected: เทสต์ใหม่ 6 ตัวผ่าน · ยอดรวมเดิม 80 ผ่านเท่าเดิม · `summary-citations.test.js` ยังล้มเหมือนเดิม (ล้มมาก่อนแล้ว เป็นเทสต์ที่ค้นหา `_escS` ซึ่งถูกยุบไปใช้ `escapeHtmlBr` กลางแล้ว — **ไม่ใช่ของใหม่ที่พัง**)

- [ ] **Step 7: commit**

```bash
git add js/screens/summary.js setup/test/summary-admin-transcript.test.js
git commit -m "feat(admin): show full session transcript on the result page

Gated on isAdmin() twice — the session is not even fetched for students,
because firestore.rules lets them read their own session document."
```

---

### Task 2: ช่องแจ้งเตือนถาวร `_notify()`

ต้องมาก่อนซ่อนฟองแชท ไม่งั้นข้อความ system จะกลายเป็นล่องหน

**Files:**
- Modify: `js/screens/chat.js` (เพิ่ม `_notify()`, เพิ่ม element ใน panel 1 + panel 3, เปลี่ยนจุดเรียก 4 จุด)
- Modify: `css/main.css` (เพิ่ม `.voice-notice`)
- Test: `setup/test/chat-notify.test.js` (สร้างใหม่)

**Interfaces:**
- Produces: `_notify(panelStep, msg)` — เขียนลง `#voice-notice-{panelStep}` และเรียก `_addMsg(containerId, 'system', msg)`

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้มก่อน**

`chat.js` มีโค้ดระดับโมดูลที่แตะ `localStorage` จึง eval ใน Node ไม่ได้ — ทดสอบที่ระดับซอร์สแบบเดียวกับ `admin-rubric-passthrough.test.js`

สร้าง `setup/test/chat-notify.test.js`

```js
// ============================================================
//  chat-notify.test.js
//  พอซ่อนฟองแชท ข้อความ system ที่ยิงผ่าน _addMsg จะมองไม่เห็น
//  ทุกจุดที่แจ้งผู้ใช้ต้องผ่าน _notify() ซึ่งเขียนลงช่องแจ้งเตือนด้วย
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'screens', 'chat.js'), 'utf8');

// เทสต์เดียวที่คุ้มค่าจะจับ source: มันกันบั๊กที่ Playwright มองไม่เห็น
// (ข้อความแจ้งเตือนที่ยิงลงฟองแชทที่ถูกซ่อน = ผู้เรียนไม่รู้ว่าระบบล่ม)
// พฤติกรรมอื่นของ _notify ถูกตรวจใน tests/specs/04-voice-ui.spec.js แทน
test('ข้อความแจ้งว่าเสียงใช้ไม่ได้ต้องไม่ยิงลงฟองแชทตรงๆ', () => {
  const rawFailureNotices = SRC.match(
    /_addMsg\([^)]*'system'[^)]*(Live API|ไม่รองรับการรู้จำเสียง|ไม่สามารถเริ่มรับเสียง)/g);
  assert.strictEqual(rawFailureNotices, null,
    'ต้องยิงผ่าน _notify ไม่ใช่ _addMsg ตรงๆ ไม่งั้นข้อความจะมองไม่เห็นเมื่อฟองแชทถูกซ่อน');
});
```

**หมายเหตุ:** เทสต์ตัวอื่นที่เคยร่างไว้ (ตรวจว่ามีฟังก์ชัน `_notify` / มี element `#voice-notice-N`) ถูกตัดออกโดยเจตนา — เป็นการจับคู่สตริงที่พังเวลา refactor โดยไม่ได้กันบั๊กจริง พฤติกรรมเหล่านั้นถูกตรวจแบบ end-to-end ใน Task 6 แล้ว

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd pharmbot-v2/setup && node --test test/chat-notify.test.js
```

Expected: FAIL — ยังมีข้อความแจ้งเตือนยิงผ่าน `_addMsg` ตรงๆ อยู่

- [ ] **Step 3: เพิ่ม element ในทั้งสอง panel**

ใน `js/screens/chat.js` ต่อท้ายบรรทัด `<div class="voice-subtitle" id="voice-subtitle-1" ...></div>` (บรรทัด 200) เพิ่ม

```html
          <div class="voice-notice" id="voice-notice-1" style="position:relative;z-index:2;"></div>
```

และทำแบบเดียวกันกับ `voice-subtitle-3` ใน panel 3 โดยใช้ `id="voice-notice-3"`

- [ ] **Step 4: เพิ่ม `_notify()`**

วางไว้ถัดจาก `_setVoiceStatus` (ค้นด้วย `grep -n "function _setVoiceStatus" js/screens/chat.js`)

```js
// แจ้งผู้ใช้แบบค้างจนกว่าจะมีข้อความใหม่
// ห้ามใช้ _setVoiceStatus แทน — onStateChange เขียนทับมันตลอดเวลา ข้อความจะหายใน 2-3 วินาที
function _notify(panelStep, msg) {
  const el = document.getElementById(`voice-notice-${panelStep}`);
  if (el) el.textContent = msg;
  // ยังลง log เหมือนเดิม เพื่อให้ทีมเห็นใน transcript ว่านักศึกษาเจออะไร
  _addMsg(panelStep === 1 ? 'chat-messages' : 'counsel-messages', 'system', msg);
}
```

- [ ] **Step 5: ย้ายจุดแจ้งเตือนทั้ง 4 จุดมาใช้ `_notify`**

| บรรทัดเดิม | เปลี่ยนเป็น |
|---|---|
| `_addMsg(msgId, 'system', '⚠️ Live API ไม่พร้อมใช้ — สลับไป Web Speech');` (ใน `client.onError`) | `_notify(panelStep, '⚠️ ระบบเสียงขัดข้อง กำลังสลับไปโหมดสำรอง');` |
| `_addMsg(msgId, 'system', '⚠️ Live API ไม่พร้อมใช้ — สลับไป Web Speech');` (ใน `catch` ของ connect) | `_notify(panelStep, '⚠️ เชื่อมต่อระบบเสียงไม่ได้ กำลังสลับไปโหมดสำรอง');` |
| `_addMsg(msgId, 'system', '⚠️ เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');` | `_notify(panelStep, '⚠️ เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');` |
| `_addMsg(msgId, 'system', \`⚠️ ไม่สามารถเริ่มรับเสียงได้: ${e.message}\`);` | `_notify(panelStep, \`⚠️ ไม่สามารถเริ่มรับเสียงได้: ${e.message}\`);` |

ข้อความถูกเขียนใหม่ให้ไม่พูดถึงชื่อ API — นักศึกษาไม่จำเป็นต้องรู้ว่า "Live API" คืออะไร

- [ ] **Step 6: เพิ่ม CSS**

ใน `css/main.css` วางต่อจากกฎ `.voice-subtitle` (ค้นด้วย `grep -n "voice-subtitle" css/main.css`)

```css
.voice-notice {
  margin-top: 0.5rem;
  min-height: 1.2em;
  font-size: 0.85rem;
  color: var(--warning);
  text-align: center;
}
```

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

```bash
cd pharmbot-v2/setup && node --test test/chat-notify.test.js
```

Expected: PASS

- [ ] **Step 8: commit**

```bash
git add js/screens/chat.js css/main.css setup/test/chat-notify.test.js
git commit -m "feat(chat): persistent notice channel for voice failures

_setVoiceStatus is overwritten by every state change, so failure messages
vanished within seconds. _notify writes to a dedicated element and still
logs a system turn for the team."
```

---

### Task 3: ตรรกะบันไดสำรอง (ไฟล์บริสุทธิ์)

**หมายเหตุการเบี่ยงจากสเปก:** สเปกเขียนว่า `_nextLevel()` อยู่ใน `chat.js` แต่ `chat.js` แตะ `localStorage` ตั้งแต่ระดับโมดูล จึง eval ใน Node ไม่ได้ → แยกเป็นไฟล์ของตัวเองเพื่อให้ทดสอบพฤติกรรมได้จริงแทนการจับคู่สตริง ตรงตามเจตนาของสเปกที่ว่า "แยกการตัดสินใจออกจาก DOM เพื่อให้ทดสอบใน Node ได้"

**Files:**
- Create: `js/voice-ladder.js`
- Modify: `index.html` (เพิ่ม `<script>` ก่อน `screens/chat.js`)
- Test: `setup/test/voice-ladder.test.js` (สร้างใหม่)

**Interfaces:**
- Produces: `nextVoiceLevel(current, failureKind)` → `'L0' | 'L1' | 'L2'` — ฟังก์ชันบริสุทธิ์ ไม่มี side effect ไม่แตะ DOM

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้มก่อน**

สร้าง `setup/test/voice-ladder.test.js`

```js
// ============================================================
//  voice-ladder.test.js
//  โหมดฉุกเฉินจะไม่ถูกใช้จนกว่าจะเกิดเหตุจริง
//  ตรรกะการลดระดับจึงต้องพิสูจน์ได้โดยไม่ต้องรอให้ระบบล่ม
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'voice-ladder.js'), 'utf8');
const { nextVoiceLevel } = new Function(`${SRC}; return { nextVoiceLevel };`)();

test('ไมค์ถูกปฏิเสธ ต้องข้าม L1 ไป L2 เลย', () => {
  // Web Speech ใช้ไมค์ตัวเดียวกัน ลองไปก็ล้มซ้ำ เสียเวลาผู้เรียนเปล่า
  assert.strictEqual(nextVoiceLevel('L0', 'mic-denied'), 'L2');
});

test('Live ต่อไม่ติด ลงแค่ L1', () => {
  assert.strictEqual(nextVoiceLevel('L0', 'live-connect-failed'), 'L1');
});

test('Live พังกลางคัน ลงแค่ L1', () => {
  assert.strictEqual(nextVoiceLevel('L0', 'live-runtime-error'), 'L1');
});

test('เบราว์เซอร์ไม่มี SpeechRecognition ลง L2', () => {
  assert.strictEqual(nextVoiceLevel('L1', 'no-speech-api'), 'L2');
});

test('Web Speech ถูกปฏิเสธสิทธิ์ ลง L2', () => {
  assert.strictEqual(nextVoiceLevel('L1', 'speech-not-allowed'), 'L2');
});

test('ความผิดพลาดชั่วคราวต้องไม่ลดระดับ', () => {
  for (const lvl of ['L0', 'L1', 'L2']) {
    assert.strictEqual(nextVoiceLevel(lvl, 'no-speech'), lvl);
    assert.strictEqual(nextVoiceLevel(lvl, 'network'),   lvl);
  }
});

test('ลงแล้วห้ามขึ้น', () => {
  assert.strictEqual(nextVoiceLevel('L2', 'live-connect-failed'), 'L2');
  assert.strictEqual(nextVoiceLevel('L2', 'mic-denied'),          'L2');
  assert.strictEqual(nextVoiceLevel('L1', 'live-connect-failed'), 'L1');
});

test('failureKind ที่ไม่รู้จักต้องไม่ลดระดับ', () => {
  assert.strictEqual(nextVoiceLevel('L0', 'อะไรก็ไม่รู้'), 'L0');
  assert.strictEqual(nextVoiceLevel('L0', undefined),      'L0');
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd pharmbot-v2/setup && node --test test/voice-ladder.test.js
```

Expected: FAIL — `ENOENT ... js/voice-ladder.js`

- [ ] **Step 3: สร้าง `js/voice-ladder.js`**

```js
// ============================================================
//  voice-ladder.js — ตรรกะการลดระดับโหมดเสียง (ฟังก์ชันบริสุทธิ์)
//
//  L0 = Gemini Live API   (ปกติ)
//  L1 = Web Speech + TTS  (ยังเป็นเสียง)
//  L2 = โหมดพิมพ์ฉุกเฉิน   (ฟองแชท + ช่องพิมพ์โผล่)
//
//  ลงได้อย่างเดียว ขึ้นไม่ได้ — ผู้เรียนจะได้ไม่เจอโหมดสลับไปมากลางเคส
//  ไม่แตะ DOM เพื่อให้ทดสอบใน Node ได้ (โหมดฉุกเฉินแทบไม่มีวันถูกใช้จริง
//  ถ้าไม่มีเทสต์ก็จะไม่มีใครรู้ว่ามันพัง)
// ============================================================

const VOICE_LEVELS = ['L0', 'L1', 'L2'];

// failureKind -> ระดับต่ำสุดที่ต้องลงไปให้ถึง
const VOICE_FAILURE_FLOOR = {
  'mic-denied':          'L2',  // Web Speech ใช้ไมค์ตัวเดียวกัน ข้าม L1 ไปเลย
  'no-speech-api':       'L2',
  'speech-not-allowed':  'L2',
  'live-connect-failed': 'L1',
  'live-runtime-error':  'L1',
};

function nextVoiceLevel(current, failureKind) {
  const floor = VOICE_FAILURE_FLOOR[failureKind];
  if (!floor) return current;                    // ชั่วคราว/ไม่รู้จัก = คงเดิม
  const ci = VOICE_LEVELS.indexOf(current);
  const fi = VOICE_LEVELS.indexOf(floor);
  return fi > ci ? floor : current;              // ลงได้อย่างเดียว
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd pharmbot-v2/setup && node --test test/voice-ladder.test.js
```

Expected: PASS ทั้ง 8 เทสต์

- [ ] **Step 5: เพิ่ม `<script>` ใน `index.html`**

หา `<script src="js/screens/chat.js` แล้วแทรกบรรทัดนี้ **ก่อนหน้ากลุ่ม `screens/`** (ไม่มี dependency วางที่ไหนก็ได้ ขอแค่มาก่อน `chat.js`)

```html
<script src="js/voice-ladder.js"></script>
```

ยืนยันด้วย

```bash
cd pharmbot-v2 && grep -n "voice-ladder\|screens/chat" index.html
```

Expected: บรรทัดของ `voice-ladder.js` มีเลขบรรทัดน้อยกว่า `screens/chat.js`

- [ ] **Step 6: commit**

```bash
git add js/voice-ladder.js index.html setup/test/voice-ladder.test.js
git commit -m "feat(voice): pure fallback-ladder logic, unit tested

Emergency mode is code that never runs until something breaks, so the
decision table lives in its own DOM-free file and is proven by tests."
```

---

### Task 4: เปิด voice-only และซ่อน UI โหมดพิมพ์

**Files:**
- Modify: `js/screens/chat.js` (ค่าคงที่ + markup + `_switchMode` + `_revealEmergencyText`)
- Test: `tests/specs/04-voice-ui.spec.js` (เขียนใหม่ทั้งไฟล์ — ปัจจุบัน fail อยู่)

**หมายเหตุการเปลี่ยนจากแผนฉบับแรก:** เทสต์ของ task นี้เป็น Playwright ไม่ใช่เทสต์ที่ regex จับ source
เพราะสิ่งที่ต้องพิสูจน์คือ "ผู้เรียนไม่เห็นฟองแชท" ซึ่งเป็นพฤติกรรมของ DOM จริง
ไม่ใช่รูปร่างของโค้ด — และเทสต์จับสตริงจะพังเวลา refactor โดยไม่ได้กันบั๊กอะไร

**Interfaces:**
- Consumes: —
- Produces: `VOICE_ONLY` (const, ค่า `true`) · `_emergencyText` (let, ค่าเริ่มต้น `false`) · `_revealEmergencyText(panelStep, reason)`

- [ ] **Step 1: อ่านของเดิมและ config ก่อนเขียนทับ**

```bash
cd pharmbot-v2 && cat tests/specs/04-voice-ui.spec.js && cat tests/helpers/auth.js
```

ยืนยันแล้วว่า: `loginAs(page, participantId, password)` · env มี `STUDENT_ID` / `STUDENT_PASSWORD` ·
`playwright.config.js` ตั้ง `baseURL: http://localhost:3000` พร้อม `webServer` ที่ `npx serve .`
(ทดสอบโค้ดในเครื่อง ไม่ใช่ตัวที่ deploy แล้ว)

- [ ] **Step 2: เขียนเทสต์ที่ต้องล้มก่อน**

แทนที่เนื้อไฟล์ `tests/specs/04-voice-ui.spec.js` ทั้งไฟล์ด้วย

```js
// ============================================================
//  04-voice-ui.spec.js
//  โหมดเสียงล้วน — ผู้เรียนต้องไม่เห็นฟองแชท/ช่องพิมพ์
//  และโหมดฉุกเฉินต้องเรียกกลับมาได้จริง (ไม่ใช้ไมโครโฟนจริง)
// ============================================================

const { test, expect } = require('@playwright/test');
const { loginAs } = require('../helpers/auth');

const STUDENT_ID = process.env.STUDENT_ID;
const STUDENT_PW = process.env.STUDENT_PASSWORD;

test.beforeEach(async ({ page }) => {
  await loginAs(page, STUDENT_ID, STUDENT_PW);
  await page.goto('/#groups');
  await page.locator('.group-card, .case-card').first().click();
  await expect(page.locator('#panel-1')).toBeVisible();
});

test('ไม่มีแท็บสลับโหมดให้กด', async ({ page }) => {
  await expect(page.locator('.mode-switcher')).toHaveCount(0);
  await expect(page.locator('#tab-text-1')).toHaveCount(0);
});

test('ฟองแชทถูกซ่อนแต่ DOM ยังอยู่', async ({ page }) => {
  await expect(page.locator('#chat-messages')).toHaveCount(1);
  await expect(page.locator('#panel-1 .transcript-wrap')).toBeHidden();
});

test('ช่องพิมพ์ถูกซ่อน', async ({ page }) => {
  await expect(page.locator('#text-input-row-1')).toBeHidden();
});

test('เวทีเสียง ซับไตเติล และช่องแจ้งเตือนยังอยู่', async ({ page }) => {
  await expect(page.locator('#voice-input-row-1')).toBeVisible();
  await expect(page.locator('#voice-subtitle-1')).toHaveCount(1);
  await expect(page.locator('#voice-notice-1')).toHaveCount(1);
});

test('สลับเป็นโหมดพิมพ์ด้วยมือไม่ได้', async ({ page }) => {
  await page.evaluate(() => _switchMode(1, 'text'));
  await expect(page.locator('#text-input-row-1')).toBeHidden();
});

test('โหมดฉุกเฉินเปิดฟองแชท ช่องพิมพ์ และข้อความแจ้ง', async ({ page }) => {
  await page.evaluate(() => _revealEmergencyText(1, 'mic-denied'));
  await expect(page.locator('#panel-1 .transcript-wrap')).toBeVisible();
  await expect(page.locator('#text-input-row-1')).toBeVisible();
  await expect(page.locator('#voice-notice-1')).toContainText('พิมพ์คุยกับผู้ป่วย');
});

test('เปิดโหมดฉุกเฉินซ้ำแล้วไม่พัง', async ({ page }) => {
  await page.evaluate(() => {
    _revealEmergencyText(1, 'mic-denied');
    _revealEmergencyText(1, 'no-speech-api');
  });
  await expect(page.locator('#text-input-row-1')).toBeVisible();
});
```

- [ ] **Step 3: รันให้เห็นว่าล้ม**

```bash
cd pharmbot-v2 && npx playwright test tests/specs/04-voice-ui.spec.js --reporter=line
```

Expected: FAIL — ยังมี `.mode-switcher` อยู่ · `.transcript-wrap` ยังไม่ถูกซ่อน · `_revealEmergencyText` is not defined
ถ้า selector ของการเข้าเคส (`.group-card`/`.case-card`) ไม่ตรงกับ UI จริง ให้แก้ `beforeEach` ให้ตรง **อย่าแก้ assertion เพื่อให้ผ่าน**

- [ ] **Step 4: ประกาศค่าคงที่**

ใน `js/screens/chat.js` ใต้บล็อกตัวแปรระดับบนสุด (ใกล้ `let _voiceMode` บรรทัด 18) เพิ่ม

```js
// ── โหมดเสียงล้วน ────────────────────────────────────────────
// true  = โหมดพิมพ์หายจาก UI ปกติ เหลือเป็นโหมดฉุกเฉินที่โผล่เองเมื่อเสียงล้ม
// false = กลับไปเป็นแอปแบบเดิมทุกประการ (ทางถอยที่ไม่ต้อง revert commit)
// ⚠️ ต้อง freeze ค่านี้ก่อนเก็บข้อมูลจริง ห้ามแก้กลางการทดลอง
const VOICE_ONLY = true;

let _emergencyText = false;   // true = ลงถึง L2 แล้ว ห้ามกลับไปเป็นเสียงอีกทั้งเซสชัน
```

- [ ] **Step 5: ซ่อน UI ใน markup**

แก้ 4 จุดใน template ของ `renderChat()`

1. `.transcript-wrap` ของ panel 1 (บรรทัด 179) และ panel 3 (บรรทัด 242):

```html
        <div class="transcript-wrap${VOICE_ONLY ? ' hidden' : ''}">
```

2. `#text-input-row-1` (บรรทัด 204) และ `#text-input-row-3` — เดิมมี `hidden` อยู่แล้ว ไม่ต้องแก้

3. บล็อก `.mode-switcher` ของทั้งสอง panel — ครอบด้วยเงื่อนไข:

```html
          ${VOICE_ONLY ? '' : `
          <div class="mode-switcher">
            <button class="mode-btn active" id="tab-voice-1" onclick="_switchMode(1,'voice')">🎙️ เสียง</button>
            <button class="mode-btn" id="tab-text-1" onclick="_switchMode(1,'text')">💬 ข้อความ</button>
          </div>`}
```

(panel 3 ใช้เลข 3 แทน 1)

4. `.tts-check` (บรรทัด 217–219) — ครอบด้วย `${VOICE_ONLY ? '' : \`…\`}` แบบเดียวกัน

- [ ] **Step 6: กันการสลับโหมดด้วยมือ + เพิ่มฟังก์ชันเปิดโหมดฉุกเฉิน**

แก้หัว `_switchMode` (บรรทัด 413):

```js
async function _switchMode(panelStep, mode) {
  // โหมดเสียงล้วน: ห้ามสลับเป็นโหมดพิมพ์ด้วยมือ เข้าได้ทางเดียวคือ _revealEmergencyText
  if (VOICE_ONLY && mode === 'text') return;
```

เพิ่มฟังก์ชันใหม่ถัดจาก `_switchMode`:

```js
// เปิดโหมดพิมพ์ฉุกเฉิน — ทางเดียวที่ผู้เรียนจะได้พิมพ์เมื่อ VOICE_ONLY
// เรียกเมื่อบันไดสำรองลงถึง L2 แล้วเท่านั้น
function _revealEmergencyText(panelStep, reason) {
  if (_emergencyText) return;
  _emergencyText = true;
  _stopVoice();

  const panel = document.getElementById(`panel-${panelStep}`);
  panel?.querySelector('.transcript-wrap')?.classList.remove('hidden');
  document.getElementById(`text-input-row-${panelStep}`)?.classList.remove('hidden');
  document.getElementById(`voice-input-row-${panelStep}`)?.classList.add('hidden');

  _notify(panelStep, '⚠️ ระบบเสียงใช้งานไม่ได้ กรุณาพิมพ์คุยกับผู้ป่วยแทน — ผลการฝึกยังบันทึกตามปกติ');
  console.warn('voice ladder → L2:', reason);
}
```

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

```bash
cd pharmbot-v2 && npx playwright test tests/specs/04-voice-ui.spec.js --reporter=line
cd setup && npm test
```

Expected: Playwright ผ่านทั้ง 7 เทสต์ · ชุด `node:test` ไม่มีตัวใหม่ล้ม

- [ ] **Step 8: commit**

```bash
git add js/screens/chat.js tests/specs/04-voice-ui.spec.js
git commit -m "feat(chat): voice-only session flow behind a single flag

Chat bubbles and the text input stay in the DOM but hidden, so emergency
mode only has to drop a class and the backlog is already rendered."
```

---

### Task 5: ต่อบันไดสำรองเข้ากับ flow จริง + บันทึกการลดระดับ

**Files:**
- Modify: `js/db.js` (เพิ่ม `markSessionDegraded`)
- Modify: `js/screens/chat.js` (ใช้ `nextVoiceLevel`, ป้อนซับไตเติลที่ L1)
- Modify: `CLAUDE.md`
- Test: `setup/test/db-degraded.test.js` (สร้างใหม่)

**Interfaces:**
- Consumes: `nextVoiceLevel(current, failureKind)` จาก Task 3 · `_revealEmergencyText(panelStep, reason)` จาก Task 4 · `_notify(panelStep, msg)` จาก Task 2
- Produces: `markSessionDegraded(sessionId, level, reason)` · `_voiceLevel` (let, ค่าเริ่มต้น `'L0'`) · `_degrade(panelStep, failureKind)`

- [ ] **Step 1: เขียนเทสต์ที่ต้องล้มก่อน**

สร้าง `setup/test/db-degraded.test.js`

```js
// ============================================================
//  db-degraded.test.js
//  /sessions ต้องบันทึกว่าเซสชันนี้หลุดไประดับไหน
//  ทีมจะได้แยกออกว่าเป็นปัญหาเทคนิค ไม่ใช่ผู้เรียนทำไม่ได้
// ============================================================

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'js', 'db.js'), 'utf8');

function load() {
  const captured = {};
  const firebase = {
    firestore: { FieldValue: { serverTimestamp: () => '<ts>' } },
  };
  const db = {
    collection: (c) => ({
      doc: (d) => ({
        update: async (payload) => { Object.assign(captured, { c, d, payload }); },
      }),
    }),
  };
  const fn = new Function('db', 'firebase',
    `${SRC}; return { markSessionDegraded };`);
  return { ...fn(db, firebase), captured };
}

test('เขียน degraded ลง /sessions ครบทุก field', async () => {
  const { markSessionDegraded, captured } = load();
  await markSessionDegraded('sess1', 'L2', 'mic-denied');
  assert.strictEqual(captured.c, 'sessions');
  assert.strictEqual(captured.d, 'sess1');
  assert.deepStrictEqual(captured.payload, {
    degraded: { level: 'L2', reason: 'mic-denied', at: '<ts>' },
  });
});

test('เรียกซ้ำแล้วเขียนทับด้วยระดับล่าสุด', async () => {
  const { markSessionDegraded, captured } = load();
  await markSessionDegraded('sess1', 'L1', 'live-connect-failed');
  await markSessionDegraded('sess1', 'L2', 'no-speech-api');
  assert.strictEqual(captured.payload.degraded.level,  'L2');
  assert.strictEqual(captured.payload.degraded.reason, 'no-speech-api');
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าล้ม**

```bash
cd pharmbot-v2/setup && node --test test/db-degraded.test.js
```

Expected: FAIL — `markSessionDegraded is not defined`

- [ ] **Step 3: เพิ่ม `markSessionDegraded` ใน `js/db.js`**

วางต่อจาก `updateSessionCounseling` (บรรทัด 66)

```js
// บันทึกว่าเซสชันนี้หลุดจากโหมดเสียงปกติ — เขียนทับด้วยระดับล่าสุดเสมอ
// ไม่เก็บประวัติการไล่ระดับ เพราะสิ่งที่ทีมต้องรู้คือมันจบที่ระดับไหน
async function markSessionDegraded(sessionId, level, reason) {
  await db.collection('sessions').doc(sessionId).update({
    degraded: { level, reason, at: firebase.firestore.FieldValue.serverTimestamp() },
  });
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```bash
cd pharmbot-v2/setup && node --test test/db-degraded.test.js
```

Expected: PASS ทั้ง 2 เทสต์

- [ ] **Step 5: เพิ่มตัวจัดการการลดระดับใน `chat.js`**

เพิ่มตัวแปรถัดจาก `let _emergencyText = false;`

```js
let _voiceLevel = 'L0';   // ระดับปัจจุบันของบันไดสำรอง (ดู js/voice-ladder.js)
```

เพิ่มฟังก์ชันถัดจาก `_revealEmergencyText`

```js
// ประตูเดียวสำหรับ "เสียงมีปัญหา" — ตัดสินระดับถัดไป ลงมือ แล้วบันทึกไว้ให้ทีม
function _degrade(panelStep, failureKind) {
  const next = nextVoiceLevel(_voiceLevel, failureKind);
  if (next === _voiceLevel) return next;   // ชั่วคราว ไม่ต้องทำอะไร
  _voiceLevel = next;

  if (_session?.id) {
    markSessionDegraded(_session.id, next, failureKind).catch(() => {});
  }
  if (next === 'L2') _revealEmergencyText(panelStep, failureKind);
  return next;
}
```

- [ ] **Step 6: เรียก `_degrade` แทนการ fallback ตรงๆ**

ใน `_startVoice()`:

```js
    client.onError = (errMsg) => {
      if (!_liveMode || !_voiceMode || _voicePanelStep !== panelStep) return;
      console.warn('GeminiLive error:', errMsg);
      try { _liveClient?.disconnect(); } catch (_) {}
      _liveClient = null;
      _liveMode   = false;
      _notify(panelStep, '⚠️ ระบบเสียงขัดข้อง กำลังสลับไปโหมดสำรอง');
      if (_degrade(panelStep, 'live-runtime-error') === 'L1') _startVoiceWebSpeech(panelStep);
    };
```

ใน `catch` ของ `await client.connect(...)` — แยกกรณีไมค์ถูกปฏิเสธออกจากกรณี API ล่ม:

```js
    } catch (e) {
      _liveConnecting = false;
      console.warn('GeminiLive connect failed:', e.message);
      try { client.disconnect(); } catch (_) {}
      if (!_voiceMode || _voicePanelStep !== panelStep) return;
      // ไมค์ถูกปฏิเสธ = Web Speech ก็ใช้ไมค์ตัวเดียวกัน ลองไปก็ล้มซ้ำ
      const kind = /ไมโครโฟน/.test(e.message) ? 'mic-denied' : 'live-connect-failed';
      _notify(panelStep, kind === 'mic-denied'
        ? '⚠️ ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตสิทธิ์ไมโครโฟนแล้วลองใหม่'
        : '⚠️ เชื่อมต่อระบบเสียงไม่ได้ กำลังสลับไปโหมดสำรอง');
      if (_degrade(panelStep, kind) === 'L2') return;
    }
```

ใน `_startVoiceWebSpeech()` แทนที่ `_switchMode(panelStep, 'text')` ทั้ง 2 จุด:

```js
  if (!SpeechRec) {
    _notify(panelStep, '⚠️ เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียง กรุณาใช้ Chrome หรือ Edge');
    _degrade(panelStep, 'no-speech-api');
    return;
  }
```

```js
  } catch (e) {
    _notify(panelStep, `⚠️ ไม่สามารถเริ่มรับเสียงได้: ${e.message}`);
    _degrade(panelStep, 'speech-not-allowed');
  }
```

และใน `_voiceRecognition.onerror` ให้ยกระดับเฉพาะสาเหตุที่แก้ไม่ได้:

```js
  _voiceRecognition.onerror = (e) => {
    if (e.error === 'no-speech') return; // ปกติ — onend จะ restart ให้
    console.warn('SpeechRecognition error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'audio-capture') {
      _degrade(panelStep, 'speech-not-allowed');
      return;
    }
    if (_voiceMode) _setVoiceStatus(panelStep, `⚠️ ไม่สามารถรับเสียงได้ (${e.error})`, false);
  };
```

- [ ] **Step 7: ป้อนซับไตเติลที่ L1 เพื่อไม่ให้จอเงียบสนิท**

ใน `_sendChat()` หลังบรรทัด `_addMsg('chat-messages', 'model', reply);` เพิ่ม

```js
    // L1: ฟองแชทถูกซ่อน ถ้าไม่ป้อนซับไตเติลผู้เรียนจะไม่เห็นอะไรเลย
    // ที่ L2 ไม่ต้อง เพราะฟองแชทถูกเปิดกลับมาแล้ว
    if (VOICE_ONLY && !_emergencyText) {
      const sub = document.getElementById('voice-subtitle-1');
      if (sub) sub.textContent = reply;
    }
```

ทำแบบเดียวกันใน `_sendCounseling()` โดยใช้ `voice-subtitle-3`

- [ ] **Step 8: รันชุดเทสต์ทั้งหมด**

```bash
cd pharmbot-v2/setup && npm test
```

Expected: เทสต์ใหม่ทุกตัวผ่าน · `summary-citations.test.js` ยังล้มเหมือนเดิม (ล้มมาก่อนแผนนี้)

- [ ] **Step 9: รัน smoke test ยืนยันว่า Live ยังต่อติด**

สคริปต์ smoke test อยู่ใน scratchpad ของเซสชันที่สร้างมัน ไม่ได้อยู่ใน repo (ต้องใช้ `setup/serviceAccountKey.json`)

```bash
cd pharmbot-v2/setup && node "C:/Users/winusr/AppData/Local/Temp/claude/D--PROJECT/21922ba4-9018-4cf3-9acb-7c32c697bf22/scratchpad/live-smoke.js"
```

**ถ้าไฟล์ไม่อยู่แล้ว ให้ข้ามขั้นนี้** — Task 5 ไม่ได้แตะ `gemini-live.js` เลย setup payload จึงไม่เปลี่ยน ยืนยันด้วยเช็คลิสต์ manual ใน Task 7 แทน
Expected: `setupComplete: YES` และมี audio chunks > 0

- [ ] **Step 10: อัปเดต CLAUDE.md**

ในหัวข้อ `## Voice Mode (Gemini Live)` เพิ่มท้ายหัวข้อ

```markdown
**โหมดเสียงล้วน (`VOICE_ONLY` ใน `chat.js`)** — โหมดพิมพ์ไม่อยู่ใน UI ปกติแล้ว
ฟองแชทถูกซ่อนจากผู้เรียน (DOM ยังอยู่ครบ) ทีมดู transcript ได้ที่หน้า summary เมื่อล็อกอินเป็น admin

บันไดสำรอง `L0 Live → L1 Web Speech → L2 โหมดพิมพ์ฉุกเฉิน` ลงได้อย่างเดียว
ตรรกะอยู่ใน `js/voice-ladder.js` (ฟังก์ชันบริสุทธิ์ มี unit test) การลดระดับถูกบันทึกลง
`/sessions.degraded` เพื่อให้ทีมคัดเซสชันที่เจอปัญหาเทคนิคออกจากการวิเคราะห์ได้
— และเพราะ L1/L2 ใช้โมเดลข้อความ field นี้จึงเป็นบันทึก treatment fidelity ในตัว
```

ในหัวข้อ `### Phase 5 — Validation & Testing` เพิ่ม

```markdown
- [ ] ทดสอบโหมดฉุกเฉินด้วยมือก่อนเก็บข้อมูลจริง (ปฏิเสธสิทธิ์ไมค์ → ต้องลง L2 ทันที)
```

- [ ] **Step 11: commit**

```bash
git add js/db.js js/screens/chat.js CLAUDE.md setup/test/db-degraded.test.js
git commit -m "feat(voice): wire the fallback ladder and record degradations

Every voice failure now goes through one gate that picks the next level,
acts on it, and writes /sessions.degraded so the team can tell a technical
failure apart from a student who could not do the task."
```

---

### Task 6: ประตูตรวจถอยหลัง (regression gate)

Playwright spec ถูกเขียนไปแล้วใน Task 4 (เป็นเทสต์ที่ต้องล้มก่อนของ task นั้น)
task นี้ยืนยันว่าหลังต่อบันไดสำรองใน Task 5 แล้วไม่มีอะไรถอยหลัง

**Files:** ไม่มี (ตรวจอย่างเดียว — ถ้าเจอปัญหาให้แก้ที่ไฟล์ต้นเหตุแล้ว commit แยก)

- [ ] **Step 1: รันชุด node:test ทั้งหมด**

```bash
cd pharmbot-v2/setup && npm test
```

Expected: เทสต์ที่แผนนี้เพิ่ม (`summary-admin-transcript`, `chat-notify`, `voice-ladder`, `db-degraded`) ผ่านครบ
· `summary-citations.test.js` ยังล้มเหมือนเดิม — ล้มมาก่อนแผนนี้ ไม่ใช่ regression
· **ห้ามมีตัวอื่นล้มเพิ่ม**

- [ ] **Step 2: รัน Playwright ทั้งชุด ไม่ใช่แค่ spec เดียว**

```bash
cd pharmbot-v2 && npx playwright test --reporter=line
```

Expected: `04-voice-ui.spec.js` ผ่านครบ 7 · `01-login` ผ่าน
· `02-student-flow.spec.js` และ `03-admin.spec.js` — เทียบกับผลก่อนเริ่มแผนนี้
(`02-student-flow` fail อยู่ก่อนแล้วตาม CLAUDE.md) **ห้ามมีตัวที่เคยผ่านแล้วกลายเป็นล้ม**

- [ ] **Step 3: ถ้ามี regression ให้แก้แล้ว commit แยก**

```bash
git add -A && git commit -m "fix(voice): <อาการที่แก้>"
```

ถ้าไม่มี regression ไม่ต้อง commit อะไรใน task นี้

---

### Task 7: ตรวจด้วยมือและปิดงาน

**Files:** ไม่มี (ตรวจอย่างเดียว)

- [ ] **Step 1: เปิดแอปในเครื่อง**

```bash
cd pharmbot-v2 && npx serve .
```

- [ ] **Step 2: เช็คลิสต์ที่ต้องมีคนพูดจริง**

ทำทีละข้อ จดผลไว้:

1. ล็อกอินเป็นนักศึกษา เข้าเคส กด "🟢 เริ่มเคส" อนุญาตไมค์ → **ต้องไม่เห็นฟองแชทและช่องพิมพ์** เห็นแค่ตัวละคร/orb + ซับไตเติล
2. พูดถามคำถามหนึ่งข้อ → ผู้ป่วยตอบเป็นเสียง ซับไตเติลขึ้นตาม **คำพูดของตัวเองต้องไม่โผล่ที่ไหนเลย**
3. พูดแทรกตอนผู้ป่วยกำลังพูด → เสียงต้องหยุดทันที ตัวละครหยุดขยับ ซับไตเติลเคลียร์
4. โหลดหน้าใหม่ กด "เริ่มเคส" แล้ว **กดปฏิเสธสิทธิ์ไมค์** → ต้องลง L2 ทันที (ฟองแชท + ช่องพิมพ์โผล่ + ข้อความแจ้งเป็นภาษาไทย) **ต้องไม่ลอง Web Speech ก่อน**
5. ปิด Wi-Fi กลางบทสนทนา → ต้องเห็นข้อความแจ้งใน `#voice-notice-1` ไม่ใช่เงียบหายไปเฉยๆ
6. ทำเคสจนจบถึงหน้าสรุป แล้วล็อกอินใหม่เป็น admin → เปิดผลเคสนั้น → **ต้องเห็นบล็อก 🗂️ บทสนทนาเต็ม** พร้อมจำนวนเทิร์นแยกตาม `via` และแถบเตือน `degraded` ถ้าเคสนั้นหลุดระดับ
7. ล็อกอินเป็นนักศึกษาแล้วเปิดผลของตัวเอง → **ต้องไม่เห็นบล็อกบทสนทนา**

- [ ] **Step 3: ถ้าค่า `silenceDurationMs` รู้สึกอืดหรือตัดเร็วเกินไป**

ปรับที่ `js/gemini-live.js` ในบล็อก `automaticActivityDetection` — ค่าปัจจุบัน 900 ms ลองช่วง 600–1200 แล้ว commit แยก

```bash
git add js/gemini-live.js
git commit -m "tune(voice): adjust end-of-speech silence window"
```

- [ ] **Step 4: freeze ก่อนเก็บข้อมูล**

ยืนยันว่า `VOICE_ONLY = true` และไม่มีการแก้ `js/prompts.js` ค้างอยู่

```bash
cd pharmbot-v2 && grep -n "const VOICE_ONLY" js/screens/chat.js && git status --short
```

Expected: `VOICE_ONLY = true` · `git status` สะอาด

- [ ] **Step 5: merge**

```bash
git checkout main && git merge --no-ff voice-only-mode
```

ยังไม่ push จนกว่าเจ้าของโปรเจกต์จะสั่ง — GitHub Actions deploy อัตโนมัติเมื่อ push เข้า `main`

---

## Self-Review

**Spec coverage**

| หัวข้อในสเปก | Task |
|---|---|
| `VOICE_ONLY` จุดควบคุมเดียว | 4 |
| ตารางสิ่งที่ซ่อน (transcript-wrap, text-input-row, mode-switcher, tts-check) | 4 |
| `_addMsg()` ไม่แก้ | 4 (ไม่แตะ) |
| `_notify()` + `#voice-notice-N` + CSS | 2 |
| บันได L0/L1/L2 + ตาราง `_nextLevel` | 3 |
| ลงแล้วไม่ขึ้น (`_emergencyText`) | 4 + 5 |
| `mic-denied` ข้าม L1 | 3 (ตรรกะ) + 5 (การแยกกรณีตอน connect ล้ม) |
| L1 ต้องไม่เงียบ (ป้อนซับไตเติล) | 5 Step 7 |
| L2 ไม่ต้องป้อนซับไตเติล | 5 Step 7 (เงื่อนไข `!_emergencyText`) |
| `markSessionDegraded` เขียนทับด้วยระดับล่าสุด | 5 |
| หน้าดู transcript + กัน 2 ชั้น | 1 |
| แสดง via / degraded / interrupted | 1 |
| การทดสอบ 4 ชั้น | 1,2,3,5 (unit) · 4 (Playwright, เขียนก่อนโค้ด) · 5 Step 9 (smoke) · 6 (regression gate) · 7 (manual) |
| ลำดับปล่อย 5 ขั้น | Task 1→5 ตามลำดับ |
| อัปเดต CLAUDE.md | 5 Step 10 |

ไม่มีหัวข้อในสเปกที่ไม่มี task รองรับ

**การเบี่ยงจากสเปกที่บันทึกไว้:** `_nextLevel()` ถูกย้ายจาก `chat.js` ไปเป็น `js/voice-ladder.js` ชื่อ `nextVoiceLevel()` เหตุผลอยู่ในหัว Task 3

**Type consistency:** `nextVoiceLevel(current, failureKind)` ใช้ชื่อเดียวกันทั้ง Task 3 (นิยาม) และ Task 5 (เรียก) · `markSessionDegraded(sessionId, level, reason)` ตรงกันระหว่าง Task 5 Step 3 กับ Step 5 · `_revealEmergencyText(panelStep, reason)` ตรงกันระหว่าง Task 4 (นิยาม), Task 5 (เรียก), Task 6 (เทสต์) · `_notify(panelStep, msg)` ตรงกันทุกจุด · `_adminTranscriptBlock(session)` ตรงกันระหว่าง Task 1 Step 3 กับ Step 5 · ค่าระดับใช้สตริง `'L0'|'L1'|'L2'` เหมือนกันทั้งแผน

**Placeholder scan:** ไม่พบ TBD/TODO · ทุก step ที่ต้องเขียนโค้ดมีโค้ดจริง · ข้อยกเว้นที่ตั้งใจ 2 จุด — Task 6 Step 1 ให้อ่าน `helpers/auth.js` ก่อนเพราะ signature จริงยังไม่ถูกตรวจสอบ และ Task 5 Step 9 ให้ข้ามได้ถ้าไฟล์ smoke test ไม่อยู่แล้ว ทั้งสองจุดระบุวิธีจัดการไว้ชัดเจน ไม่ได้ปล่อยให้เดา
