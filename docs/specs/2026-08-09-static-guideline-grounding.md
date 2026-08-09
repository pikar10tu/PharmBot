# Spec — Static Guideline Grounding (annotated marking scheme)

**สถานะ:** ตกลงแล้ว 2026-08-09 · แทนที่ `docs/specs/2026-08-08-rag-clinical-guidelines.md` (runtime RAG)

---

## เป้าหมาย

ให้ feedback ของ Step 4 อ้างอิงแนวทางเวชปฏิบัติได้ **โดยไม่ต้องค้นคืนตอน runtime** —
ย้ายหลักฐานจาก "ดึงมาสดตอนประเมิน" ไปเป็น "เขียนไว้ในเฉลยของเคสล่วงหน้า"

หลักฐานผูกกับ **ข้อ rubric รายข้อ** ไม่ใช่ผูกกับเคสเป็นก้อน (annotated marking scheme)

---

## ทำไมทิ้ง runtime RAG

ระบบ RAG สร้างเสร็จและวัดผลแล้ว (recall@6 = 1.000 จาก 719 chunk) แต่ **ไม่เหมาะกับงานนี้**

| ประเด็น | runtime RAG | static grounding |
|---|---|---|
| ความนิ่งของคะแนน | เคส pharyngitis เดียวกัน temp 0 ได้ **55–60 แกว่งข้ามการรัน** | เฉลยคงที่ → prompt คงที่ |
| เวลาต่อการประเมิน | +2.6 วินาที (embed 3 query + อ่าน Firestore) | +0 |
| prompt | 3,478 → 8,867 ตัวอักษร | โตตามจำนวน annotation เท่านั้น |
| ความน่าเชื่อเชิงวิจัย | หลักฐานที่ AI เลือกเอง ไม่มีใครตรวจ | **ผ่านสายตาผู้เชี่ยวชาญทุกบรรทัด** |
| treatment fidelity | ขึ้นกับ corpus + โมเดล embedding + Firestore | อยู่ใน git ตรวจย้อนได้ |

เงื่อนไขของโครงการนี้เอื้อกับ static เต็มที่: **9 เคสฝึก + 2 เคสสอบ ตายตัว เฉลยเขียนล่วงหน้า และผ่าน IOC อยู่แล้ว**
retrieval แก้ปัญหา "ไม่รู้ล่วงหน้าว่าจะต้องใช้ความรู้อะไร" ซึ่งไม่ใช่ปัญหาที่เรามี

**ข้อเสียที่ยอมรับ:** ถ้านักศึกษาจ่ายยานอก `drugAnswer` feedback จะอ้างอิงได้แค่จากเฉลยเคส
บวกความรู้ทั่วไปของโมเดล — ยอมรับ ไม่ทำ hybrid เพราะ hybrid ดึงความไม่นิ่งกลับเข้ามาทั้งหมด

**พบระหว่างออกแบบ:** `firestore.rules` ไม่มีกฎสำหรับ `guidelineIndex` / `guidelineChunks`
= default deny ฝั่ง client → runtime RAG น่าจะอ่านไม่ผ่านในเบราว์เซอร์จริงตั้งแต่แรก
(ยังไม่เคย smoke test ในเบราว์เซอร์ ทดสอบผ่าน Node ที่จำลอง global เท่านั้น)

---

## ขอบเขตรอบนี้ — กลไก ไม่ใช่เนื้อหา

เคสทั้ง 7 ที่อยู่ในระบบตอนนี้เป็น **เคสทดสอบ** ทีมกำลังจัดทำเคสจริงที่ผ่าน IOC
เขียน annotation ตอนนี้ = งานทิ้ง และ freeze ไม่ได้อยู่ดี

**ทำ:** โครงข้อมูล · การ render ใน prompt · ถอด runtime RAG · การแสดงอ้างอิงในหน้าสรุป · tests · เอกสาร
**ไม่ทำ:** เขียนเนื้อหา annotation · UI แก้ annotation ใน admin · `setup/brief-case.js` · แตะ 7 เคสทดสอบ

**ผลที่ตามมาที่สำคัญ:** เคสที่ยังไม่ถูก annotate ต้องได้ prompt เท่ากับวันนี้ทุกประการ
(หลังหักบล็อก RAG ออก) — เป็นพฤติกรรม default ที่ต้องมี test บังคับ

---

## โครงข้อมูล

rubric item เพิ่ม 2 ฟิลด์ **optional** เก็บใน `caseData.rubric[]` ที่ `/cases` เหมือนเดิม
ไม่มี collection ใหม่ ไม่มี migration — เคสเดิมที่ไม่มีฟิลด์นี้ทำงานได้ทันที

```js
{
  id: 'r1', domain: 'drug', weight: 7, critical: true, active: true,
  label: 'เลือกยา first-line ถูกต้อง และ regimen ครบถ้วน',

  // ── ใหม่ ทั้งคู่ optional ──
  rationale: 'amoxicillin 500 mg วันละ 3 ครั้ง นาน 10 วัน — ต้องครบ 10 วันเพื่อป้องกันไข้รูมาติก',
  sources: [
    { docId: 'ccpe461_uri', title: 'แนวทางการเลือกใช้ยาปฏิชีวนะในผู้ที่มีการติดเชื้อในทางเดินหายใจส่วนต้น', page: 12,
      url: 'https://ccpe.pharmacycouncil.org/showfile.php?file=461' }
  ]
}
```

| ฟิลด์ | ชนิด | กฎ |
|---|---|---|
| `rationale` | string | เกณฑ์ตัดสินข้อนี้ตามหลักฐาน เขียนให้ AI ใช้ตัดสิน `earned` ได้ตรงๆ ว่างหรือไม่มี = ข้อนี้ไม่ถูก annotate |
| `sources` | array | ว่างได้ แม้มี `rationale` (เช่น เกณฑ์ที่มาจากมติทีม ไม่ได้มาจากเอกสาร) |
| `sources[].docId` | string | ต้องตรงกับ `docId` ใน `DOC/guidelines/manifest.json` |
| `sources[].title` | string | ชื่อที่แสดงต่อนักศึกษา |
| `sources[].page` | number \| null | เลขหน้าในเอกสารต้นฉบับ |
| `sources[].url` | string \| null | ลิงก์สาธารณะถ้ามี |

`buildRubricForCase()` ส่งผ่านฟิลด์เหล่านี้ตรงๆ ไม่ต้องแก้

**ทำไม `sources` เป็น array:** ข้อเดียวมักอ้างสองแหล่ง เช่น ขนาดยาจาก CCPE + ระยะเวลารักษาจาก CPG

---

## Prompt (`js/prompts.js`)

### render annotation inline ใน `<Checklist>`

ของเดิม:
```
- (r1) เลือกยา first-line ถูกต้อง และ regimen ครบถ้วน [น้ำหนักข้อ 7, CRITICAL]
```

ที่มี annotation:
```
- (r1) เลือกยา first-line ถูกต้อง และ regimen ครบถ้วน [น้ำหนักข้อ 7, CRITICAL]
  เกณฑ์อ้างอิง: amoxicillin 500 mg วันละ 3 ครั้ง นาน 10 วัน — ต้องครบ 10 วันเพื่อป้องกันไข้รูมาติก
  (ที่มา: การใช้ยาปฏิชีวนะอย่างสมเหตุผลในร้านยา หน้า 12)
```

`rationale` ว่าง/ไม่มี → **ไม่มีบรรทัดเสริมใดๆ** บรรทัด `(ที่มา: ...)` แสดงเฉพาะเมื่อ `sources` ไม่ว่าง
หลายแหล่งคั่นด้วย ` · `

### คำสั่งประเมินที่เพิ่ม

ต่อท้ายส่วน "วิธีประเมิน" **เฉพาะเมื่อมีอย่างน้อยหนึ่งข้อที่มี `rationale`**:

```
- ข้อที่มี "เกณฑ์อ้างอิง" กำกับ: ให้ตัดสิน earned ตามเกณฑ์นั้นเป็นหลัก
  และอธิบายใน feedback ว่านักศึกษาทำได้ตรงหรือขาดตรงไหนเทียบกับเกณฑ์
- ห้ามแต่งเนื้อหาเชิงวิชาการเพิ่มเองนอกเหนือจาก "เกณฑ์อ้างอิง" ที่ให้ไว้
```

### ความหมายที่กลับด้านจากของเดิม

`buildGuidelineBlock()` เดิมสั่งว่า *"หลักฐานใช้อธิบายให้ลึกขึ้นเท่านั้น ห้ามใช้เปลี่ยนการตัดสิน earned"*
เพราะ chunk จาก retrieval ไม่ผ่านการตรวจและอาจมาจากบริบทโรงพยาบาล

ตอนนี้กลับด้าน — `rationale` **คือเฉลยที่ผ่าน IOC** จึงต้องใช้ตัดสิน `earned`
และตัดคำสั่ง *"ถ้าหลักฐานขัดกับเฉลยของเคสให้ยึดเฉลย"* ทิ้ง เพราะขัดกันเองไม่ได้แล้ว — เป็นของชิ้นเดียวกัน

### ตัด `citations` ออกจาก JSON schema

ของเดิมให้ AI พิมพ์ tag `[G1]` ในเนื้อ feedback แล้วสรุปใน `"citations"` — ตัดทิ้งทั้งกลไก

เหตุผล: รายการอ้างอิงที่แสดงต่อนักศึกษาไม่ควรขึ้นกับว่า AI พิมพ์ tag ครบไหม
เราเลือก static เพราะต้องการความนิ่ง การให้อ้างอิงขึ้นกับ output ของโมเดลคือการดึงความไม่นิ่งกลับเข้าทางประตูหลัง
(และ regex จับ tag พลาดมาแล้ว 2 รอบระหว่างวัดผล A/B วันที่ 2026-08-09)

แทนที่ด้วย: หน้าสรุปแสดง **union ของ `sources` จากทุกข้อในเคส** ซึ่งเหมือนกันทุกครั้งที่ทำเคสเดิม
**ด้วยเพศผู้ป่วยเดียวกัน** — เคสที่ `gender: 'random'` มีข้อ `femaleOnly` ที่กรองตามเพศจริงหลังสุ่ม
(`randomizePatientData`) รายการอ้างอิงจึงต่างกันได้ระหว่างการสุ่มเป็นชายกับหญิง แต่นิ่งเสมอเมื่อเพศเดียวกัน

### `GROUNDING_VERSION`

const ใน `prompts.js` รูปแบบ `'YYYY-MM-DD'` (เช่น `'2026-08-09'`) — ไม่ใช่ Firestore doc ที่ใครก็แก้ได้กลางการเก็บข้อมูล
บันทึกลง `/results.groundingVersion` เพื่อให้ตรวจย้อนได้ว่าผลนี้มาจากเฉลยชุดไหน
bump เมื่อแก้ annotation หรือแก้ prompt ของ Step 4 · **freeze ก่อนเก็บข้อมูลจริง**

---

## รายการอ้างอิง — คำนวณตอน eval ไม่ใช่ตอนแสดงผล

`summary.js` โหลดแค่ `/results/{resultId}` — ใน `/results` มีเพียง `caseSnapshot`
ที่เก็บ `{title, groupId, difficulty}` **ไม่มี rubric** การคำนวณ union ที่หน้าสรุปจึงต้อง fetch เคสเพิ่ม

แก้โดยคำนวณที่ Step 4 ซึ่งมี `_caseData` อยู่ในมือแล้ว:

```
prompts.js   collectGuidelineSources(caseData) → [{docId, title, page, url}]   (pure)
chat.js      เรียกตอนบันทึกผล → ส่งเข้า saveResult()
db.js        เก็บลง /results.guidelineRefs
summary.js   อ่าน result.guidelineRefs ตรงๆ
```

ได้เปรียบสองอย่างนอกจากไม่ต้องอ่าน Firestore เพิ่ม: ไม่ต้องพึ่ง `Router` params
(จุดเปราะที่รู้กันว่า **params หายเมื่อ refresh**) และ **ผลบันทึกอ้างอิง ณ ตอนที่ทำจริง**
ถ้าอาจารย์แก้ annotation ภายหลัง ผลเก่าจะไม่เปลี่ยนตาม — ตรวจย้อนเชิงวิจัยได้ถูกต้อง

`collectGuidelineSources()`:
- ไล่ `buildRubricForCase(caseData)` เฉพาะข้อที่ `active !== false`
- ตามลำดับ `DOMAIN_ORDER` (`history → diagnosis → drug → counseling`) แล้วตามลำดับข้อในหมวด
- dedup ด้วยคีย์ `docId|page` — เก็บครั้งแรกที่พบ ลำดับจึงคงที่
- ไม่มี source เลย → คืน `[]`

### `js/screens/summary.js`

คงส่วน "อ้างอิงตามแนวทางเวชปฏิบัติ" ไว้ เปลี่ยนแหล่งจาก `fb.guidelineRefs` เป็น `result.guidelineRefs`
- ว่าง → ไม่แสดง section (เหมือนวันนี้ตอน RAG ไม่คืนอะไร)
- มี `url` → ทำเป็นลิงก์ ไม่มี → แสดงข้อความเฉยๆ

---

## ไฟล์ที่แก้

### ถอดออก

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `js/rag.js` | ลบทั้งไฟล์ |
| `index.html` | ลบ `<script>` บรรทัด 26–27 (`rag-core.js`, `rag.js`) |
| `js/rag-core.js` | **ย้าย → `setup/lib/rag-core.js`** เบราว์เซอร์ไม่ใช้แล้ว เป็นเครื่องมือ offline ล้วน |
| `setup/eval-retrieval.js:17` · `setup/index-guidelines.js:20` | แก้ `require('../js/rag-core')` → `require('./lib/rag-core')` |
| `js/screens/chat.js:919–921, 940–944` | ตัด `RAG.retrieve` · `evalJson.guidelineRefs` · แก้คอมเมนต์ที่พูดถึงผล A/B ของ RAG · เรียก `collectGuidelineSources()` แทน |
| `js/db.js:92, 104–112` | `saveResult()` เปลี่ยน arg ที่ 5 จาก `ragInfo` เป็น `guidelineRefs` · ฟิลด์ `rag` → `guidelineRefs` + `groundingVersion` |
| `js/prompts.js:261–286` | ลบ `buildGuidelineBlock()` |
| `js/prompts.js:291, 373` | `buildEvalPrompt()` ตัดพารามิเตอร์ `guidelineChunks` และการเรียก block |
| `js/prompts.js:396, 401–402` | ตัด `"citations"` ออกจาก JSON schema และหมายเหตุ |
| `js/screens/summary.js:103–115` | ป้อนจาก rubric sources แทน `fb.guidelineRefs` |
| Firestore `/config/rag` | ลบ document (ไม่มีใครอ่านแล้ว) |

### เพิ่ม / แก้

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `js/prompts.js` | `GROUNDING_VERSION` · render annotation ใน `checklistText` · คำสั่งประเมินเพิ่ม · `collectGuidelineSources()` |
| `js/screens/admin.js:790–801` | เพิ่ม `rationale` / `sources` เข้า whitelist ตอน save — **ไม่ทำ UI แก้ไขรอบนี้** ถ้าไม่แก้ ข้อมูลจะหายเงียบเมื่ออาจารย์เปิดเคสแล้วกดบันทึก |
| `index.html` | bump `?v=` ของไฟล์ที่แก้ (ไม่มี build step) |

### เก็บไว้ทั้งหมด — วัตถุดิบตอนเติมเฉลย

719 chunk + `guidelineIndex` ใน Firestore · `setup/extract-pdf.py` · `setup/lib/{chunk,thai-repair,embed}.js`
· `setup/index-guidelines.js` · `setup/eval-retrieval.js` · `DOC/guidelines/` (8 ฉบับ นอก repo)

ทั้งหมดทำงานฝั่ง Node ไม่แตะแอปที่ deploy — พอเคสจริงมาถึงจะใช้เป็นแหล่งร่างเนื้อหา annotation

---

## Tests (`setup/test/`, `node:test`)

| ไฟล์ | ทำอะไร |
|---|---|
| `rag-query.test.js` | ลบ — ทดสอบ `RAG.buildQueries()` ที่หายไปแล้ว |
| `rag-core-browser.test.js` | ลบ — ข้อบังคับ "ต้องรันในเบราว์เซอร์ได้" หมดไปพร้อมการย้ายไฟล์ |
| `rag-core.test.js` | คงไว้ แก้ path เป็น `../lib/rag-core` |
| `summary-citations.test.js` | เขียนใหม่ → ทดสอบ `collectGuidelineSources()` union/dedup/ลำดับ |
| **ใหม่** `grounding.test.js` | ดูด้านล่าง |

`grounding.test.js` ต้องครอบ:

1. **baseline** — rubric ไม่มีข้อไหนมี `rationale` → prompt ไม่ปรากฏคำว่า `เกณฑ์อ้างอิง` และไม่มีคำสั่งประเมินส่วนเพิ่ม
2. **render** — ข้อที่มี `rationale` ได้บรรทัดเสริมอยู่ใต้ข้อของตัวเอง ไม่ใช่ข้ออื่น
3. **sources ว่าง** — มี `rationale` แต่ไม่มี `sources` → มีบรรทัด `เกณฑ์อ้างอิง` แต่ไม่มี `(ที่มา:`
4. **หลายแหล่ง** — คั่นด้วย ` · ` ในบรรทัดเดียว
5. **`collectGuidelineSources()`** — dedup ด้วย `docId|page` · ลำดับคงที่ตาม `DOMAIN_ORDER` · ข้อ `active: false` ไม่ถูกนับ · เคสไม่มี annotation คืน `[]`
6. **ไม่แตะคะแนน** — `scoreRubric()` ให้ผลเท่ากันเป๊ะไม่ว่ามี annotation หรือไม่ (annotation เปลี่ยนได้แค่ `earned` ที่ AI ตัดสิน ไม่เปลี่ยนสูตรคำนวณ)

**บทเรียนที่ต้องระวัง (จาก 2026-08-09):** ก่อนสรุปว่า test ผ่าน ให้ตรวจว่าเครื่องมือวัดถูกก่อน —
ครั้งก่อนสรุปผิด 3 ครั้งเพราะวัดผิด ไม่ใช่โค้ดผิด

รันด้วย `cd setup && npm test` (บน Windows ต้องระบุ glob — `node --test test/` แบบโฟลเดอร์ไม่ทำงาน)

---

## เอกสารที่ต้องแก้

- `docs/specs/2026-08-08-rag-clinical-guidelines.md` — แปะหัวว่า **superseded by this spec**
  เก็บไว้เพราะผลวัด A/B · บทเรียนถอดข้อความ PDF ไทย · ตารางความครอบคลุมรายเคส ยังอ้างในเล่มวิทยานิพนธ์ได้
- `docs/plans/2026-08-08-rag-phase1-indexing.md` — ยังใช้ได้ (offline pipeline ไม่เปลี่ยน) เพิ่มหมายเหตุเรื่อง path ที่ย้าย
- `docs/plans/2026-08-09-rag-phase3-runtime.md` — แปะหัวว่า **ยกเลิก** งานทั้งแผนถูกถอดออก
- `CLAUDE.md` — ตาราง Firestore (ตัด `/config/rag`, หมายเหตุว่า `guideline*` เป็น offline-only)
  · script load order · Quick Orientation · Case Schema เพิ่ม `rationale`/`sources` · ส่วน RAG setup

---

## งานถัดไป (นอกขอบเขต spec นี้)

1. **รอเคสจริงที่ผ่าน IOC จากทีม** ← ตัวปลดล็อกทุกอย่างด้านล่าง
2. เขียน annotation ~15–20 ข้อ × 9 เคส โดยใช้คลัง 719 chunk เป็นแหล่งร่าง (อาจทำเป็น `setup/brief-case.js`)
3. UI แก้ `rationale` / `sources` ใน admin rubric editor
4. ผู้เชี่ยวชาญตรวจ annotation ทุกบรรทัด
5. freeze `GROUNDING_VERSION` + prompt ก่อนเก็บข้อมูล — treatment fidelity
6. **`rubricHash` — ยังไม่ทำตอนนี้ เพราะ rubric จะแก้อีกรอบตอนเคส IOC มา hash วันนี้ไม่มีความหมาย**
   `GROUNDING_VERSION` เป็น git constant ที่ dev เท่านั้นแก้ได้ แต่ annotation อยู่ใน Firestore `/cases`
   ที่ admin แก้ได้โดยไม่ต้องแก้โค้ด — ถ้าครูปรับ label/weight กลางการเก็บข้อมูล ผลที่บันทึกจะ stamp
   ด้วย version เดิมทั้งที่ rubric จริงเปลี่ยนไปแล้ว และ `/results` เก็บแค่ `guidelineRefs` +
   `caseSnapshot: {title, groupId, difficulty}` — ไม่พอย้อนสร้าง rubric ที่ใช้ตัดสินจริง
   ทางแก้ที่ถูกต้องคือเพิ่มฟิลด์ `rubricHash` ข้าง `groundingVersion` ใน `/results` —
   deterministic hash (เช่น SHA-256 ตัด 8-12 ตัวแรก) คำนวณจาก rubric ที่ผ่านการ filter
   `active`/`femaleOnly` แล้ว (ชุดเดียวกับที่ส่งเข้า `buildEvalPrompt`/`scoreRubric`) โดย serialize
   แต่ละข้อเป็น `id|label|weight|critical|rationale` เรียงตามลำดับที่ `buildRubricForCase` คืนมา
   ก่อน hash เพื่อให้ผลนิ่ง — ทำตอนใกล้ freeze (ข้อ 5) หลัง rubric ของเคสจริงนิ่งแล้ว ไม่ใช่ตอนนี้ที่
   เคสยังเป็นของทดสอบและจะถูกแทนที่ทั้งชุด
7. smoke test ในเบราว์เซอร์จริง · ทดสอบเสียงจริง 1 เคส (ค้างจากรอบก่อน)
