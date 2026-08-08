// ============================================================
//  chunk.js
//  ข้อความรายหน้า -> chunks พร้อม metadata สำหรับทำ citation (pure — ไม่มี I/O)
//
//  chunk ไม่คร่อมหน้า เพราะเราแสดงเลขหน้าเป็น citation ต่อนักศึกษา
//  ถ้า chunk คร่อม 2 หน้าจะอ้างหน้าไม่ตรง
//  แต่ prepend ท้ายหน้าก่อนเป็น overlap กันประโยคแรกของหน้าลอย
// ============================================================

const { repairThai } = require('./thai-repair');

const CHUNK_OPTS = { target: 1000, min: 300, max: 1400, overlap: 150 };

// header/footer: บรรทัดที่ซ้ำเกินสัดส่วนนี้ของหน้าทั้งหมด (และอย่างน้อย MIN_REPEAT หน้า)
const BOILERPLATE_RATIO = 0.6;
const MIN_REPEAT = 3;

// หัวข้อ: ขึ้นต้นด้วยเลขข้อ (3.5, 1., 2.3.1) หรือคำนำหัวข้อไทยที่พบในไกด์ไลน์
const HEADING_RE = /^(?:\d+(?:\.\d+)*\.?\s+\S.{0,90}|(?:บทที่|ตอนที่|หัวข้อ|ภาคผนวก)\s*\S.{0,90})$/;

function detectHeading(block, fallback) {
  const first = block.split('\n')[0].trim();
  return HEADING_RE.test(first) ? first : fallback;
}

// หาบรรทัดที่ปรากฏซ้ำเกือบทุกหน้า = header/footer ของเอกสาร ไม่ใช่เนื้อหา
function findBoilerplate(pageTexts) {
  if (pageTexts.length < MIN_REPEAT) return new Set();
  const count = new Map();
  for (const t of pageTexts) {
    const lines = new Set(
      t.split('\n').map(l => l.trim()).filter(l => l.length >= 8 && l.length <= 120)
    );
    for (const l of lines) count.set(l, (count.get(l) || 0) + 1);
  }
  const threshold = Math.max(MIN_REPEAT, Math.ceil(pageTexts.length * BOILERPLATE_RATIO));
  const out = new Set();
  for (const [line, n] of count) if (n >= threshold) out.add(line);
  return out;
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
  if (!Array.isArray(pages) || !pages.length) return [];

  // ซ่อมข้อความก่อน แล้วค่อยหา boilerplate — ไม่งั้นบรรทัดเดียวกันที่เพี้ยนต่างกันจะนับไม่ตรง
  const cleaned = pages.map(p => ({
    page: p.page,
    text: repairThai(p.text).replace(/\r/g, '').trim(),
  }));

  const boilerplate = findBoilerplate(cleaned.map(p => p.text));

  const chunks = [];
  let tailPrev = '';   // ท้ายหน้าก่อน ใช้เป็น overlap
  let heading = '';    // หัวข้อล่าสุดที่เจอ — สืบทอดข้ามหน้า

  for (const { page, text } of cleaned) {
    if (!text) continue;

    const body = text
      .split('\n')
      .filter(l => !boilerplate.has(l.trim()))
      .join('\n')
      .trim();
    if (!body) continue;

    const blocks = body.split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
    if (!blocks.length) continue;

    heading = detectHeading(body, heading);

    const packed = packBlocks(blocks);
    packed.forEach((piece, i) => {
      const withOverlap = (i === 0 && tailPrev) ? `${tailPrev}\n\n${piece}` : piece;
      const finalText = withOverlap.slice(0, o.max).trim();
      if (finalText.length < o.min) return;
      chunks.push({
        chunkId: `${docId}_p${String(page).padStart(3, '0')}_${i}`,
        docId,
        page,
        heading,
        text: finalText,
      });
    });

    tailPrev = body.slice(-o.overlap);
  }

  return chunks;
}

module.exports = { chunkPages, CHUNK_OPTS };
