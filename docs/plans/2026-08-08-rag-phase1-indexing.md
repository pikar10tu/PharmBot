# RAG Phase 1 — Guideline Indexing & Retrieval Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างคลังแนวทางเวชปฏิบัติที่ค้นคืนด้วย semantic search ได้ พร้อมตัวเลขวัดคุณภาพการค้นคืน (recall@6) เพื่อตัดสินว่าดีไซน์ใช้ได้ก่อนลงทุนต่อกับ runtime

**Architecture:** pipeline offline 5 ขั้น — Python (pypdf) แตกข้อความรายหน้าลงไฟล์ cache → Node ซ่อมข้อความไทย → ตัด chunk → Gemini สรุปไทย + embed → quantize เก็บลง Firestore แยกเป็น "ดัชนี" (เล็ก โหลดครั้งเดียว) กับ "เนื้อหาเต็ม" (ดึงเฉพาะ top-k) แกนคณิตค้นคืนอยู่ใน `js/rag-core.js` ที่ใช้ร่วมกันทั้ง Node และเบราว์เซอร์โดยไม่ต้องมี build step

**Tech Stack:** Node v24 (CommonJS, `node:test` ในตัว) · Python 3 + pypdf · firebase-admin ^12 · Gemini API (`gemini-embedding-2`, `gemini-2.5-flash`)

**Spec:** `docs/specs/2026-08-08-rag-clinical-guidelines.md` — อ่านก่อนเริ่ม

## Global Constraints

- **ไม่มี build step** — `js/*.js` เป็น global scope ล้วน, `setup/*.js` เป็น CommonJS (`require`) ห้ามใช้ ESM `import`
- **`js/rag-core.js` ต้องรันได้ทั้งเบราว์เซอร์และ Node** — ปิดไฟล์ด้วย `if (typeof module !== 'undefined') module.exports = {...}` ห้ามใช้ `require` ในไฟล์นี้
- **ห้าม commit ไฟล์ PDF หรือ cache** — เพิ่ม `setup/guidelines/` ลง `.gitignore` ใน Task 2 ก่อนวางไฟล์
- **Embedding:** `gemini-embedding-2`, `outputDimensionality: 768`, normalize เป็น unit vector ก่อน quantize
- **Quantize:** Int8Array scale คงที่ = 127 (ทำได้เพราะ normalize แล้วค่าอยู่ใน [-1,1]) เก็บเป็น base64 ห้ามเก็บ scale ต่อ vector
- **Generation model:** `gemini-2.5-flash` — ห้ามใช้ `gemini-2.0-*` หรือ `gemini-1.5-*` (deprecated)
- **API key:** อ่านจาก Firestore `/config/gemini.apiKey` ห้าม hardcode ห้าม commit
- **Firestore doc limit 1 MB** — shard ดัชนีไม่เกิน 600 entries ต่อ document
- **ชื่อกลุ่มโรค:** `RESP` · `GU_STI` · `NEURO` เท่านั้น (ตรงกับ `setup/seed-cases.js:30-32`)
- **`corpusVersion`** อยู่ในทุก document ที่เขียน — ใช้ค่าจาก `manifest.json` field เดียวกัน
- ไฟล์ไกด์ไลน์ต้นทางอยู่ที่ `D:/PROJECT/DOC/guidelines/` (นอก repo) — Task 2 คัดลอกเฉพาะที่อยู่ใน manifest เข้า `setup/guidelines/`

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `setup/guidelines/manifest.json` | รายการเอกสารที่จะ index + ช่วงหน้า + วิธีแตกข้อความ |
| `setup/extract-pdf.py` | PDF → `.extracted/{docId}/p{NNN}.txt` (ข้อความดิบ ยังไม่ซ่อม) |
| `setup/lib/thai-repair.js` | ซ่อมข้อความไทยที่ PDF ถอดออกมาเพี้ยน (pure) |
| `setup/lib/chunk.js` | ข้อความรายหน้า → chunks (pure) |
| `setup/lib/embed.js` | เรียก Gemini: สรุปไทย + embed (I/O) |
| `setup/index-guidelines.js` | pipeline หลัก เขียน Firestore |
| `setup/eval-queries.json` | ชุด query ทดสอบ + คำตอบที่ควรเจอ |
| `setup/eval-retrieval.js` | วัด recall@6 |
| `js/rag-core.js` | คณิตค้นคืน ใช้ร่วม Node + เบราว์เซอร์ |
| `setup/test/*.test.js` | unit tests (`node --test`) |

---

### Task 1: ตัวซ่อมข้อความไทย (`thai-repair.js`)

**Files:**
- Create: `setup/lib/thai-repair.js`
- Test: `setup/test/thai-repair.test.js`

**Interfaces:**
- Consumes: (ไม่มี — task แรก)
- Produces: `module.exports = { repairThai }` · `repairThai(text: string) => string`

**บริบท:** ข้อความในตารางนี้คือ output จริงจาก pypdf ที่วัดไว้เมื่อ 2026-08-08 ใช้เป็น fixture ได้ตรงๆ

| ไฟล์ต้นทาง | ได้จาก pypdf | ควรเป็น |
|---|---|---|
| `495-CPG-migraine-2565.pdf` | `แนวทางเวชปฏิิบััติิการวินิจฉััย` | `แนวทางเวชปฏิบัติการวินิจฉัย` |
| `AR.pdf` | `แนวทางเวชปฏิบัติส าหรับโรคจมูก` | `แนวทางเวชปฏิบัติสำหรับโรคจมูก` |
| `CCPE_461_URI_antibiotics.pdf` | `สาเหตุส าคัญ` | `สาเหตุสำคัญ` |

- [ ] **Step 1: เขียน test ที่ต้องแดงก่อน**

```js
// setup/test/thai-repair.test.js
const test = require('node:test');
const assert = require('node:assert');
const { repairThai } = require('../lib/thai-repair');

test('ยุบ combining mark ที่ซ้ำติดกัน (ของจริงจาก CPG ไมเกรน 2565)', () => {
  assert.strictEqual(
    repairThai('แนวทางเวชปฏิิบััติิการวินิจฉััย'),
    'แนวทางเวชปฏิบัติการวินิจฉัย'
  );
  assert.strictEqual(repairThai('ฉับัับัสมบัูรณ์์'), 'ฉับับัสมบัูรณ์');
});

test('ซ่อม ำ ที่แตกเป็นพยัญชนะ + ช่องว่าง + า (ของจริงจาก AR.pdf)', () => {
  assert.strictEqual(
    repairThai('แนวทางเวชปฏิบัติส าหรับโรคจมูก'),
    'แนวทางเวชปฏิบัติสำหรับโรคจมูก'
  );
  assert.strictEqual(repairThai('สาเหตุส าคัญ'), 'สาเหตุสำคัญ');
  assert.strictEqual(repairThai('จ านวนหน่วยกิต'), 'จำนวนหน่วยกิต');
});

test('ไม่แตะข้อความที่ถูกต้องอยู่แล้ว', () => {
  const clean = 'การจัดการและดูแลรักษาภาวะ community-acquired urinary tract infection';
  assert.strictEqual(repairThai(clean), clean);
  // ไม้หันอากาศ + วรรณยุกต์ต่างตัวติดกันเป็นเรื่องปกติ ห้ามยุบ
  assert.strictEqual(repairThai('ตั้งครรภ์'), 'ตั้งครรภ์');
});

test('ไม่ยุ่งกับ า ที่ขึ้นต้นหลังเลขหรืออักษรละติน', () => {
  assert.strictEqual(repairThai('WHO า'), 'WHO า');
  assert.strictEqual(repairThai('5 าา'), '5 าา');
});

test('รับ input ว่าง/null ได้', () => {
  assert.strictEqual(repairThai(''), '');
  assert.strictEqual(repairThai(null), '');
  assert.strictEqual(repairThai(undefined), '');
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `cd setup && node --test test/thai-repair.test.js`
Expected: FAIL — `Cannot find module '../lib/thai-repair'`

- [ ] **Step 3: เขียน implementation ให้น้อยที่สุดที่ผ่าน**

```js
// ============================================================
//  thai-repair.js
//  ซ่อมข้อความไทยที่ PDF ถอดออกมาเพี้ยน (pure — ไม่มี I/O)
//
//  วัดกับไฟล์จริงใน DOC/guidelines เมื่อ 2026-08-08:
//    CPG ไมเกรน 2565  สระซ้ำ 14 -> 0
//    AR.pdf           "ส า"   10 -> 0
//
//  ⚠️ ซ่อมได้แค่ 2 อาการนี้ ไฟล์ที่ฟอนต์ไม่ใช่ Unicode
//  (STI_CPG_DDC_2567 เนื้อความ, f6cdf409) ต้องใช้ extract=gemini
// ============================================================

// combining marks ไทย: ไม้หันอากาศ, สระบน/ล่าง, วรรณยุกต์, ทัณฑฆาต, ยามักการ
const MARKS = '\u0E31\u0E34-\u0E3A\u0E47-\u0E4E';

function repairThai(text) {
  if (!text) return '';
  let t = String(text);

  // 1) mark ตัวเดียวกันซ้ำติดกัน -> เหลือตัวเดียว
  //    ปลอดภัย: ภาษาไทยไม่มีการเขียน mark ตัวเดียวกันซ้ำติดกัน
  //    (ต่างตัวติดกันได้ เช่น ตั้ง = ต + ั + ้ จึงต้อง backreference ไม่ใช่ character class)
  t = t.replace(new RegExp(`([${MARKS}])\\1+`, 'g'), '$1');

  // 2) "สำ" ที่แตกเป็น พยัญชนะ + ช่องว่าง + "า"
  //    ปลอดภัย: า ไม่ขึ้นต้นคำในภาษาไทย ช่องว่างหน้า า จึงเป็นบั๊กเสมอ
  //    - อนุญาตให้มี mark คั่นได้ 1 ตัว (เช่น "ที่ า")
  //    - ไม่แตะถ้าหลัง า มีสระ/วรรณยุกต์ต่อ (แปลว่า า นั้นเป็นของจริง)
  t = t.replace(
    new RegExp(`([\u0E01-\u0E2E][${MARKS}]?)[ \\t]+า(?![\u0E30-\u0E4E])`, 'g'),
    '$1ำ'
  );

  return t;
}

module.exports = { repairThai };
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd setup && node --test test/thai-repair.test.js`
Expected: PASS ทั้ง 5 tests

- [ ] **Step 5: ตรวจกับไฟล์จริง (ไม่ใช่แค่ fixture)**

```bash
cd setup && node -e "
const {repairThai}=require('./lib/thai-repair');
const s='แนวทางเวชปฏิิบััติิการวินิจฉััยและการรักษา ปวดศีีรษะไมเกรน';
console.log('IN :',s);
console.log('OUT:',repairThai(s));
"
```
Expected: บรรทัด OUT อ่านเป็นภาษาไทยปกติ ไม่มีสระซ้อน

- [ ] **Step 6: Commit**

```bash
git add setup/lib/thai-repair.js setup/test/thai-repair.test.js
git commit -m "feat(rag): thai text repair for broken PDF extraction"
```

---

### Task 2: manifest + แตกข้อความจาก PDF (`extract-pdf.py`)

**Files:**
- Create: `setup/guidelines/manifest.json`
- Create: `setup/extract-pdf.py`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: (ไม่มี — อ่านไฟล์ PDF โดยตรง)
- Produces:
  - `setup/guidelines/manifest.json` — โครงตามด้านล่าง อ่านโดย Task 3, 5, 6
  - ไฟล์ cache `setup/guidelines/.extracted/{docId}/p{NNN}.txt` — เลขหน้า zero-pad 3 หลัก, ข้อความดิบยังไม่ซ่อม, UTF-8
  - CLI: `python extract-pdf.py [--doc <docId>] [--force]`

**เหตุผลที่ขั้นนี้เป็น Python ไม่ใช่ Node:** กฎซ่อมใน Task 1 ถูกวัดกับ output ของ pypdf ถ้าเปลี่ยนไปใช้ PDF lib ของ Node อาการเพี้ยนจะต่างออกไปและกฎอาจใช้ไม่ได้ ส่งต่อกันผ่านไฟล์ cache ทุกขั้นถัดไปเป็น Node ทั้งหมด

- [ ] **Step 1: กัน PDF หลุดขึ้น repo ก่อนทำอะไรทั้งสิ้น**

เพิ่มท้าย `.gitignore`:

```
# ไกด์ไลน์เวชปฏิบัติ — มีลิขสิทธิ์ + ไฟล์ใหญ่ ห้าม commit
setup/guidelines/
```

- [ ] **Step 2: ยืนยันว่า .gitignore ทำงาน**

Run: `mkdir -p setup/guidelines && touch setup/guidelines/probe.pdf && git status --short && rm setup/guidelines/probe.pdf`
Expected: `git status` ไม่แสดง `setup/guidelines/probe.pdf`

- [ ] **Step 3: คัดลอกเฉพาะไฟล์ที่จะ index เข้ามา**

```bash
cd "D:/PROJECT/pharmbot-v2/setup/guidelines"
for f in CCPE_739_STD_pharmacist.pdf CCPE_953_community_UTI.pdf \
         CCPE_461_URI_antibiotics.pdf AR.pdf \
         495-CPG-migraine-2565-20230104074752.pdf STI_CPG_DDC_2567.pdf; do
  cp "D:/PROJECT/DOC/guidelines/$f" . && echo "copied $f"
done
ls -la
```
Expected: 6 ไฟล์ (ไม่เอา `Thai DM CPG`, `Neuropathic Pain`, `ปลายประสาทอักเสบ`, `hemorrhagic-2008`, `Adult_Sinusitis` — นอกขอบเขตหรือรอตรวจ)

- [ ] **Step 4: เขียน manifest.json**

`year` ทุกตัวเป็น `null` ก่อน — **ต้องเปิดหน้าปกเอกสารอ่านปีจริงแล้วเติม** ห้ามเดาจาก PDF metadata (metadata เป็นวันที่บันทึกไฟล์) เพราะค่านี้ไปแสดงเป็น citation ต่อนักศึกษา

```json
{
  "corpusVersion": "2026-08-08",
  "docs": [
    {
      "id": "ccpe739_std",
      "file": "CCPE_739_STD_pharmacist.pdf",
      "title": "โรคติดต่อทางเพศสัมพันธ์",
      "publisher": "ศูนย์การศึกษาต่อเนื่องทางเภสัชศาสตร์ สภาเภสัชกรรม",
      "author": "ผศ.ดร.เด่นพงศ์ พัฒนเศรษฐานนท์",
      "year": null,
      "url": "https://ccpe.pharmacycouncil.org/showfile.php?file=739",
      "lang": "th",
      "groups": ["GU_STI"],
      "pages": "1-13",
      "extract": "pypdf"
    },
    {
      "id": "ccpe953_uti",
      "file": "CCPE_953_community_UTI.pdf",
      "title": "การจัดการและดูแลรักษาภาวะ community-acquired urinary tract infection",
      "publisher": "ศูนย์การศึกษาต่อเนื่องทางเภสัชศาสตร์ สภาเภสัชกรรม",
      "author": "ภก.กฤติน บัณฑิตานุกูล",
      "year": null,
      "url": "https://ccpe.pharmacycouncil.org/showfile.php?file=953",
      "lang": "th",
      "groups": ["GU_STI"],
      "pages": "1-10",
      "extract": "pypdf"
    },
    {
      "id": "ccpe461_uri",
      "file": "CCPE_461_URI_antibiotics.pdf",
      "title": "แนวทางการเลือกใช้ยาปฏิชีวนะในผู้ที่มีการติดเชื้อในทางเดินหายใจส่วนต้น",
      "publisher": "ศูนย์การศึกษาต่อเนื่องทางเภสัชศาสตร์ สภาเภสัชกรรม",
      "author": "ภก.กฤติน บัณฑิตานุกูล",
      "year": null,
      "url": "https://ccpe.pharmacycouncil.org/showfile.php?file=461",
      "lang": "th",
      "groups": ["RESP"],
      "pages": "1-17",
      "extract": "pypdf"
    },
    {
      "id": "ar_th_2565",
      "file": "AR.pdf",
      "title": "แนวทางเวชปฏิบัติสำหรับโรคจมูกอักเสบภูมิแพ้ในคนไทย (ฉบับปรับปรุง พ.ศ. 2565)",
      "publisher": "Thai Journal of Otolaryngology Head and Neck Surgery Vol. 23 No. 1",
      "author": "ทรงกลด เอี่ยมจตุรภัทร และคณะ",
      "year": 2565,
      "url": null,
      "lang": "th",
      "groups": ["RESP"],
      "pages": "53-120",
      "extract": "pypdf"
    },
    {
      "id": "migraine_cpg_2565",
      "file": "495-CPG-migraine-2565-20230104074752.pdf",
      "title": "แนวทางเวชปฏิบัติการวินิจฉัยและการรักษาปวดศีรษะไมเกรน (ฉบับสมบูรณ์ 2565)",
      "publisher": "ชมรมศึกษาโรคปวดศีรษะ ภายใต้สมาคมประสาทวิทยาแห่งประเทศไทย",
      "author": null,
      "year": 2565,
      "url": null,
      "lang": "th",
      "groups": ["NEURO"],
      "pages": "1-94",
      "extract": "pypdf"
    },
    {
      "id": "sti_ddc_2567",
      "file": "STI_CPG_DDC_2567.pdf",
      "title": "แนวทางการดูแลรักษาโรคติดต่อทางเพศสัมพันธ์ พ.ศ. 2567",
      "publisher": "กรมควบคุมโรค กระทรวงสาธารณสุข",
      "author": null,
      "year": 2567,
      "url": "https://stisqsa.ddc.moph.go.th/app-assets/manual/2567/",
      "lang": "th",
      "groups": ["GU_STI"],
      "pages": "10-37,52-60,68-70,81,91-96",
      "extract": "gemini"
    }
  ]
}
```

- [ ] **Step 4b: ยืนยันช่วงหน้าของ AR.pdf และปีของทุกเอกสาร ก่อนไปต่อ**

`AR.pdf` เป็นวารสารทั้งเล่ม 260 หน้า ตัว CPG เริ่มหน้า 53 แต่ **หน้าสิ้นสุดยังไม่ยืนยัน** ค่า `53-120` ในตัวอย่างเป็นการเดา

```bash
cd "D:/PROJECT/pharmbot-v2/setup/guidelines" && python -c "
import re
from pypdf import PdfReader
r=PdfReader('AR.pdf')
for i in range(50, 135):
    t=(r.pages[i].extract_text() or '')
    head=re.sub(r'\s+',' ',t)[:90]
    print(i+1, '|', head)
"
```
ดูว่าเนื้อหา CPG จบหน้าไหน (บทความถัดไปเริ่ม) แล้วแก้ `pages` ใน manifest ให้ตรง

จากนั้นเปิดหน้าปก/หน้าลิขสิทธิ์ของ `ccpe739_std`, `ccpe953_uti`, `ccpe461_uri` อ่านปีที่เผยแพร่จริงแล้วเติม `year` — **ห้ามใช้ PDF metadata** (ของ `ccpe461_uri` คือ 2018 ซึ่งเป็นวันบันทึกไฟล์ ไม่ใช่ปีเผยแพร่)

Expected: `pages` ของ `ar_th_2565` ตรงกับเนื้อหาจริง และ `year` ไม่มีตัวไหนเป็น `null` เหลืออยู่

- [ ] **Step 5: เขียน extract-pdf.py**

```python
# ============================================================
#  extract-pdf.py
#  PDF -> setup/guidelines/.extracted/{docId}/p{NNN}.txt (ข้อความดิบ)
#
#  วิธีใช้:
#    python extract-pdf.py                 # ทุก doc ที่ extract=pypdf
#    python extract-pdf.py --doc ccpe739_std
#    python extract-pdf.py --force         # เขียนทับ cache เดิม
#
#  doc ที่ extract=gemini จะถูกข้าม (Task 5 จัดการ)
#  ยังไม่ซ่อมข้อความ — Task 3 (thai-repair) ทำต่อ
# ============================================================
import argparse, json, os, sys
from pypdf import PdfReader

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE = os.path.join(HERE, 'guidelines')
CACHE = os.path.join(GUIDE, '.extracted')


def parse_pages(spec, n_pages):
    """'10-37,52,68-70' -> [9,...,36,51,67,68,69]  (1-indexed spec -> 0-indexed)"""
    if not spec:
        return list(range(n_pages))
    out = []
    for part in str(spec).split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            out.extend(range(int(a) - 1, int(b)))
        else:
            out.append(int(part) - 1)
    return [i for i in out if 0 <= i < n_pages]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doc')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    with open(os.path.join(GUIDE, 'manifest.json'), encoding='utf-8') as f:
        manifest = json.load(f)

    total_pages = 0
    for doc in manifest['docs']:
        if args.doc and doc['id'] != args.doc:
            continue
        if doc.get('extract') != 'pypdf':
            print(f"skip {doc['id']} (extract={doc.get('extract')})")
            continue

        pdf_path = os.path.join(GUIDE, doc['file'])
        if not os.path.exists(pdf_path):
            print(f"!! MISSING {doc['file']}", file=sys.stderr)
            sys.exit(1)

        out_dir = os.path.join(CACHE, doc['id'])
        os.makedirs(out_dir, exist_ok=True)

        reader = PdfReader(pdf_path)
        idxs = parse_pages(doc.get('pages'), len(reader.pages))
        written = empty = 0

        for i in idxs:
            out_file = os.path.join(out_dir, f'p{i + 1:03d}.txt')
            if os.path.exists(out_file) and not args.force:
                continue
            try:
                text = reader.pages[i].extract_text() or ''
            except Exception as e:
                print(f"   page {i+1} extract error: {e}", file=sys.stderr)
                text = ''
            if not text.strip():
                empty += 1
            with open(out_file, 'w', encoding='utf-8') as f:
                f.write(text)
            written += 1

        total_pages += written
        flag = '  <-- ตรวจด่วน: หน้าว่างเยอะ' if empty > len(idxs) * 0.3 else ''
        print(f"{doc['id']:<20} {written:>4} หน้า (ว่าง {empty}){flag}")

    print(f"\nรวม {total_pages} หน้า -> {CACHE}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 6: รันจริงกับทั้งคลัง**

Run: `cd setup && python extract-pdf.py`
Expected: 5 doc ถูกแตก (`sti_ddc_2567` ถูก skip เพราะ `extract=gemini`) ไม่มีบรรทัดไหนขึ้น "ตรวจด่วน"
ถ้าขึ้น "ตรวจด่วน" ให้หยุดและรายงาน — แปลว่าไฟล์นั้นเป็นภาพสแกน ต้องเปลี่ยนเป็น `extract: "gemini"`

- [ ] **Step 7: ตาดู cache ที่ได้**

```bash
cd setup && head -c 400 guidelines/.extracted/ccpe461_uri/p001.txt && echo && echo "---" && ls guidelines/.extracted/*/ | head -20
```
Expected: อ่านเป็นภาษาไทยรู้เรื่อง (จะยังเห็น `ส า` อยู่ — ถูกต้อง เพราะยังไม่ซ่อม)

- [ ] **Step 8: Commit**

```bash
git add .gitignore setup/extract-pdf.py
git commit -m "feat(rag): manifest schema + pypdf page extraction to cache

manifest.json กับไฟล์ PDF ไม่เข้า repo (gitignore) — ลิขสิทธิ์"
```

หมายเหตุ: `manifest.json` อยู่ใต้ `setup/guidelines/` จึงถูก gitignore ไปด้วย **ต้องสำรองไว้ที่อื่นเอง** (เช่น `DOC/guidelines/manifest.json`) เพราะเป็นไฟล์ที่เขียนด้วยมือและกำหนด `corpusVersion` ที่ต้อง freeze

---

### Task 3: ตัด chunk (`chunk.js`)

**Files:**
- Create: `setup/lib/chunk.js`
- Test: `setup/test/chunk.test.js`

**Interfaces:**
- Consumes: `repairThai` จาก Task 1
- Produces:

```js
module.exports = { chunkPages, CHUNK_OPTS };
// CHUNK_OPTS = { target: 1000, min: 300, max: 1400, overlap: 150 }
// chunkPages(docId, pages, opts?) => Array<Chunk>
//   pages: Array<{ page: number, text: string }>   // ข้อความดิบจาก cache
//   Chunk: { chunkId, docId, page, heading, text }
//   chunkId = `${docId}_p${String(page).padStart(3,'0')}_${index}`   index เริ่มที่ 0
```

**การตัดสินใจ:** chunk ไม่ข้ามหน้า เพราะเราแสดงเลขหน้าเป็น citation ต่อนักศึกษา ถ้า chunk คร่อม 2 หน้าจะอ้างหน้าไม่ตรง แต่ prepend 150 ตัวอักษรท้ายหน้าก่อนเป็น overlap เพื่อไม่ให้ประโยคแรกของหน้าลอย

- [ ] **Step 1: เขียน failing test**

```js
// setup/test/chunk.test.js
const test = require('node:test');
const assert = require('node:assert');
const { chunkPages, CHUNK_OPTS } = require('../lib/chunk');

const para = (n) => 'ก'.repeat(n);

test('หน้าสั้นได้ chunk เดียว + ซ่อมข้อความไทยให้แล้ว', () => {
  const out = chunkPages('doc1', [{ page: 7, text: 'สาเหตุส าคัญของอาการเจ็บคอ' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].text, 'สาเหตุสำคัญของอาการเจ็บคอ');
  assert.strictEqual(out[0].chunkId, 'doc1_p007_0');
  assert.strictEqual(out[0].page, 7);
});

test('หน้ายาวถูกตัดหลาย chunk และแต่ละ chunk ไม่เกิน max', () => {
  const text = [para(700), para(700), para(700)].join('\n\n');
  const out = chunkPages('doc1', [{ page: 1, text }]);
  assert.ok(out.length >= 2, `ควรได้ >=2 chunk ได้ ${out.length}`);
  for (const c of out) {
    assert.ok(c.text.length <= CHUNK_OPTS.max, `chunk ยาว ${c.text.length} เกิน max`);
  }
});

test('ตัดที่ขอบย่อหน้า ไม่ตัดกลางย่อหน้าถ้าเลี่ยงได้', () => {
  const out = chunkPages('doc1', [{ page: 1, text: [para(600), para(600)].join('\n\n') }]);
  assert.ok(out.every(c => !c.text.startsWith('\n')));
});

test('จับหัวข้อมาใส่ heading', () => {
  const text = '3.5 โรคเชื้อราในช่องคลอด (Vulvovaginal Candidiasis)\n\n' + para(400);
  const out = chunkPages('doc1', [{ page: 91, text }]);
  assert.match(out[0].heading, /เชื้อราในช่องคลอด/);
});

test('หน้าถัดไปได้ overlap ท้ายหน้าก่อนมานำหน้า', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: para(400) + 'จบหน้าหนึ่ง' },
    { page: 2, text: 'เริ่มหน้าสอง' + para(400) },
  ]);
  const p2 = out.find(c => c.page === 2);
  assert.ok(p2.text.includes('จบหน้าหนึ่ง'), 'chunk แรกของหน้า 2 ควรมีท้ายหน้า 1');
});

test('ข้ามหน้าว่างและ chunk ที่สั้นกว่า min', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: '   ' },
    { page: 2, text: 'สั้นมาก' },
    { page: 3, text: para(500) },
  ]);
  assert.deepStrictEqual(out.map(c => c.page), [3]);
});

test('chunkId ไม่ซ้ำกันทั้ง document', () => {
  const out = chunkPages('doc1', [
    { page: 1, text: [para(700), para(700)].join('\n\n') },
    { page: 2, text: [para(700), para(700)].join('\n\n') },
  ]);
  assert.strictEqual(new Set(out.map(c => c.chunkId)).size, out.length);
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `cd setup && node --test test/chunk.test.js`
Expected: FAIL — `Cannot find module '../lib/chunk'`

- [ ] **Step 3: เขียน implementation**

```js
// ============================================================
//  chunk.js
//  ข้อความรายหน้า -> chunks พร้อม metadata สำหรับทำ citation
//
//  chunk ไม่คร่อมหน้า เพราะเราแสดงเลขหน้าเป็น citation ต่อนักศึกษา
//  แต่ prepend ท้ายหน้าก่อนเป็น overlap กันประโยคแรกลอย
// ============================================================

const { repairThai } = require('./thai-repair');

const CHUNK_OPTS = { target: 1000, min: 300, max: 1400, overlap: 150 };

// หัวข้อ: ขึ้นต้นด้วยเลขข้อ (3.5, 1., 2.3.1) หรือคำนำหัวข้อไทยที่พบในไกด์ไลน์
const HEADING_RE = /^(?:\d+(?:\.\d+)*\.?\s+\S.{0,90}|(?:บทที่|ตอนที่|หัวข้อ|ภาคผนวก)\s*\S.{0,90})$/;

function detectHeading(block, fallback) {
  const first = block.split('\n')[0].trim();
  return HEADING_RE.test(first) ? first : fallback;
}

// รวมย่อหน้าให้ได้ขนาดใกล้ target โดยไม่เกิน max
function packBlocks(blocks) {
  const out = [];
  let buf = '';
  for (const b of blocks) {
    if (!buf) { buf = b; continue; }
    if (buf.length + 2 + b.length <= CHUNK_OPTS.target) {
      buf += '\n\n' + b;
    } else {
      out.push(buf);
      buf = b;
    }
  }
  if (buf) out.push(buf);

  // ย่อหน้าเดี่ยวที่ยาวเกิน max -> หักตามความยาว
  const final = [];
  for (const piece of out) {
    if (piece.length <= CHUNK_OPTS.max) { final.push(piece); continue; }
    for (let i = 0; i < piece.length; i += CHUNK_OPTS.target) {
      final.push(piece.slice(i, i + CHUNK_OPTS.target));
    }
  }
  return final;
}

function chunkPages(docId, pages, opts = {}) {
  const o = { ...CHUNK_OPTS, ...opts };
  const chunks = [];
  let tailPrev = '';   // ท้ายหน้าก่อน ใช้เป็น overlap
  let heading = '';    // หัวข้อล่าสุดที่เจอ — สืบทอดข้ามหน้า

  for (const { page, text } of pages) {
    const clean = repairThai(text).replace(/\r/g, '').trim();
    if (!clean) continue;

    const blocks = clean.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
    if (!blocks.length) continue;

    heading = detectHeading(clean, heading);

    const packed = packBlocks(blocks);
    packed.forEach((body, i) => {
      const withOverlap = (i === 0 && tailPrev) ? `${tailPrev}\n\n${body}` : body;
      if (withOverlap.trim().length < o.min) return;
      chunks.push({
        chunkId: `${docId}_p${String(page).padStart(3, '0')}_${i}`,
        docId,
        page,
        heading,
        text: withOverlap.slice(0, o.max),
      });
    });

    tailPrev = clean.slice(-o.overlap);
  }

  return chunks;
}

module.exports = { chunkPages, CHUNK_OPTS };
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd setup && node --test test/chunk.test.js`
Expected: PASS ทั้ง 7 tests

- [ ] **Step 5: dry-run กับ cache จริงแล้วตาดู (spec Testing ข้อ 2)**

```bash
cd setup && node -e "
const fs=require('fs'),path=require('path');
const {chunkPages}=require('./lib/chunk');
const docId='ccpe461_uri';
const dir=path.join('guidelines','.extracted',docId);
const pages=fs.readdirSync(dir).sort().map(f=>({
  page:parseInt(f.match(/p(\d+)/)[1],10),
  text:fs.readFileSync(path.join(dir,f),'utf8')
}));
const cs=chunkPages(docId,pages);
console.log('chunks:',cs.length);
cs.slice(0,5).forEach(c=>{
  console.log('─'.repeat(70));
  console.log(c.chunkId,'| หน้า',c.page,'| heading:',c.heading||'(ไม่มี)','| ยาว',c.text.length);
  console.log(c.text.slice(0,200).replace(/\n/g,' '));
});
"
```
Expected: อ่านรู้เรื่อง ไม่มีสระซ้อน ไม่มี `ส า` ไม่ตัดกลางตาราง ไม่มีขยะ header/footer ซ้ำทุก chunk
ถ้าเจอ header/footer ซ้ำ ให้เพิ่มการกรองบรรทัดที่ปรากฏซ้ำในทุกหน้า แล้วเพิ่ม test ครอบ

- [ ] **Step 6: Commit**

```bash
git add setup/lib/chunk.js setup/test/chunk.test.js
git commit -m "feat(rag): page-scoped chunker with heading + cross-page overlap"
```

---

### Task 4: แกนคณิตค้นคืน (`rag-core.js`)

**Files:**
- Create: `js/rag-core.js`
- Test: `setup/test/rag-core.test.js`

**Interfaces:**
- Consumes: (ไม่มี)
- Produces: ทั้ง global `RAGCore` (เบราว์เซอร์) และ `module.exports` (Node)

```js
// quantize(vec: number[]) => string            base64 ของ Int8Array (normalize ให้ก่อนข้างใน)
// dequantize(b64: string) => Float32Array      ค่าอยู่ราว [-1,1]
// cosine(a: ArrayLike<number>, b: ArrayLike<number>) => number
// mergeTopK(lists: Array<Array<Hit>>, k: number) => Array<Hit>   Hit = {chunkId, docId, score}
//   ถ้า chunkId ซ้ำข้าม list -> เก็บ score สูงสุด
// capPerDoc(hits: Array<Hit>, maxPerDoc: number) => Array<Hit>   คงลำดับเดิม
```

- [ ] **Step 1: เขียน failing test**

```js
// setup/test/rag-core.test.js
const test = require('node:test');
const assert = require('node:assert');
const { quantize, dequantize, cosine, mergeTopK, capPerDoc } = require('../../js/rag-core');

function randVec(n, seed = 1) {
  const out = [];
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; out.push(s / 2147483648 - 0.5); }
  return out;
}

test('quantize -> dequantize เพี้ยนน้อยกว่า 1% (cosine กับต้นฉบับ > 0.99)', () => {
  const v = randVec(768);
  const back = dequantize(quantize(v));
  assert.strictEqual(back.length, 768);
  assert.ok(cosine(v, back) > 0.99, `cosine=${cosine(v, back)}`);
});

test('cosine ของ vector เดียวกัน = 1, ตั้งฉาก = 0', () => {
  assert.ok(Math.abs(cosine([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0, 0], [0, 1, 0])) < 1e-9);
});

test('cosine ไม่ขึ้นกับความยาว vector', () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
});

test('cosine กับ zero vector คืน 0 ไม่ใช่ NaN', () => {
  assert.strictEqual(cosine([0, 0, 0], [1, 2, 3]), 0);
});

test('mergeTopK รวมหลาย list เรียงจากมากไปน้อย ตัดที่ k', () => {
  const out = mergeTopK([
    [{ chunkId: 'a', docId: 'd1', score: 0.9 }, { chunkId: 'b', docId: 'd1', score: 0.5 }],
    [{ chunkId: 'c', docId: 'd2', score: 0.7 }],
  ], 2);
  assert.deepStrictEqual(out.map(h => h.chunkId), ['a', 'c']);
});

test('mergeTopK เจอ chunkId ซ้ำ เก็บคะแนนสูงสุด ไม่ซ้ำในผลลัพธ์', () => {
  const out = mergeTopK([
    [{ chunkId: 'a', docId: 'd1', score: 0.4 }],
    [{ chunkId: 'a', docId: 'd1', score: 0.8 }],
  ], 5);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].score, 0.8);
});

test('capPerDoc จำกัดจำนวนต่อเอกสารและคงลำดับ', () => {
  const hits = [
    { chunkId: 'a', docId: 'd1', score: 0.9 },
    { chunkId: 'b', docId: 'd1', score: 0.8 },
    { chunkId: 'c', docId: 'd1', score: 0.7 },
    { chunkId: 'd', docId: 'd2', score: 0.6 },
  ];
  assert.deepStrictEqual(capPerDoc(hits, 2).map(h => h.chunkId), ['a', 'b', 'd']);
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `cd setup && node --test test/rag-core.test.js`
Expected: FAIL — `Cannot find module '../../js/rag-core'`

- [ ] **Step 3: เขียน implementation**

```js
// ============================================================
//  rag-core.js
//  คณิตค้นคืน — ไม่มี I/O ไม่มี dependency
//
//  ⚠️ ไฟล์นี้ต้องรันได้ทั้งเบราว์เซอร์ (global scope) และ Node (require)
//     ห้ามใช้ require ข้างใน / ห้ามใช้ ESM import
//     ใช้ร่วมกันเพื่อให้ผลค้นคืนตอน offline audit ตรงกับที่นักศึกษาเจอจริง
// ============================================================

// normalize เป็น unit vector แล้ว scale ด้วย 127 คงที่ — ไม่ต้องเก็บ scale ต่อ vector
function quantize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    q[i] = Math.max(-127, Math.min(127, Math.round((vec[i] / norm) * 127)));
  }
  let bin = '';
  const bytes = new Uint8Array(q.buffer);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
}

function dequantize(b64) {
  let bytes;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const q = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 127;
  return out;
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mergeTopK(lists, k) {
  const best = new Map();
  for (const list of lists || []) {
    for (const hit of list || []) {
      const prev = best.get(hit.chunkId);
      if (!prev || hit.score > prev.score) best.set(hit.chunkId, { ...hit });
    }
  }
  return [...best.values()].sort((x, y) => y.score - x.score).slice(0, k);
}

function capPerDoc(hits, maxPerDoc) {
  const seen = new Map();
  const out = [];
  for (const h of hits) {
    const n = seen.get(h.docId) || 0;
    if (n >= maxPerDoc) continue;
    seen.set(h.docId, n + 1);
    out.push(h);
  }
  return out;
}

const RAGCore = { quantize, dequantize, cosine, mergeTopK, capPerDoc };
if (typeof module !== 'undefined') module.exports = RAGCore;
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd setup && node --test test/rag-core.test.js`
Expected: PASS ทั้ง 7 tests

- [ ] **Step 5: ยืนยันว่าไฟล์ใช้ได้ในเบราว์เซอร์ด้วย (ไม่ใช่แค่ Node)**

Run: `node --check js/rag-core.js && grep -c "require(" js/rag-core.js`
Expected: syntax ผ่าน และ `grep -c` คืน `0` (ไม่มี `require` ในไฟล์ — ถ้ามี เบราว์เซอร์จะพัง)

- [ ] **Step 6: Commit**

```bash
git add js/rag-core.js setup/test/rag-core.test.js
git commit -m "feat(rag): shared retrieval core (cosine, int8 quantize, topK, per-doc cap)

รันได้ทั้งเบราว์เซอร์และ Node โดยไม่มี build step — offline audit
จะได้ผลค้นคืนตรงกับที่นักศึกษาเจอจริง"
```

---

### Task 5: สรุปไทย + embed + เขียน Firestore (`embed.js`, `index-guidelines.js`)

**Files:**
- Create: `setup/lib/embed.js`
- Create: `setup/index-guidelines.js`
- Test: `setup/test/embed.test.js`

**Interfaces:**
- Consumes: `chunkPages` (Task 3) · `quantize` (Task 4) · cache จาก Task 2
- Produces:

```js
// setup/lib/embed.js
module.exports = { summarizeChunks, embedTexts, chunkHash, shardEntries, buildEmbedInput };
// summarizeChunks(chunks, apiKey) => Promise<Array<{summaryTh: string, keywords: string[]}>>
//     เรียก gemini-2.5-flash แบบ batch 10 chunk ต่อ request
// embedTexts(texts: string[], apiKey) => Promise<number[][]>   768 มิติ
// chunkHash(chunk) => string           sha1 ของ docId|page|chunkId|text
// shardEntries(entries, size=600) => Array<Array<entry>>
// buildEmbedInput({summaryTh, keywords, text}) => string
```

Firestore ที่เขียน (ตาม spec):
- `/guidelineIndex/{groupId}_{shard}` → `{ corpusVersion, groupId, shard, entries: [{chunkId, docId, page, heading, summaryTh, keywords, emb}] }`
- `/guidelineChunks/{chunkId}` → `{ docId, page, heading, text, summaryTh, corpusVersion, hash }`
- `/config/rag` → `{ corpusVersion, enabled: false, topK: 6, minScore: null }`

`enabled: false` ตอน seed — เปิดหลัง Task 6 วัด recall ผ่านเกณฑ์แล้วเท่านั้น

- [ ] **Step 1: เขียน failing test เฉพาะส่วน pure (ส่วนเรียก network ทดสอบด้วย dry-run ใน Step 5)**

```js
// setup/test/embed.test.js
const test = require('node:test');
const assert = require('node:assert');
const { chunkHash, shardEntries, buildEmbedInput } = require('../lib/embed');

test('chunkHash คงที่สำหรับ input เดิม และเปลี่ยนเมื่อข้อความเปลี่ยน', () => {
  const c = { docId: 'd1', page: 3, chunkId: 'd1_p003_0', text: 'abc' };
  assert.strictEqual(chunkHash(c), chunkHash({ ...c }));
  assert.notStrictEqual(chunkHash(c), chunkHash({ ...c, text: 'abd' }));
  assert.notStrictEqual(chunkHash(c), chunkHash({ ...c, page: 4 }));
});

test('shardEntries แบ่งไม่เกินขนาดที่กำหนดและไม่ตกหล่น', () => {
  const entries = Array.from({ length: 1301 }, (_, i) => ({ chunkId: `c${i}` }));
  const shards = shardEntries(entries, 600);
  assert.strictEqual(shards.length, 3);
  assert.deepStrictEqual(shards.map(s => s.length), [600, 600, 101]);
  assert.strictEqual(shards.flat().length, 1301);
});

test('shardEntries กับ list ว่างคืน array ว่าง', () => {
  assert.deepStrictEqual(shardEntries([], 600), []);
});

test('buildEmbedInput เอาสรุปไทยขึ้นก่อน แล้ว keywords แล้วต้นฉบับที่ตัดสั้น', () => {
  const s = buildEmbedInput({
    summaryTh: 'สรุปสั้น',
    keywords: ['หนองใน', 'ceftriaxone'],
    text: 'x'.repeat(900),
  });
  assert.ok(s.startsWith('สรุปสั้น'));
  assert.ok(s.includes('หนองใน ceftriaxone'));
  assert.ok(s.length < 900, 'ต้องตัดต้นฉบับให้สั้นลง');
});
```

- [ ] **Step 2: รัน test ให้เห็นว่าแดง**

Run: `cd setup && node --test test/embed.test.js`
Expected: FAIL — `Cannot find module '../lib/embed'`

- [ ] **Step 3: เขียน embed.js**

```js
// ============================================================
//  embed.js
//  สรุปไทย + embed ต่อ chunk (เรียก Gemini)
//
//  เหตุที่ embed "สรุปภาษาไทย" ไม่ใช่ข้อความดิบ:
//  คลังมีทั้งไทยและอังกฤษ ถ้า embed ต้นฉบับ query ไทยจะดึง chunk
//  อังกฤษไม่เจอ — สรุปไทยทำให้ทุก chunk อยู่ในปริภูมิภาษาเดียวกัน
//  และได้ข้อความที่แสดงเป็น citation ต่อนักศึกษาได้เลยโดยไม่ต้องคัดลอกต้นฉบับ
// ============================================================

const crypto = require('crypto');

const EMBED_MODEL = 'gemini-embedding-2';
const GEN_MODEL   = 'gemini-2.5-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DIMS = 768;

function chunkHash(c) {
  return crypto.createHash('sha1')
    .update(`${c.docId}|${c.page}|${c.chunkId}|${c.text}`)
    .digest('hex');
}

function shardEntries(entries, size = 600) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size));
  return out;
}

function buildEmbedInput({ summaryTh, keywords, text }) {
  const kw = (keywords || []).join(' ');
  return `${summaryTh || ''}\n${kw}\n${(text || '').slice(0, 500)}`.trim();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// batch 10 chunk ต่อ request — ขอ JSON กลับมาเป็น array
async function summarizeChunks(chunks, apiKey, batchSize = 10) {
  const out = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const listed = batch
      .map((c, j) => `<<<${j}>>>\n[หัวข้อ: ${c.heading || '-'}]\n${c.text.slice(0, 1500)}`)
      .join('\n\n');

    const prompt = `คุณคือผู้ช่วยจัดทำดัชนีค้นคืนเอกสารแนวทางเวชปฏิบัติสำหรับเภสัชกรร้านยา
สำหรับข้อความแต่ละชิ้นด้านล่าง ให้สรุปเป็นภาษาไทย 1 ประโยค (ไม่เกิน 40 คำ) ว่าชิ้นนั้น "บอกอะไร"
และให้คำค้นภาษาไทย 3-6 คำ (ใส่ชื่อยาเป็นภาษาอังกฤษได้ถ้ามีในข้อความ)

กฎ:
- สรุปจากข้อความที่ให้เท่านั้น ห้ามเพิ่มความรู้จากที่อื่น
- ถ้าเป็นตารางขนาดยา ให้ระบุว่าเป็นขนาดยาของโรค/ยาอะไร
- ถ้าเป็นเนื้อหาทั่วไปที่ไม่มีสาระทางคลินิก (คำนำ กิตติกรรมประกาศ สารบัญ) ให้ summaryTh เป็น "" และ keywords เป็น []

ตอบเป็น JSON array เท่านั้น ห้ามใส่ backtick ความยาว array ต้องเท่ากับจำนวนชิ้นที่ให้
[{"i":0,"summaryTh":"...","keywords":["...","..."]}]

${listed}`;

    const data = await postJson(`${API}/${GEN_MODEL}:generateContent?key=${apiKey}`, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = []; }

    // จับคู่ด้วย i กันโมเดลสลับลำดับ — ขาดตัวไหนเติมค่าว่าง ไม่ทำให้ pipeline ล้ม
    batch.forEach((c, j) => {
      const m = Array.isArray(parsed) ? parsed.find(p => Number(p.i) === j) : null;
      out.push({
        summaryTh: (m?.summaryTh || '').trim(),
        keywords: Array.isArray(m?.keywords) ? m.keywords.filter(Boolean).slice(0, 6) : [],
      });
    });

    process.stdout.write(`\r   สรุป ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
  }
  process.stdout.write('\n');
  return out;
}

async function embedTexts(texts, apiKey, batchSize = 50) {
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const data = await postJson(`${API}/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`, {
      requests: batch.map(t => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: DIMS,
        taskType: 'RETRIEVAL_DOCUMENT',
      })),
    });
    const embs = (data.embeddings || []).map(e => e.values || e.value);
    if (embs.length !== batch.length) {
      throw new Error(`embed คืนมา ${embs.length} ตัว แต่ส่งไป ${batch.length}`);
    }
    out.push(...embs);
    process.stdout.write(`\r   embed ${out.length}/${texts.length}`);
  }
  process.stdout.write('\n');
  return out;
}

module.exports = {
  summarizeChunks, embedTexts, chunkHash, shardEntries, buildEmbedInput,
  EMBED_MODEL, GEN_MODEL, DIMS,
};
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `cd setup && node --test test/embed.test.js`
Expected: PASS ทั้ง 4 tests

- [ ] **Step 5: เขียน index-guidelines.js**

```js
// ============================================================
//  index-guidelines.js
//  pipeline หลัก: cache -> chunk -> สรุปไทย -> embed -> Firestore
//
//  วิธีใช้:
//    node index-guidelines.js --dry            ไม่เขียน Firestore ไม่เรียก API
//    node index-guidelines.js --doc ccpe461_uri
//    node index-guidelines.js                  ทั้งคลัง
//
//  idempotent: chunk ที่ hash ไม่เปลี่ยน จะไม่ถูก embed ซ้ำ
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const { chunkPages } = require('./lib/chunk');
const { quantize }   = require('../js/rag-core');
const {
  summarizeChunks, embedTexts, chunkHash, shardEntries, buildEmbedInput,
} = require('./lib/embed');

const GUIDE = path.join(__dirname, 'guidelines');
const CACHE = path.join(GUIDE, '.extracted');

const args   = process.argv.slice(2);
const DRY    = args.includes('--dry');
const ONLY   = args.includes('--doc') ? args[args.indexOf('--doc') + 1] : null;

function loadCachedPages(docId) {
  const dir = path.join(CACHE, docId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^p\d+\.txt$/.test(f))
    .sort()
    .map(f => ({
      page: parseInt(f.match(/p(\d+)/)[1], 10),
      text: fs.readFileSync(path.join(dir, f), 'utf8'),
    }));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(GUIDE, 'manifest.json'), 'utf8'));
  const corpusVersion = manifest.corpusVersion;
  if (!corpusVersion) throw new Error('manifest.json ไม่มี corpusVersion');

  let db = null, apiKey = null;
  if (!DRY) {
    const keyPath = path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) { console.error('\n❌  ไม่พบ serviceAccountKey.json\n'); process.exit(1); }
    admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
    db = admin.firestore();
    const snap = await db.collection('config').doc('gemini').get();
    apiKey = snap.data()?.apiKey;
    if (!apiKey) { console.error('\n❌  /config/gemini.apiKey ว่าง\n'); process.exit(1); }
  }

  // ── 1. chunk ทุก doc ──
  const byGroup = {};   // groupId -> entries[]
  const allChunks = []; // { chunk, doc }
  for (const doc of manifest.docs) {
    if (ONLY && doc.id !== ONLY) continue;
    const pages = loadCachedPages(doc.id);
    if (!pages.length) {
      console.warn(`⚠️  ${doc.id}: ไม่มี cache — รัน extract-pdf.py ก่อน (หรือยังไม่ได้ทำ extract=gemini)`);
      continue;
    }
    const chunks = chunkPages(doc.id, pages);
    console.log(`${doc.id.padEnd(20)} ${pages.length} หน้า -> ${chunks.length} chunk`);
    chunks.forEach(c => allChunks.push({ chunk: c, doc }));
  }

  if (!allChunks.length) { console.error('ไม่มี chunk เลย — หยุด'); process.exit(1); }
  console.log(`\nรวม ${allChunks.length} chunk`);

  if (DRY) {
    console.log('\n--dry: หยุดก่อนเรียก API และก่อนเขียน Firestore');
    console.log('ตัวอย่าง 3 chunk แรก:');
    allChunks.slice(0, 3).forEach(({ chunk }) => {
      console.log('─'.repeat(70));
      console.log(chunk.chunkId, '| หน้า', chunk.page, '|', chunk.heading || '(ไม่มีหัวข้อ)');
      console.log(chunk.text.slice(0, 200).replace(/\n/g, ' '));
    });
    return;
  }

  // ── 2. ข้าม chunk ที่ hash ไม่เปลี่ยน ──
  const existing = new Map();
  const snap = await db.collection('guidelineChunks')
    .where('corpusVersion', '==', corpusVersion).get();
  snap.forEach(d => existing.set(d.id, d.data().hash));

  // ต้องโหลดดัชนีเดิมมาด้วย ไม่ใช่แค่ hash — chunk ที่ข้ามไปยังต้องมี
  // embedding/summaryTh ประกอบเข้าดัชนีใหม่ ไม่งั้นรันซ้ำแล้วดัชนีจะว่าง
  const prevEntries = new Map();   // chunkId -> { emb, summaryTh, keywords }
  const idxSnap = await db.collection('guidelineIndex')
    .where('corpusVersion', '==', corpusVersion).get();
  idxSnap.forEach(d => {
    for (const e of d.data().entries || []) {
      if (!prevEntries.has(e.chunkId)) {
        prevEntries.set(e.chunkId, { emb: e.emb, summaryTh: e.summaryTh, keywords: e.keywords || [] });
      }
    }
  });

  const todo = allChunks.filter(({ chunk }) =>
    existing.get(chunk.chunkId) !== chunkHash(chunk) || !prevEntries.has(chunk.chunkId)
  );
  console.log(`ต้องประมวลผลใหม่ ${todo.length} chunk (ใช้ของเดิม ${allChunks.length - todo.length})`);

  // ── 3. สรุปไทย + embed ──
  let meta = [], embs = [];
  if (todo.length) {
    meta = await summarizeChunks(todo.map(t => t.chunk), apiKey);
    const inputs = todo.map((t, i) => buildEmbedInput({ ...meta[i], text: t.chunk.text }));
    embs = await embedTexts(inputs, apiKey);
  }

  // ── 4. เขียน /guidelineChunks ──
  let batch = db.batch(), n = 0;
  for (let i = 0; i < todo.length; i++) {
    const { chunk } = todo[i];
    batch.set(db.collection('guidelineChunks').doc(chunk.chunkId), {
      docId: chunk.docId, page: chunk.page, heading: chunk.heading,
      text: chunk.text, summaryTh: meta[i].summaryTh,
      corpusVersion, hash: chunkHash(chunk),
    });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`เขียน /guidelineChunks ${todo.length} รายการ`);

  // ── 5. ประกอบดัชนีจาก chunk ทั้งหมด (ทั้งใหม่และเดิม) ──
  const embByChunk = new Map();
  todo.forEach((t, i) => embByChunk.set(t.chunk.chunkId, { emb: quantize(embs[i]), ...meta[i] }));

  let reused = 0;
  for (const { chunk, doc } of allChunks) {
    // chunk ที่ประมวลผลรอบนี้ -> ของใหม่ / chunk ที่ข้าม -> ของเดิมจากดัชนี
    let e = embByChunk.get(chunk.chunkId);
    if (!e) { e = prevEntries.get(chunk.chunkId); if (e) reused++; }
    if (!e || !e.emb) continue;           // ไม่มี embedding ใช้ไม่ได้ ข้าม
    if (!e.summaryTh) continue;           // chunk ที่โมเดลตีว่าไม่มีสาระคลินิก — ไม่เข้าดัชนี
    for (const g of doc.groups) {
      (byGroup[g] ||= []).push({
        chunkId: chunk.chunkId, docId: chunk.docId, page: chunk.page,
        heading: chunk.heading, summaryTh: e.summaryTh, keywords: e.keywords, emb: e.emb,
      });
    }
  }

  // ── 6. เขียน /guidelineIndex เป็น shard ──
  for (const [groupId, entries] of Object.entries(byGroup)) {
    const shards = shardEntries(entries, 600);
    for (let s = 0; s < shards.length; s++) {
      await db.collection('guidelineIndex').doc(`${groupId}_${s}`)
        .set({ corpusVersion, groupId, shard: s, entries: shards[s] });
      const kb = Math.round(JSON.stringify(shards[s]).length / 1024);
      console.log(`/guidelineIndex/${groupId}_${s}  ${shards[s].length} entries  ~${kb} KB`);
      if (kb > 900) console.warn('   ⚠️  ใกล้ชน Firestore 1 MB — ลดขนาด shard');
    }
  }
  console.log(`(ใช้ embedding เดิม ${reused} chunk)`);

  // ── 7. /config/rag — enabled: false จนกว่าจะวัด recall ผ่าน (Task 6) ──
  await db.collection('config').doc('rag').set(
    { corpusVersion, enabled: false, topK: 6, minScore: null }, { merge: true }
  );
  console.log('\n/config/rag เขียนแล้ว (enabled: false — เปิดหลังวัด recall ผ่านเกณฑ์)');
}

main().then(() => process.exit(0)).catch(e => { console.error('\n❌', e); process.exit(1); });
```

- [ ] **Step 6: dry-run ก่อน (ไม่ใช้ API ไม่แตะ Firestore)**

Run: `cd setup && node index-guidelines.js --dry`
Expected: แสดงจำนวน chunk ต่อ doc, ยอดรวม, และ 3 chunk ตัวอย่างที่อ่านรู้เรื่อง — ไม่มี error

- [ ] **Step 7: รันจริงกับ 1 doc เล็กก่อน แล้วตรวจ Firestore**

```bash
cd setup && node index-guidelines.js --doc ccpe953_uti
```
Expected: สรุปไทยเดินครบ, embed เดินครบ, เขียน `/guidelineChunks` และ `/guidelineIndex/GU_STI_0`, ไม่มีคำเตือนใกล้ชน 1 MB

ตรวจว่าสรุปไทยสมเหตุสมผล (สำคัญ — ถ้าสรุปเพี้ยน retrieval พังทั้งระบบ):

```bash
cd setup && node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('guidelineChunks').limit(8).get().then(s=>{
  s.forEach(d=>console.log('•',d.data().page,'|',d.data().summaryTh));
  process.exit(0);
});
"
```
Expected: แต่ละบรรทัดเป็นภาษาไทยที่บอกได้ว่า chunk นั้นพูดเรื่องอะไร ไม่ใช่ข้อความว่างหรือภาษาอังกฤษ

- [ ] **Step 8: รันทั้งคลัง**

Run: `cd setup && node index-guidelines.js`
Expected: ทุก doc ที่มี cache ถูก index (`sti_ddc_2567` จะเตือนว่าไม่มี cache — ถูกต้อง รอ `extract=gemini` ซึ่งไม่อยู่ใน plan นี้)

- [ ] **Step 9: Commit**

```bash
git add setup/lib/embed.js setup/index-guidelines.js setup/test/embed.test.js
git commit -m "feat(rag): thai-summary + embedding indexer writing Firestore

embed สรุปภาษาไทยแทนข้อความดิบ เพื่อให้ query ไทยดึง chunk อังกฤษเจอ
/config/rag.enabled = false จนกว่าจะวัด recall ผ่านเกณฑ์"
```

---

### Task 6: เครื่องวัดคุณภาพการค้นคืน (`eval-retrieval.js`)

**Files:**
- Create: `setup/eval-queries.json`
- Create: `setup/eval-retrieval.js`

**Interfaces:**
- Consumes: `/guidelineIndex/*` (Task 5) · `dequantize`, `cosine`, `mergeTopK`, `capPerDoc` (Task 4) · `embedTexts` (Task 5)
- Produces: รายงาน recall@6 ต่อ query และรวม — **เกณฑ์ผ่าน ≥ 0.8** (spec Testing ข้อ 3)

**นี่คือด่านตัดสินของ plan นี้** ถ้าไม่ผ่าน ห้ามเปิด `enabled: true` และห้ามเริ่ม runtime — ต้องกลับไปปรับ chunk size หรือเพิ่ม keyword search ผสมก่อน

- [ ] **Step 1: เขียนชุด query ทดสอบ**

`expectDocs` = doc ที่ยอมรับได้ (เจออันใดอันหนึ่งถือว่าผ่าน) เขียนจากตำแหน่งเนื้อหาที่ยืนยันแล้วใน spec

```json
{
  "note": "recall@6 — นับว่าผ่านถ้า top-6 มี chunk จาก expectDocs อย่างน้อย 1 ตัว",
  "queries": [
    { "q": "เจ็บคอจากเชื้อแบคทีเรีย group A streptococcus ใช้ยาปฏิชีวนะตัวไหน", "group": "RESP", "expectDocs": ["ccpe461_uri"] },
    { "q": "เกณฑ์แยกเจ็บคอจากไวรัสกับแบคทีเรีย", "group": "RESP", "expectDocs": ["ccpe461_uri"] },
    { "q": "คอหอยอักเสบเฉียบพลันรักษากี่วัน", "group": "RESP", "expectDocs": ["ccpe461_uri"] },
    { "q": "แพ้ยา penicillin ใช้ยาปฏิชีวนะอะไรแทนในการรักษาเจ็บคอ", "group": "RESP", "expectDocs": ["ccpe461_uri"] },
    { "q": "ไซนัสอักเสบเมื่อไรควรให้ยาปฏิชีวนะ", "group": "RESP", "expectDocs": ["ccpe461_uri"] },
    { "q": "โรคจมูกอักเสบภูมิแพ้แบ่งความรุนแรงอย่างไร", "group": "RESP", "expectDocs": ["ar_th_2565"] },
    { "q": "ยาพ่นจมูกสเตียรอยด์ใช้เมื่อไรในโรคภูมิแพ้", "group": "RESP", "expectDocs": ["ar_th_2565"] },
    { "q": "antihistamine รุ่นที่สองสำหรับโรคจมูกอักเสบภูมิแพ้", "group": "RESP", "expectDocs": ["ar_th_2565"] },
    { "q": "อาการคันช่องคลอดตกขาวเป็นก้อนขาวรักษาอย่างไร", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "clotrimazole เหน็บช่องคลอดขนาดเท่าไร", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "fluconazole กินครั้งเดียวรักษาเชื้อราในช่องคลอด", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "หนองในแท้รักษาด้วยยาอะไร ceftriaxone ขนาดเท่าไร", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "ผู้ป่วยหนองในต้องรักษาคู่นอนด้วยหรือไม่", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "เภสัชกรร้านยาควรส่งต่อผู้ป่วยโรคติดต่อทางเพศสัมพันธ์เมื่อไร", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "trichomoniasis รักษาด้วย metronidazole ขนาดเท่าไร", "group": "GU_STI", "expectDocs": ["ccpe739_std"] },
    { "q": "ปัสสาวะแสบขัดในผู้หญิงไม่มีภาวะแทรกซ้อนรักษาอย่างไร", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "uncomplicated cystitis ให้ยากี่วัน", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "แยก uncomplicated กับ complicated UTI อย่างไร", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "ยาปฏิชีวนะ first line สำหรับกระเพาะปัสสาวะอักเสบ", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "UTI ในหญิงตั้งครรภ์ต้องระวังยาอะไร", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "อาการเตือนว่าติดเชื้อทางเดินปัสสาวะส่วนบนต้องส่งต่อ", "group": "GU_STI", "expectDocs": ["ccpe953_uti"] },
    { "q": "เกณฑ์วินิจฉัยไมเกรนที่ไม่มีอาการนำ", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "ยารักษาไมเกรนเฉียบพลันขั้นแรก", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "triptan ใช้เมื่อไรในไมเกรน", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "ยาแก้อาเจียนร่วมกับยาแก้ไมเกรน", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "medication overuse headache เกิดจากอะไร", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "อาการปวดศีรษะที่เป็นสัญญาณเตือนต้องส่งต่อแพทย์", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "ปวดศีรษะจากความเครียดต่างจากไมเกรนอย่างไร", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "ไมเกรนในหญิงตั้งครรภ์ใช้ยาอะไรได้", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] },
    { "q": "การป้องกันไมเกรนใช้ยาอะไร", "group": "NEURO", "expectDocs": ["migraine_cpg_2565"] }
  ]
}
```

- [ ] **Step 2: เขียน eval-retrieval.js**

```js
// ============================================================
//  eval-retrieval.js
//  วัด recall@k ของการค้นคืน — ด่านตัดสินก่อนเปิดใช้งาน RAG
//
//  วิธีใช้:
//    node eval-retrieval.js            k=6 ตาม /config/rag.topK
//    node eval-retrieval.js --k 10
//
//  เกณฑ์ผ่าน: recall@6 >= 0.8 (spec Testing ข้อ 3)
//  ใช้ js/rag-core.js ตัวเดียวกับที่เบราว์เซอร์ใช้ ผลจึงเทียบได้ตรง
// ============================================================

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');
const { dequantize, cosine, mergeTopK, capPerDoc } = require('../js/rag-core');
const { embedTexts } = require('./lib/embed');

const args = process.argv.slice(2);
const K = args.includes('--k') ? parseInt(args[args.indexOf('--k') + 1], 10) : 6;
const MAX_PER_DOC = 2;
const PASS = 0.8;

admin.initializeApp({ credential: admin.credential.cert(require(path.join(__dirname, 'serviceAccountKey.json'))) });
const db = admin.firestore();

async function loadIndex(groupId) {
  const snap = await db.collection('guidelineIndex').where('groupId', '==', groupId).get();
  const entries = [];
  snap.forEach(d => entries.push(...(d.data().entries || [])));
  return entries;
}

async function main() {
  const apiKey = (await db.collection('config').doc('gemini').get()).data()?.apiKey;
  if (!apiKey) throw new Error('/config/gemini.apiKey ว่าง');

  const { queries } = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval-queries.json'), 'utf8'));

  const indexCache = {};
  for (const g of [...new Set(queries.map(q => q.group))]) {
    indexCache[g] = await loadIndex(g);
    console.log(`ดัชนี ${g}: ${indexCache[g].length} entries`);
    if (!indexCache[g].length) throw new Error(`ดัชนี ${g} ว่าง — รัน index-guidelines.js ก่อน`);
  }

  console.log(`\nembed ${queries.length} query...`);
  const qEmbs = await embedTexts(queries.map(q => q.q), apiKey);

  const fails = [];
  const allScores = [];
  let hit = 0;

  queries.forEach((q, i) => {
    const qv = qEmbs[i];
    const scored = indexCache[q.group].map(e => ({
      chunkId: e.chunkId, docId: e.docId, page: e.page,
      summaryTh: e.summaryTh, score: cosine(qv, dequantize(e.emb)),
    }));
    const top = capPerDoc(mergeTopK([scored], K * 3), MAX_PER_DOC).slice(0, K);
    const ok = top.some(t => q.expectDocs.includes(t.docId));
    if (ok) hit++; else fails.push({ q, top });
    if (top[0]) allScores.push(top[0].score);
  });

  const recall = hit / queries.length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`recall@${K} = ${hit}/${queries.length} = ${recall.toFixed(3)}   เกณฑ์ ${PASS}  ${recall >= PASS ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}`);

  const sorted = [...allScores].sort((a, b) => a - b);
  const pct = p => sorted[Math.floor(sorted.length * p)]?.toFixed(3);
  console.log(`\nคะแนน similarity ของอันดับ 1: min ${pct(0)} | p10 ${pct(0.1)} | กลาง ${pct(0.5)} | max ${sorted.at(-1)?.toFixed(3)}`);
  console.log(`→ ใช้ p10 เป็นจุดเริ่มพิจารณาค่า minScore แล้วบันทึกลง /config/rag และลงใน spec`);

  if (fails.length) {
    console.log(`\nquery ที่พลาด ${fails.length} ข้อ:`);
    fails.forEach(({ q, top }) => {
      console.log('─'.repeat(70));
      console.log(`Q: ${q.q}`);
      console.log(`   คาด: ${q.expectDocs.join(', ')}`);
      top.slice(0, 3).forEach(t =>
        console.log(`   ได้: ${t.docId} น.${t.page} (${t.score.toFixed(3)}) ${t.summaryTh.slice(0, 60)}`));
    });
  }

  process.exit(recall >= PASS ? 0 : 1);
}

main().catch(e => { console.error('\n❌', e); process.exit(1); });
```

- [ ] **Step 3: รันวัดผล**

Run: `cd setup && node eval-retrieval.js`
Expected: พิมพ์ `recall@6` พร้อมสถานะผ่าน/ไม่ผ่าน และการกระจายคะแนน

- [ ] **Step 4: ตัดสินตามผล**

- **ผ่าน (≥ 0.8)** → ไปต่อ Step 5
- **ไม่ผ่าน** → **หยุด อย่าข้าม** ไล่ตามลำดับนี้แล้ววัดใหม่ทุกครั้ง:
  1. อ่าน `summaryTh` ของ chunk ที่ควรเจอ — ถ้าสรุปไม่ตรงเนื้อหา ปัญหาอยู่ที่ prompt สรุปใน `embed.js` ไม่ใช่การค้นคืน
  2. ลอง `--k 10` ถ้า recall กระโดดขึ้นมาก แปลว่าอันดับพอใช้แต่ K แคบ → พิจารณาขยับ `topK`
  3. ลด `CHUNK_OPTS.target` เป็น 600 แล้ว index ใหม่ (chunk เล็กลง = เจาะจงขึ้น)
  4. ถ้ายังไม่ผ่าน เพิ่ม keyword search ผสม (คะแนน = 0.7 × cosine + 0.3 × สัดส่วนคำใน `keywords` ที่ตรงกับ query) — ต้องเพิ่มฟังก์ชันใน `rag-core.js` พร้อม unit test

- [ ] **Step 5: บันทึก minScore แล้วเปิดใช้งาน**

```bash
cd setup && node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(require('./serviceAccountKey.json'))});
admin.firestore().collection('config').doc('rag')
  .set({enabled:true, minScore:0.45},{merge:true})   // <-- แทน 0.45 ด้วยค่า p10 ที่วัดได้
  .then(()=>{console.log('/config/rag เปิดใช้งานแล้ว');process.exit(0)});
"
```

แล้วแก้ `docs/specs/2026-08-08-rag-clinical-guidelines.md` ส่วน Firestore schema — เปลี่ยน `minScore` = **ยังไม่กำหนด** เป็นค่าจริงที่วัดได้ พร้อมเขียนกำกับว่าวัดจากอะไร

- [ ] **Step 6: Commit**

```bash
git add setup/eval-queries.json setup/eval-retrieval.js docs/specs/2026-08-08-rag-clinical-guidelines.md
git commit -m "feat(rag): retrieval quality harness with recall@6 gate

30 query ไทยครอบ 3 กลุ่มโรค — เกณฑ์ผ่าน recall@6 >= 0.8
บันทึกค่า minScore ที่วัดได้กลับเข้า spec"
```

---

## หลังจบ plan นี้

**ได้อะไร:** คลังไกด์ไลน์ใน Firestore ที่ค้นคืนได้ + ตัวเลข recall@6 + `minScore` ที่วัดจากข้อมูลจริง + แกน `rag-core.js` ที่ runtime จะใช้ต่อ

**ยังไม่ได้ทำ (แยกเป็น plan ถัดไป):**
1. **ระยะ 3 — runtime** `js/rag.js`, `buildGuidelineBlock()` ใน `prompts.js`, ต่อเข้า `chat.js` Step 4, section อ้างอิงใน `summary.js`, ฟิลด์ `rag*` ใน `/results`
2. **`extract: "gemini"`** สำหรับ `STI_CPG_DDC_2567` และ `f6cdf409` (ฟอนต์ไม่ใช่ Unicode) — คลังใช้งานได้แล้วโดยไม่มีสองไฟล์นี้ เพราะ `ccpe739_std` ครอบ VVC/หนองใน/trichomoniasis ครบ
3. **ระยะ 2 — `brief-case.js`** เครื่องมือช่วยเขียนเคสจากไกด์ไลน์
4. **ระยะ 4 — `audit-case-guidelines.js`** บล็อกอยู่ รอไฟล์เคสจริง 9 เคสจากทีม

**งานนอกขอบเขตที่ค้างจาก spec:** `CLAUDE.md` ล้าสมัย 3 จุด · เคส Stroke ขัดกับ rubric ข้อ `r1` · เคส Gonorrhea ต้องเคาะกับอาจารย์ · ยังต้องหาไกด์ไลน์ N3 Stroke + หมวดข้ามเคส 4 รายการ
