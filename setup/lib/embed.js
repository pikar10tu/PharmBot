// ============================================================
//  embed.js
//  สรุปไทย + embed ต่อ chunk (เรียก Gemini)
//
//  เหตุที่ embed "สรุปภาษาไทย" ไม่ใช่ข้อความดิบ:
//  คลังมีทั้งไทยและอังกฤษ ถ้า embed ต้นฉบับ query ไทยจะดึง chunk
//  อังกฤษไม่เจอ — สรุปไทยทำให้ทุก chunk อยู่ในปริภูมิภาษาเดียวกัน
//  และได้ข้อความที่แสดงเป็น citation ต่อนักศึกษาได้เลย
//  โดยไม่ต้องคัดลอกต้นฉบับ (เบาเรื่องลิขสิทธิ์)
// ============================================================

const crypto = require('crypto');

// ตรวจแล้ว 2026-08-09: คีย์ของโปรเจกต์เรียกได้ทั้ง gemini-embedding-001 และ -2
// เลือก -2 เพราะเป็นรุ่นปัจจุบัน ความเสี่ยงถูกเลิกใช้ระหว่างช่วงเก็บข้อมูลต่ำกว่า
// ⚠️ ห้ามเปลี่ยนหลัง freeze corpusVersion — embedding คนละรุ่นเทียบกันไม่ได้
const EMBED_MODEL = 'gemini-embedding-2';
const GEN_MODEL   = 'gemini-2.5-flash';
const API  = 'https://generativelanguage.googleapis.com/v1beta/models';
const DIMS = 768;

function chunkHash(c) {
  return crypto.createHash('sha1')
    .update(`${c.docId}|${c.page}|${c.chunkId}|${c.text}`)
    .digest('hex');
}

function shardEntries(entries, size = 300) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size));
  return out;
}

function buildEmbedInput({ summaryTh, keywords, text } = {}) {
  const kw = (keywords || []).join(' ');
  return `${summaryTh || ''}\n${kw}\n${(text || '').slice(0, 500)}`.trim();
}

async function postJson(url, body, tries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const detail = (await res.text()).slice(0, 300);
      // 429/5xx = ชั่วคราว ลองใหม่ได้; 4xx อื่น = ผิดที่คำขอ หยุดเลย
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${res.status} ${detail}`);
      }
      lastErr = new Error(`${res.status} ${detail}`);
    } catch (e) {
      lastErr = e;
      if (!/^\d{3} /.test(e.message) && attempt === tries) throw e;
    }
    if (attempt < tries) await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  throw lastErr;
}

// batch หลาย chunk ต่อ request — ขอ JSON array กลับมา
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
- ถ้าเป็นเนื้อหาทั่วไปที่ไม่มีสาระทางคลินิก (คำนำ กิตติกรรมประกาศ สารบัญ รายชื่อคณะทำงาน รายการอ้างอิง) ให้ summaryTh เป็น "" และ keywords เป็น []

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
        summaryTh: String(m?.summaryTh || '').trim(),
        keywords: Array.isArray(m?.keywords) ? m.keywords.filter(Boolean).slice(0, 6) : [],
      });
    });

    process.stdout.write(`\r   สรุปไทย ${Math.min(i + batchSize, chunks.length)}/${chunks.length}   `);
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
    process.stdout.write(`\r   embed ${out.length}/${texts.length}   `);
  }
  process.stdout.write('\n');
  return out;
}

module.exports = {
  summarizeChunks, embedTexts, chunkHash, shardEntries, buildEmbedInput,
  EMBED_MODEL, GEN_MODEL, DIMS,
};
