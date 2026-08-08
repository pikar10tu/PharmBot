// ============================================================
//  rag.js — สืบค้นแนวทางเวชปฏิบัติมาประกอบการประเมิน (Step 4)
//
//  ⚠️ ต้องล้มแบบเงียบเสมอ — RAG.retrieve() ห้าม throw
//     ถ้าล้ม การประเมินต้องเดินต่อจนได้คะแนนตามปกติ
//     คะแนนคำนวณจาก rubric ล้วน RAG ไม่มีผลต่อคะแนนใดๆ
//
//  ⚠️ classic script (global scope) — ห้ามใช้ require / import
//     ต้องโหลดหลัง rag-core.js, db.js, gemini.js
// ============================================================

const RAG = {
  TIMEOUT_MS: 4000,
  MAX_PER_DOC: 2,
  EMBED_DIMS: 768,

  _cfg: null,
  _indexCache: {},   // groupId -> entries[]  (ใน memory ต่อการโหลดหน้า)
  _docMeta: {},      // docId -> { title, url }  เติมจาก manifest ถ้ามีในอนาคต

  // ── สร้าง query 3 เส้นจากเคส + ยาที่นักศึกษาจ่ายจริง ──
  //
  // เส้น counseling ใส่ "ยาที่นักศึกษาจ่ายจริง" ไม่ใช่เฉลย — เพื่อให้ดึงหลักฐาน
  // ของยาที่หลุด drugAnswer ได้ ซึ่งเป็นเหตุผลหนึ่งที่ทำ RAG ตั้งแต่แรก
  buildQueries(caseData, dispensedDrugs) {
    const c  = caseData || {};
    const cc = String(c.chiefComplaint || '').trim();
    const dx = String(c.diagnosisAnswer || '').trim();
    const drugs = (dispensedDrugs || [])
      .map(d => [d && d.name, d && d.strength].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ');
    const counselPoints = ((c.drugAnswer && c.drugAnswer.counseling) || []).join(' ');
    const topic = dx || cc || 'อาการที่พบบ่อยในร้านขายยาชุมชน';

    return [
      `การวินิจฉัยและแนวทางการรักษา ${topic}`.trim(),
      `คำแนะนำการใช้ยาและการปฏิบัติตัว ${drugs} ${counselPoints}`.trim() ||
        `คำแนะนำการใช้ยาและการปฏิบัติตัวสำหรับ ${topic}`,
      `อาการเตือนที่ต้องส่งต่อพบแพทย์ ${topic}`.trim(),
    ];
  },

  // ── แปลง chunk เป็นรายการอ้างอิงพร้อม tag G1..Gn ──
  formatCitations(chunks) {
    return (chunks || []).map((c, i) => ({
      tag: `G${i + 1}`,
      docId: c.docId,
      page: c.page,
      title: c.title || c.docId,
      url: c.url || null,
      summaryTh: c.summaryTh || '',
    }));
  },
};

// ── Config ───────────────────────────────────────────────────
RAG._loadConfig = async function () {
  if (RAG._cfg) return RAG._cfg;
  const snap = await db.collection('config').doc('rag').get();
  RAG._cfg = snap.exists ? snap.data() : { enabled: false };
  return RAG._cfg;
};

// ── ดัชนี ────────────────────────────────────────────────────
// ก้อนใหญ่ (RESP ~750 KB) — cache ใน sessionStorage ไม่ให้โหลดซ้ำทั้ง session
RAG._loadIndex = async function (groupId, corpusVersion) {
  if (RAG._indexCache[groupId]) return RAG._indexCache[groupId];

  const key = `rag-idx-${groupId}-${corpusVersion}`;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      RAG._indexCache[groupId] = JSON.parse(cached);
      return RAG._indexCache[groupId];
    }
  } catch (_) { /* sessionStorage ปิดอยู่หรือ JSON เสีย — โหลดใหม่ */ }

  const snap = await db.collection('guidelineIndex').where('groupId', '==', groupId).get();
  const entries = [];
  snap.forEach(d => entries.push(...(d.data().entries || [])));

  RAG._indexCache[groupId] = entries;
  try { sessionStorage.setItem(key, JSON.stringify(entries)); } catch (_) { /* เกินโควตา ไม่เป็นไร */ }
  return entries;
};

// ── Embedding ────────────────────────────────────────────────
RAG._embedQueries = async function (queries, model) {
  const key = getGeminiKey();
  if (!key) throw new Error('ไม่มี API key');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: queries.map(q => ({
        model: `models/${model}`,
        content: { parts: [{ text: q }] },
        outputDimensionality: RAG.EMBED_DIMS,
        // ⚠️ ต้องเป็น RETRIEVAL_QUERY — ตอน index ใช้ RETRIEVAL_DOCUMENT
        taskType: 'RETRIEVAL_QUERY',
      })),
    }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const data = await res.json();
  return (data.embeddings || []).map(e => e.values || e.value);
};

// ── ทางเข้าเดียวของ RAG ─────────────────────────────────────
RAG.retrieve = async function (caseData, dispensedDrugs, groupId) {
  const t0 = Date.now();
  const queries = RAG.buildQueries(caseData, dispensedDrugs);
  const fail = (status, corpusVersion) => ({
    chunks: [], status, queries, retrieved: [],
    corpusVersion: corpusVersion || null, ms: Date.now() - t0,
  });

  try {
    const cfg = await RAG._loadConfig();
    if (!cfg.enabled) return fail('disabled', cfg.corpusVersion);

    const minScore = typeof cfg.minScore === 'number' ? cfg.minScore : 0;
    const topK = cfg.topK || 6;

    const work = (async () => {
      const entries = await RAG._loadIndex(groupId, cfg.corpusVersion);
      if (!entries.length) return fail('no_index', cfg.corpusVersion);

      const embs = await RAG._embedQueries(queries, cfg.embedModel || 'gemini-embedding-2');
      if (embs.length !== queries.length) return fail('embed_failed', cfg.corpusVersion);

      // จัดอันดับด้วยแกนเดียวกับที่ offline audit ใช้ — ผลจึงเทียบกันได้
      const lists = embs.map(qv =>
        entries.map(e => ({
          chunkId: e.chunkId, docId: e.docId, page: e.page,
          heading: e.heading, summaryTh: e.summaryTh,
          score: RAGCore.cosine(qv, RAGCore.dequantize(e.emb)),
        }))
      );

      const merged = RAGCore.mergeTopK(lists, topK * 3);
      // ไม่เจอของตรง -> ไม่ส่งอะไรเลย ดีกว่าส่งของใกล้เคียง
      // (หลักฐานที่เกี่ยวครึ่งๆ กลางๆ คือต้นตอของ feedback ที่ฟังดูน่าเชื่อแต่ผิด)
      if (!merged.length || merged[0].score < minScore) return fail('low_relevance', cfg.corpusVersion);

      const picked = RAGCore.capPerDoc(merged, RAG.MAX_PER_DOC)
        .filter(h => h.score >= minScore)
        .slice(0, topK);

      // ดึงเนื้อหาเต็มเฉพาะที่เลือก
      const docs = await Promise.all(
        picked.map(h => db.collection('guidelineChunks').doc(h.chunkId).get().catch(() => null))
      );

      const chunks = [];
      docs.forEach((d, i) => {
        if (!d || !d.exists) return;
        const data = d.data() || {};
        const meta = RAG._docMeta[picked[i].docId] || {};
        chunks.push({
          chunkId: picked[i].chunkId,
          docId: picked[i].docId,
          page: picked[i].page,
          heading: picked[i].heading || data.heading || '',
          score: picked[i].score,
          text: data.text || '',
          summaryTh: data.summaryTh || picked[i].summaryTh || '',
          title: meta.title || picked[i].docId,
          url: meta.url || null,
        });
      });

      return {
        chunks,
        status: chunks.length === picked.length ? 'ok' : 'partial',
        queries,
        retrieved: picked.map(h => ({
          chunkId: h.chunkId, docId: h.docId, page: h.page,
          score: Math.round(h.score * 10000) / 10000,
        })),
        corpusVersion: cfg.corpusVersion || null,
        ms: Date.now() - t0,
      };
    })();

    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timeout')), RAG.TIMEOUT_MS));

    return await Promise.race([work, timeout]);
  } catch (e) {
    console.warn('RAG.retrieve ล้ม (การประเมินเดินต่อตามปกติ):', e && e.message);
    return fail('embed_failed', RAG._cfg && RAG._cfg.corpusVersion);
  }
};
