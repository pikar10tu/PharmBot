# Spec — RAG อ้างอิงแนวทางเวชปฏิบัติ (Clinical Guideline Grounding)

วันที่: 2026-08-08
สถานะ: อนุมัติ design แล้ว — รอ implementation plan

## เป้าหมาย

ทำให้ feedback ที่นักศึกษาได้รับหลังจบ session **อ้างอิงแนวทางเวชปฏิบัติจริง** แทนความรู้ทั่วไปของโมเดล
โดยสืบค้นเนื้อหาที่เกี่ยวข้องจากคลังไกด์ไลน์ (semantic search) แล้วส่งเข้า eval prompt พร้อมแสดงแหล่งอ้างอิงในหน้า summary

**แรงจูงใจ (ตามที่ผู้ใช้ระบุ):**
1. ต้องเคลมได้ในเล่มวิจัยว่า feedback อิงไกด์ไลน์ และตรวจย้อนได้
2. อยาก feedback สอนได้ลึกกว่า "ถูก/ผิด"
3. กันเคสที่นักศึกษาจ่ายยา/วินิจฉัยหลุดจาก `drugAnswer` ที่เตรียมไว้

## บริบทงานวิจัย — ข้อจำกัดที่กำหนดทุกอย่าง

**คะแนนจาก AI ในแอปไม่ใช่ตัวแปรตาม** ตัวแปรตามจริงคือคะแนนที่ผู้เชี่ยวชาญให้เอง จากการดูวิดีโอการซักประวัติ
(สอบ pre/post นอกแอปด้วย standardized patient — ดู `DOC/มติทีม_20กค.md`)

ผลที่ตามมา:

| ประเด็น | ข้อสรุป |
|---|---|
| RAG เป็นเครื่องมือวัดหรือไม่ | **ไม่** — เป็นส่วนหนึ่งของ intervention (สื่อการเรียนรู้) |
| ต้องทำ IOC แยกสำหรับ RAG หรือไม่ | **ไม่ต้อง** — ผู้เชี่ยวชาญ IOC เคส + เฉลย + รูบริกอยู่แล้ว ซึ่งเป็นสิ่งเดียวที่กำหนดคะแนน |
| ต้องแยกเป็น 2 Gemini call เพื่อกันไกด์ไลน์ปนคะแนนหรือไม่ | **ไม่ต้อง** — ยัดเข้า eval prompt เดิม call เดียว |
| ข้อจำกัดที่เหลือ | **treatment fidelity** — freeze prompt + corpus + `corpusVersion` ก่อน pretest ห้ามแก้กลางคัน |
| ตำแหน่งในเล่ม | หมวด "การพัฒนาระบบ" (ระยะที่ 1) ไม่ใช่ "เครื่องมือวิจัย" |

คะแนน AI ยังเก็บลง `/results` ต่อไป เพื่อวิเคราะห์ความสอดคล้องกับคะแนนผู้เชี่ยวชาญ (secondary analysis)
→ ถ้า RAG ทำให้ AI ตัดสินใกล้ผู้เชี่ยวชาญขึ้น นั่นเป็นผลการวิจัยที่รายงานได้

**ไม่อยู่ในขอบเขต (non-goals):**
- ไม่แก้กลไกคำนวณคะแนน (`scoreRubric()` คงเดิมทั้งหมด)
- ไม่ทำ UI ให้ admin เปิดดู/ค้นคลังไกด์ไลน์
- ไม่แสดงข้อความไกด์ไลน์ต้นฉบับต่อนักศึกษา (แสดงสรุปไทย + citation เท่านั้น — เหตุผลด้านลิขสิทธิ์)

## คลังเอกสาร (corpus)

ไฟล์อยู่ที่ `DOC/guidelines/` (นอก repo `pharmbot-v2`) — ถ้าย้ายเข้า repo ต้องเพิ่ม `setup/guidelines/` ลง `.gitignore`

`setup/guidelines/manifest.json` เป็น **ตัวตัดสินว่าอะไรถูก index** ไม่ใช่สิ่งที่อยู่ในโฟลเดอร์
→ เก็บไฟล์นอกขอบเขตไว้ในโฟลเดอร์ได้ โดยไม่ใส่ใน manifest

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
      "pages": "3-13",
      "extract": "pypdf"
    },
    {
      "id": "sti_ddc_2567",
      "file": "STI_CPG_DDC_2567.pdf",
      "pages": "10-37,52-60,68-70,81,91-96",
      "extract": "gemini"
    }
  ]
}
```

- `pages` — ระบุช่วงหน้าที่เกี่ยวข้อง (ตัดเนื้อหานอกขอบเขตออกตั้งแต่ต้นทาง ลดค่า API และลด noise ใน retrieval)
- `extract` — `pypdf` \| `gemini` (ดูหัวข้อถัดไป)
- `groups` — แท็ก `RESP` \| `GU_STI` \| `NEURO` ได้หลายกลุ่ม
- `year` — **ต้องอ่านจากหน้าปก/หน้าลิขสิทธิ์ของเอกสารจริง** ห้ามเดาจากชื่อไฟล์หรือ PDF metadata (metadata มักเป็นวันที่บันทึกไฟล์ ไม่ใช่ปีที่เผยแพร่) — ค่านี้ไปแสดงเป็น citation ต่อนักศึกษา

### สถานะความครอบคลุม ณ วันเขียน spec

| เคส | เอกสาร | สถานะ |
|---|---|---|
ยืนยันด้วยการค้นคีย์เวิร์ดในไฟล์จริงทุกช่อง (2026-08-09) ไม่ได้ดูจากชื่อไฟล์

| เคส | เอกสาร | สถานะ |
|---|---|---|
| R1 Bacterial pharyngitis | `CCPE_461` น.1-6 + `RDU_ASU` น.7-10 | ✅ |
| R2 Bacterial sinusitis | `CCPE_461` น.6-10 (ไซนัส/sinusitis/amoxicillin) | ✅ ยืนยันแล้ว |
| R3 Allergic rhinitis | `AR.pdf` (แนวทางฯ ไทย 2565) | ✅ |
| G1 Vulvovaginal candidiasis | `CCPE_739` น.9-11 + `STI_2567` น.91-96 | ✅ |
| G2 Gonorrhea | `CCPE_739` น.3-8 + `STI_2567` น.10-37, 52-60 | ✅ |
| G3 Uncomplicated UTI | `CCPE_953` ทั้งฉบับ | ✅ |
| N1 Migraine without aura | `f6cdf409` (Topic Review) + บทความ CCPE ไมเกรน | ✅ |
| N2 Tension headache | `f6cdf409` น.1-3, 17-22 (tension/ความเครียด/NSAID) | ✅ ยืนยันแล้ว |
| N3 Stroke | `f6cdf409` น.1-7, 15 (ภาวะปวดศีรษะฉุกเฉิน) + น.8, 10 (หลอดเลือดสมอง) + `RDU_ASU`/`CCPE_978` (หลักการส่งต่อ) | ✅ **ปิดช่องแล้ว — เห็นข้อจำกัดด้านล่าง** |
| E1 Trichomoniasis (เคสสอบ) | `CCPE_739` น.8-9 + `STI_2567` น.68-70, 81 | ✅ |
| E2 Pharyngitis แพ้ amoxicillin (เคสสอบ) | `CCPE_461` น.4-5, 8-9, 12-15 (roxithromycin/azithromycin/clindamycin/macrolide) | ✅ ยืนยันแล้ว |

**หมวดข้ามเคส**

| รายการ | สถานะ |
|---|---|
| ประเภทยาตามกฎหมาย (ยาอันตราย/ยาสามัญประจำบ้าน/ยาควบคุมพิเศษ) + GPP | ✅ `CCPE_978_drug_law_categories.pdf` |
| Antibiotic Smart Use / RDU ร้านยา | ✅ `RDU_ASU_community_pharmacy.pdf` |
| บัญชียาหลักแห่งชาติ (NLEM) ฉบับเต็ม | ⬜ ยังไม่มี — `CCPE_978` น.10 อ้างถึงบางส่วน อาจพอสำหรับขอบเขตนี้ |

**สรุปความพร้อมของคลัง: 9/9 เคสฝึก + 2/2 เคสสอบ มีเอกสารรองรับแล้ว** → เริ่มระยะ 1 (indexing) ได้

### N3 Stroke — ตัดสินใจปิดช่องโดยยอมรับข้อจำกัด (2026-08-09)

**สิ่งที่ยังไม่มีในคลัง:** FAST/BEFAST, golden period 4.5 ชั่วโมง, สายด่วน 1669

**เหตุผลที่ยอมรับได้:** `drugAnswer` + `rubric` (ที่ผู้เชี่ยวชาญ IOC) เป็นสิ่งเดียวที่กำหนดคะแนน
RAG ทำหน้าที่เสริมคำอธิบายเท่านั้น → เนื้อหา FAST เขียนลงเฉลยเคสได้โดยตรง ไม่ต้องให้ retrieval ไปดึงมา
ส่วนที่เภสัชกรต้องตัดสินใจจริง (red flag ปวดศีรษะ + หลักการส่งต่อ + ขอบเขตที่ร้านยาทำได้) มีในคลังครบแล้ว

**สิ่งที่ค้นแล้วไม่พบ — อย่าไล่หาซ้ำโดยไม่มีข้อมูลใหม่:**

| แหล่ง | ผล |
|---|---|
| `neurothai.org` หน้า CPG | **หน้าเสีย** — ส่งมาแค่เมนู 1,757 ตัวอักษร มี `Append . -->` ค้างใน template เบราว์เซอร์จริงก็เห็นว่าง |
| `neurothai.org` PDF (เดา URL 6 แบบ) | ทุกอันคืน 26,343 ไบต์เท่ากัน = soft 404 มีจริงแค่ `ischemic-stroke2007.pdf` และ `stroke-nurse2007.pdf` |
| `thaistrokesociety.org` | มีแต่ฉบับ endovascular (ใส่สายสวน ระดับ รพ.ศูนย์) ไม่เกี่ยวกับร้านยา |
| `spd.moph.go.th` Fast Track | HTTP 403 |
| CCPE | ไม่มีบทความ stroke สำหรับร้านยา |

**ถ้าจะปิดช่องนี้จริงในอนาคต** ทางที่เหลือคือขอเอกสารจากอาจารย์/ทีม — เอกสารแนว FAST/ส่งต่อของไทยมักเวียนในเครือข่าย รพ. หรือสมาคม ไม่เปิดสาธารณะ
ได้มาแล้วเพิ่มเข้า `manifest.json` แล้วรัน `index-guidelines.js` ซ้ำได้เลย (idempotent) ไม่ต้องแก้โค้ด

**ไฟล์ในโฟลเดอร์ที่ไม่เข้า manifest:** `Thai DM CPG 2566.pdf` · `Clinical Guidance for Neuropathic Pain.pdf` · `การดูแลรักษาโรคปลายประสาทอักเสบจากโรคเบ.pdf` (นอกขอบเขต) · `hemorrhagic-2008.pdf` (ผิดชนิด) · `Adult_Sinusitis_CPG_2025` (สรุปย่อ ซ้ำกับ CCPE 461) · `495-CPG-migraine-2565` (รอ `extract: "gemini"`)

## การถอดข้อความ — ลูกผสมรายไฟล์

**ผลทดสอบจริง (2026-08-08):** PyMuPDF ไม่ดีกว่า pypdf เลย (เท่ากันทุกไฟล์ บางไฟล์แย่กว่า) → ไม่ใช้

พบความเสียหาย 3 แบบ แก้ได้ไม่เท่ากัน:

| แบบ | ตัวอย่าง | แก้ได้ไหม |
|---|---|---|
| combining mark ซ้ำ | `เวชปฏิิบััติิ` → `เวชปฏิบัติ` | ✅ regex |
| `สำ` แตกเป็น `ส` + เว้นวรรค + `า` | `ส าหรับ` → `สำหรับ`, `ค าแนะน า` → `คำแนะนำ` | ✅ regex |
| `ำ` กลายเป็น U+FFFD | `จ�าเป็น` → `จำเป็น` | ✅ regex |
| แทรก/แทนตัวอักษรผิด | `ข้�อม้ลั` (ควรเป็น `ข้อมูล`) | ❌ ต้อง Gemini |

### ตัวซ่อมข้อความไทย (`setup/lib/thai-repair.js`)

```
MARKS = ั ิ-ฺ ็-๎        (สระบน/ล่าง + วรรณยุกต์ + ทัณฑฆาต)
WS    = [ \t  -​﻿]   (ช่องว่างทุกชนิดที่ PDF แทรก)

1. ยุบ mark ซ้ำติดกัน:  /([MARKS])\1+/  →  $1
   ปลอดภัย — ภาษาไทยไม่มีการซ้ำ combining mark ตัวเดียวกันติดกัน
   (mark ต่างตัวติดกันมีจริง เช่น ตั้ง = ต+ั+้ จึงต้องใช้ backreference ไม่ใช่ character class)
2. ซ่อม ำ ที่แตก:       /([ก-ฮ][MARKS]?)WS+า(?![MARKS])/  →  $1ำ
   ปลอดภัย — า ไม่ขึ้นต้นคำในภาษาไทย ช่องว่างหน้า า จึงเป็นบั๊กเสมอ
3. ซ่อม ำ ที่กลายเป็น U+FFFD: /([ก-ฮ][MARKS]?)�\s*า(?![MARKS])/ → $1ำ
4. ทิ้ง U+FFFD ที่เหลือ — ดีกว่าปล่อยให้ปนเข้า embedding
```

**⚠️ กับดักในกฎข้อ 2 — negative lookahead ต้องเป็น `[MARKS]` เท่านั้น ห้ามใช้ `[ะ-๎]` (0E30-0E4E)**
ช่วง 0E30-0E4E ครอบสระนำ เ แ โ ใ ไ (0E40-0E44) ซึ่งขึ้นต้นคำถัดไปเป็นเรื่องปกติ
ผลคือ `ค าแนะนำ` จะไม่ถูกซ่อม เพราะหลัง `า` เป็น `แ` — เคยเขียนผิดแบบนี้แล้วพลาดไปครึ่งหนึ่งของเคส

### ผลวัดจริงหลังใช้กฎครบ 4 ข้อ (2026-08-09)

สุ่ม 12 หน้าเนื้อหาต่อไฟล์ (ข้ามปก/สารบัญ) นับจุดบกพร่อง แล้วคิดเป็น % ของอักษรไทย

| ไฟล์ | ก่อนซ่อม | หลังซ่อม | เหลือ % | สรุป |
|---|---|---|---|---|
| `CCPE_739_STD_pharmacist.pdf` | 107 | **0** | 0.00% | ✅ pypdf + repair |
| `CCPE_953_community_UTI.pdf` | 0 | **0** | 0.00% | ✅ pypdf + repair |
| `CCPE_461_URI_antibiotics.pdf` | 42 | **0** | 0.00% | ✅ pypdf + repair |
| `CCPE_978_drug_law_categories.pdf` | 1 | **0** | 0.00% | ✅ pypdf + repair |
| `RDU_ASU_community_pharmacy.pdf` | 155 | **0** | 0.00% | ✅ pypdf + repair |
| `AR.pdf` | 85 | **0** | 0.00% | ✅ pypdf + repair |
| `f6cdf4093bd243c29d7036bb107ee501.pdf` | 0 | **0** | 0.00% | ✅ pypdf + repair |
| `STI_CPG_DDC_2567.pdf` | 259 | 86 | 1.00% | ⚠️ ตรวจด้วยตาก่อนตัดสิน |
| `495-CPG-migraine-2565.pdf` | 1331 | 307 | 1.56% | ❌ ต้อง `extract: "gemini"` |

**กลับคำจากที่เคยสรุปไว้:** เดิมเขียนว่า `f6cdf409` ฟอนต์พังต้องใช้ Gemini — วัดกับหน้าเนื้อหาจริงแล้วสะอาด 0 จุดบกพร่อง
(ที่เคยเห็นเพี้ยนคือหน้าปก ซึ่งใช้ฟอนต์คนละตัวกับเนื้อใน) เหลือไฟล์ที่ต้องใช้ Gemini แน่ๆ **1 ไฟล์** คือ CPG ไมเกรน

### ทางเลือก `extract: "gemini"`

ส่งหน้า PDF (ตามช่วงใน `pages`) เข้า Gemini โดยตรง — อ่านจากภาพหน้ากระดาษ ไม่พึ่ง text layer ที่พัง
→ ให้ถอดเป็น Markdown ไทยต่อหน้า เก็บลงไฟล์ `setup/guidelines/.extracted/{docId}/p{n}.md` (cache — รันซ้ำไม่เสียเงินซ้ำ)

- ใช้คีย์เดิมใน `/config/gemini` — **ไม่ต้องสมัคร subscription ใหม่** (แอปเรียก `generateContent` ด้วยคีย์นี้อยู่แล้ว: `js/gemini.js:31,62`)
- โมเดล: `gemini-2.5-flash` (ถ้าต้องประหยัด: `gemini-3.1-flash-lite-preview`)
- ต้องสุ่มตรวจผลถอดด้วยตาก่อนใช้ (ดูหัวข้อ Testing)

**หมายเหตุการลดความเสี่ยง:** ไฟล์ที่ต้องใช้ Gemini เหลือฉบับเดียว (CPG ไมเกรน) และ N1 Migraine ยังมีบทความ CCPE + Topic Review รองรับอยู่แล้ว → เริ่ม index ด้วย pypdf ทั้งคลังได้ทันที ไม่มีอะไรบล็อก

## Firestore schema

| Path | เนื้อหา | ขนาด |
|---|---|---|
| `/config/rag` | `{ corpusVersion, enabled, topK, minScore }` | เล็ก |
| | ค่าเริ่มต้น: `topK: 6` · `minScore` = **ยังไม่กำหนด** ต้องหาจากการกระจายคะแนนที่ `eval-retrieval.js` วัดได้ (Testing ข้อ 3) แล้วบันทึกค่าที่เลือกไว้ใน spec นี้ก่อน freeze | |
| `/guidelineIndex/{groupId}_{shard}` | `{ corpusVersion, entries: [{ chunkId, docId, page, heading, summaryTh, keywords, emb }] }` | ~1.3 KB/chunk |
| `/guidelineChunks/{chunkId}` | `{ docId, page, heading, text, summaryTh, corpusVersion }` | เนื้อหาเต็ม |

- `emb` = embedding quantize เป็น int8 แล้ว base64 (768 มิติ → 768 ไบต์ → base64 1,024 ตัวอักษร)
- แยก index ออกจากเนื้อหาเต็ม เพราะ client โหลด index ครั้งเดียว แต่ดึงเนื้อหาเฉพาะ top-k
- shard ไม่เกิน 600 entries/doc (กันชน Firestore 1 MB) — คลังปัจจุบันคาดว่า ~250 chunk/กลุ่ม จึงเหลือ shard เดียว

## Offline pipeline (`setup/`)

```
setup/guidelines/manifest.json + *.pdf
   │
   ├─ 1. ถอดข้อความรายหน้า (ตาม extract: pypdf+thai-repair | gemini) → cache ที่ .extracted/
   ├─ 2. chunk ~800-1,200 ตัวอักษร overlap ~150 — ตัดตามย่อหน้า/หัวข้อ ไม่ตัดกลางตาราง
   │     แนบ { docId, page, heading }
   ├─ 3. Gemini สรุปไทย 1 ประโยค + keywords ไทย 3-6 คำ ต่อ chunk
   ├─ 4. embed (summaryTh + keywords + text[:500]) ด้วย gemini-embedding-2, 768 มิติ
   ├─ 5. quantize int8 → base64
   └─ 6. เขียน /guidelineIndex/* + /guidelineChunks/* + /config/rag.corpusVersion
```

**ขั้นที่ 3 คือหัวใจของการรองรับไทย+อังกฤษปน** — ไม่ embed ข้อความอังกฤษดิบ แต่ embed สรุปภาษาไทย
→ query ไทยจาก transcript ดึง chunk อังกฤษเจอ และหน้า summary แสดงสรุปไทยได้เลยโดยไม่ต้องคัดลอกต้นฉบับ

Idempotent: hash `(docId, page, chunkIndex, text)` → chunk ที่ไม่เปลี่ยนข้าม ไม่ embed ซ้ำ

### สคริปต์

| ไฟล์ | หน้าที่ | ระยะ |
|---|---|---|
| `setup/lib/thai-repair.js` | ซ่อมข้อความไทย (pure, unit-testable) | 1 |
| `setup/lib/pdf-extract.js` | PDF → ข้อความรายหน้า (pypdf \| gemini) + cache | 1 |
| `setup/lib/chunk.js` | ข้อความ → chunks[] | 1 |
| `setup/lib/embed.js` | batch embed + quantize | 1 |
| `setup/index-guidelines.js` | pipeline หลัก | 1 |
| `setup/brief-case.js` | ป้อนหัวข้อโรค → สรุปไทยว่าไกด์ไลน์ว่าอย่างไร (first-line, ขนาดยา, red flag, counseling) + เลขหน้า → **วัตถุดิบเขียน `drugAnswer` + `rubric`** | 2 |
| `setup/eval-retrieval.js` | วัดคุณภาพการค้นคืน (recall@k) | 3 |
| `setup/audit-case-guidelines.js` | ตรวจความสอดคล้องเฉลย ⟷ ไกด์ไลน์ | 4 |

## Runtime (`js/`)

### `js/rag-core.js` — คณิตล้วน ไม่มี I/O

`cosine()` · `dequantize()` · `mergeTopK()` · `capPerDoc()` (ไม่เกิน 2 chunk ต่อเอกสาร)

ปิดท้ายด้วย `if (typeof module !== 'undefined') module.exports = {...}`
→ เบราว์เซอร์มองข้าม (global scope ตามเดิม), Node `require()` ได้ — **ใช้โค้ดค้นคืนตัวเดียวกันทั้ง offline และ runtime โดยไม่ต้องมี build step**
สำคัญเพราะ `audit-case-guidelines.js` ต้องให้ผลตรงกับที่นักศึกษาเจอจริง

### `js/rag.js` — I/O

```
RAG.loadIndex(groupId)     → Firestore + cache ใน sessionStorage (โหลดครั้งเดียวต่อ session)
RAG.buildQueries(caseData, dispensedDrugs, rubric)
                           → 3 query ไทย: ① วินิจฉัย+การรักษา ② counseling ③ red flag/refer
RAG.embedQueries(queries)  → Gemini embedding, 1 network call
RAG.retrieve(...)          → orchestrate + timeout 4 วินาที → { chunks[], status, trace }
RAG.fetchChunks(ids)       → เนื้อหาเต็มของ top-k เท่านั้น
```

### ลำดับ `<script>` ใน `index.html`

```
firebase-config → gemini → gemini-live → gemini-tts → auth → db
→ rag-core.js → rag.js        (rag.js ใช้ db + gemini)
→ prompts.js → drug-data.js → screens/* → router.js
```

### `js/prompts.js`

เพิ่ม `buildGuidelineBlock(chunks)` และให้ `buildEvalPrompt()` รับ argument เพิ่ม

```
<Guideline_Evidence>
[G1] แหล่ง: โรคติดต่อทางเพศสัมพันธ์ (CCPE, ผศ.ดร.เด่นพงศ์ พัฒนเศรษฐานนท์) หน้า 10
สรุป: ...
เนื้อหา: ...
</Guideline_Evidence>
```

กติกาที่เพิ่มใน prompt:
- อ้างได้เฉพาะข้อความใน `<Guideline_Evidence>` **ห้ามแต่งเพิ่ม**
- อ้างแล้วต้องติด tag `[G1]` ในข้อความ feedback → ตรวจย้อนได้
- **ถ้าหลักฐานขัดกับ `drugAnswer` ของเคส → ยึด `drugAnswer` และไม่อ้าง chunk นั้น** (ตาข่ายกันเศษที่หลุด audit ไม่ใช่กลไกหลัก — ดู "Conflict audit")
- ถ้า block ว่าง → ทำงานแบบเดิมทุกประการ

เพิ่มใน output JSON: `"citations": [{ "tag": "G1", "usedIn": "drug_feedback" }]`

### `js/screens/chat.js`

Step 4: เรียก `await RAG.retrieve(...)` ก่อนเรียก eval — เมธอดเดียว ไม่ยัด logic ลงไฟล์ที่ 1,067 บรรทัดอยู่แล้ว

### `js/screens/summary.js`

section "อ้างอิงเวชปฏิบัติ" — แสดงเฉพาะ chunk ที่ถูกอ้างจริง: สรุปไทย + ชื่อเอกสาร + หน้า + ลิงก์
**ไม่แสดงข้อความต้นฉบับ** (ลิขสิทธิ์)

### `js/db.js` — บันทึกลง `/results`

```js
ragVersion:   'corpus-2026-08-08',
ragStatus:    'ok' | 'disabled' | 'no_index' | 'embed_failed' | 'low_relevance' | 'partial',
ragQueries:   ['...', '...', '...'],
ragRetrieved: [{ chunkId, docId, page, score }],
ragCitations: ['G1', 'G3']
```

## Conflict audit (`setup/audit-case-guidelines.js`) — ด่านก่อน freeze

เพราะเคสยังพัฒนาอยู่ ลำดับที่ถูกคือ **เขียนเคสโดยอ่านจากไกด์ไลน์ตั้งแต่แรก** (ผ่าน `brief-case.js`)
audit จึงเป็นการ**ยืนยัน** ไม่ใช่ไล่จับปัญหา

```
วนทุกเคส:
  ใช้ RAG.buildQueries() ตัวเดียวกับ runtime → ดึง top-k
  Gemini เทียบ: เฉลย (drugAnswer + rubric) ⟷ หลักฐานไกด์ไลน์
     ▼
  รายงาน Markdown ต่อเคส:
    ✅ สอดคล้อง   ⚠️ ขัดแย้ง   ➕ ช่องว่าง (ไกด์ไลน์มีแต่เฉลยยังไม่ครอบคลุม)
     ▼
  ผู้ใช้ + อาจารย์ตัดสิน: (ก) แก้เฉลย/รูบริก (ข) ตัดเอกสารผิดบริบทออกจาก manifest (ค) บันทึกว่าจงใจต่าง + เหตุผล
     ▼
  รันซ้ำจนไม่เหลือ ⚠️ ที่ยังไม่ตัดสิน → จึง freeze + launch
```

หมวด ➕ ช่องว่าง เป็นผลพลอยได้ที่มีค่าที่สุด — ชี้ counseling point / red flag ที่เฉลยยังไม่มี
รายงานชุดนี้ใช้เป็นหลักฐานในเล่มได้ ("การตรวจสอบความสอดคล้องระหว่างเฉลยรายเคสกับแนวทางเวชปฏิบัติ", ระยะที่ 1)

## Error handling — RAG ต้องล้มแบบเงียบเสมอ

| เหตุ | พฤติกรรม | `ragStatus` |
|---|---|---|
| `/config/rag.enabled = false` | ข้าม | `disabled` |
| ไม่มี index ของกลุ่มนั้น | ข้าม | `no_index` |
| embedding API error / เกิน 4 วินาที | ข้าม | `embed_failed` |
| คะแนน similarity สูงสุด < `minScore` | **ข้าม** | `low_relevance` |
| ดึง chunk ได้ไม่ครบ | ใช้เท่าที่ได้ | `partial` |

ทุกกรณี Step 4 เดินต่อได้ปกติ คะแนนออกครบ — feature flag ปิดได้ทันทีถ้าวันเก็บข้อมูลจริงมีปัญหา โดยข้อมูลวิจัยไม่หาย

`low_relevance` เป็นข้อที่สำคัญที่สุด: **ไม่เจอของตรง ให้ไม่ส่งอะไรเลย ดีกว่าส่งของใกล้เคียง**
chunk ที่เกี่ยวครึ่งๆ กลางๆ คือต้นตอของ feedback ที่ฟังดูน่าเชื่อแต่ผิด

## Testing

| # | ทดสอบ | เกณฑ์ผ่าน |
|---|---|---|
| 1 | Unit (Node): `thai-repair`, `cosine`, quantize↔dequantize, `capPerDoc` | roundtrip คลาดเคลื่อน < 1% |
| 2 | Chunking dry-run: พิมพ์ 20 chunk แรกต่อเอกสาร | ตาดู — ไม่ตัดกลางตาราง ไม่มีขยะ header/footer |
| 3 | **`eval-retrieval.js`** — query ไทย ~30 ข้อ ระบุเอกสาร/หน้าที่ควรเจอ | **recall@6 ≥ 0.8** ถ้าไม่ถึงต้องปรับ chunk size หรือเพิ่ม keyword search ผสม |
| 4 | สุ่มตรวจผลถอด `extract: "gemini"` 20 หน้าเทียบต้นฉบับ | ไม่มีการเพี้ยนของขนาดยา/ตัวเลข |
| 5 | Integration: audit ครบทุกเคส | ไม่ crash รายงานอ่านรู้เรื่อง |
| 6 | Smoke ด้วยมือ 10-20 session จริง | feedback + citation ตรงเรื่อง |
| 7 | Playwright | summary แสดง section อ้างอิงเมื่อมี citation, ไม่แสดงเมื่อไม่มี |

ข้อ 3 กับ 4 เป็นด่านที่ห้ามข้าม — ข้อ 3 กันการดึงบทผิด ข้อ 4 กัน Gemini ถอดตัวเลขขนาดยาเพี้ยน

## ลำดับการทำงาน

| ระยะ | งาน | พึ่งเคสจริงไหม |
|---|---|---|
| 1 | manifest + thai-repair + indexer → คลังใน Firestore | ❌ ทำได้เลย |
| 2 | `brief-case.js` → ใช้เป็นวัตถุดิบเขียน 9 เคส | ❌ ช่วยเขียนเคส |
| 3 | runtime retrieval + prompt/summary/results + `eval-retrieval.js` | ❌ พึ่งแค่ schema เดิม |
| 4 | conflict audit → freeze `corpusVersion` → launch | ✅ ต้องมีเคสครบ |

ระยะ 1-3 เดินคู่ขนานกับการเขียนเคสได้

## งานที่ต้องทำแยก (พบระหว่างออกแบบ แต่ไม่ใช่ขอบเขต spec นี้)

1. **`CLAUDE.md` ล้าสมัย** — ระบุว่าวัดทักษะการซักประวัติด้วย AI eval score ซึ่งขัดกับข้อเท็จจริงว่าตัวแปรตามคือคะแนนผู้เชี่ยวชาญจากวิดีโอ · ยังระบุ 5 เคส/15 กลุ่มโรค (ของจริง 3 กลุ่ม 9+2 เคส) · แนะนำ `gemini-2.0-flash` ที่ถูกประกาศเลิกใช้แล้ว
2. **เคส N3 Stroke ขัดกับรูบริก** — คำตอบที่ถูกคือไม่จ่ายยาแล้วส่ง ER แต่ `prompts.js:72` มีข้อ `r1` "เลือกยา first-line ถูกต้อง" น้ำหนัก 7 CRITICAL ต้องมีกลไก N/A หรือกลับด้าน — ต้องแก้ไม่ว่าจะทำ RAG หรือไม่
3. **เคส G2 Gonorrhea ต้องเคาะกับอาจารย์** — สูตรมาตรฐานคือ ceftriaxone ฉีด ซึ่งร้านยาทำไม่ได้ เคสนี้ควรเป็น "ส่งต่อ + counseling คู่นอน" หรือเคสจ่ายยา? กำหนดว่าต้องหาไกด์ไลน์แบบไหน
4. **เนื้อหา FAST/BEFAST + golden period 4.5 ชม. + สายด่วน 1669 ต้องเขียนลงเฉลยเคส N3 Stroke โดยตรง** — ไม่มีในคลัง และตัดสินใจแล้วว่าไม่ไล่หาต่อ (ดูหัวข้อ N3 Stroke)
