// ============================================================
//  sim-case.js — จำลองการฝึกทั้งเคสเพื่อเกลา prompt ก่อนให้คนทดสอบจริง
//
//  1 รอบ = นักศึกษาจำลอง (โมเดลข้อความ) ⇄ ผู้ป่วย (buildSystemPrompt ตัวจริง
//          บน gemini-3.8-live ตัวเดียวกับเว็บ) → จ่ายยา → ให้คำแนะนำ
//          → buildEvalPrompt + scoreRubric ตัวจริง → ผู้ตรวจ (LLM) ติดธงปัญหา
//
//  วิธีใช้:
//    1. ใส่ key ใน setup/.env.local (gitignored):  GEMINI_API_KEY=AIza...
//    2. node sim-case.js                          # ทุกเคส × ทุก persona × 1 รอบ
//       node sim-case.js --case case01 --persona thorough,leaky --runs 3
//       node sim-case.js --list                   # ดูเคส/persona ที่มี
//
//  ผลลัพธ์: setup/sim-runs/<เวลา>/  (gitignored)
//    <case>__<persona>__<n>.json   transcript + eval + ธงจากผู้ตรวจ ครบทุกอย่าง
//    report.md                     สรุปอ่านง่าย — เปิดไฟล์นี้ก่อน
//
//  ⚠️ ข้อจำกัด: นักศึกษาจำลองส่ง "ข้อความ" เข้า Live (ไม่ใช่เสียง) จึงไม่ทดสอบ ASR
//     การพูดแทรก หรือเสียงรบกวน — ส่วนนั้นยังต้องให้คนทดสอบด้วยไมค์จริง
// ============================================================

const fs   = require('node:fs');
const path = require('node:path');
const vm   = require('node:vm');

// ── config ───────────────────────────────────────────────────
function loadEnv() {
  const p = path.join(__dirname, '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const KEY           = process.env.GEMINI_API_KEY;
const LIVE_MODEL    = process.env.SIM_LIVE_MODEL    || 'gemini-3.8-live';   // ต้องตรงกับ js/gemini-live.js
const STUDENT_MODEL = process.env.SIM_STUDENT_MODEL || 'gemini-2.5-flash';
const EVAL_MODEL    = process.env.SIM_EVAL_MODEL    || 'gemini-2.5-flash';  // ต้องตรงกับ /config/gemini
const JUDGE_MODEL   = process.env.SIM_JUDGE_MODEL   || STUDENT_MODEL;
const MAX_HISTORY_TURNS    = 14;
const MAX_COUNSELING_TURNS = 10;

// ── โหลดโค้ดฝั่งเว็บตัวจริง (classic script → vm) ───────────────
function loadBrowserScript(file, names) {
  const sandbox = { console, Math, JSON, Map, Set, String, Array, Object, Number, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), sandbox);
  const out = {};
  for (const n of names) out[n] = vm.runInContext(n, sandbox);
  return out;
}
const P = loadBrowserScript('prompts.js', [
  'buildSystemPrompt', 'buildCounselingPrompt', 'buildEvalPrompt',
  'scoreRubric', 'randomizePatientData', 'buildRubricForCase', 'GROUNDING_VERSION', 'parseEvalJson',
]);
const { DRUG_SEED } = loadBrowserScript('drug-data.js', ['DRUG_SEED']);
const { CASES }     = require('./seed-cases.js');

// ── persona นักศึกษาจำลอง ───────────────────────────────────────
// แต่ละแบบมีไว้กระตุ้นจุดอ่อนคนละแบบของผู้ป่วย/ตัวประเมิน — เพิ่มได้ตามที่เจอปัญหาจริง
const PERSONAS = {
  thorough: {
    label: 'ซักครบตามหลัก',
    expect: 'คะแนนซักประวัติควรสูง',
    style: 'คุณเป็นนักศึกษาเภสัชปี 6 ที่เก่ง ซักประวัติครบเป็นระบบ: ยาสำหรับใคร/อายุ อาการ ลักษณะ ระยะเวลา อาการร่วม ยาที่ลองใช้ ประวัติเคยเป็น โรคประจำตัว ยาที่ใช้ประจำ แพ้ยา ตั้งครรภ์/ให้นม (ถ้าผู้หญิง) และ red flags ที่เกี่ยวกับอาการนี้ ถามทีละเรื่อง ก่อนจบให้สรุปอาการและบอกผู้ป่วยว่าน่าจะเป็นอะไร (ถ้าเป็นอาการอันตราย ให้แนะนำส่งต่อแพทย์ทันที)',
    drugs: 'firstLine',
    knowsAnswer: true,   // ตอนให้คำแนะนำรู้ regimen/counseling ที่ถูก — เพื่อวัดว่าผู้ป่วย/ตัวประเมินรับมือคำตอบที่ถูกได้ดีไหม
  },
  forgetful: {
    label: 'ลืมถามเรื่องความปลอดภัย',
    expect: 'ต้องโดนหักข้อแพ้ยา/โรคประจำตัว/ยาประจำ',
    style: 'คุณเป็นนักศึกษาที่รีบ ถามแค่อาการหลัก ระยะเวลา และอาการร่วมนิดหน่อย **ห้ามถามเรื่องแพ้ยา โรคประจำตัว หรือยาที่ใช้ประจำเด็ดขาด** แล้วรีบจบ',
    drugs: 'firstLine',
  },
  leaky: {
    label: 'ถามกว้างๆ ล่อให้ผู้ป่วยเล่าเอง',
    expect: 'ผู้ป่วยไม่ควรเทข้อมูลลับทั้งหมดออกมาเอง',
    style: 'คุณถามแบบปลายเปิดกว้างๆ เท่านั้น เช่น "เล่าให้ฟังหน่อยครับ" "มีอะไรอีกไหม" "ยังมีอะไรอยากบอกอีกไหม" ไม่ถามเจาะจง เพื่อดูว่าผู้ป่วยจะเล่าเองแค่ไหน',
    drugs: 'firstLine',
  },
  leading: {
    label: 'ถามนำ/ขอให้ผู้ป่วยวินิจฉัย',
    expect: 'ผู้ป่วยไม่ควรพูดศัพท์แพทย์หรือยืนยันโรคเอง',
    style: 'คุณชอบถามนำและถามให้ผู้ป่วยตัดสินแทน เช่น "เป็นคออักเสบจากแบคทีเรียใช่ไหม" "คิดว่าต้องกินยาฆ่าเชื้อไหม" "เคยได้ยาอะไรแล้วหายบ้าง" และถามศัพท์แพทย์',
    drugs: 'wrong',
  },
};

// ── Gemini helpers ───────────────────────────────────────────
async function generate(model, prompt, { temperature = 0.7, json = false } = {}, retry = 2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    if (retry > 0 && (res.status === 429 || res.status === 503)) {
      await new Promise(r => setTimeout(r, 5000));
      return generate(model, prompt, { temperature, json }, retry - 1);
    }
    const e = await res.json().catch(() => ({}));
    throw new Error(`${model} ${res.status}: ${e?.error?.message || ''}`);
  }
  const d = await res.json();
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}

function parseJson(raw) {
  return JSON.parse(raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim());
}

// ── Live session (ข้อความเข้า → เสียง+transcript ออก) ───────────
// setup ต้องตรงกับ js/gemini-live.js ยกเว้น realtimeInputConfig (ไม่มีเสียงเข้า)
class LiveSession {
  constructor(systemPrompt, voiceName) {
    this.systemPrompt = systemPrompt;
    this.voiceName = voiceName;
    this.buf = '';
    this.turnResolver = null;
    this.unsolicited = [];       // ข้อความที่ผู้ป่วยพูดโดยไม่มีใครถาม (proactive audio)
    this.waiting = false;
  }

  open() {
    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`;
      this.ws = new WebSocket(url);
      const t = setTimeout(() => reject(new Error('Live: setup timeout 20s')), 20000);
      this.ws.onopen = () => this.ws.send(JSON.stringify({ setup: {
        model: `models/${LIVE_MODEL}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          temperature: 0.6,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } } },
        },
        outputAudioTranscription: {},
        systemInstruction: { parts: [{ text: this.systemPrompt }] },
      } }));
      this.ws.onmessage = async (ev) => {
        const txt = typeof ev.data === 'string' ? ev.data : Buffer.from(await new Response(ev.data).arrayBuffer()).toString('utf8');
        let msg; try { msg = JSON.parse(txt); } catch { return; }
        if (msg.setupComplete !== undefined) { clearTimeout(t); resolve(); return; }
        if (msg.error) { clearTimeout(t); reject(new Error('Live: ' + JSON.stringify(msg.error))); return; }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.outputTranscription?.text) this.buf += sc.outputTranscription.text;
        if (sc.turnComplete) {
          const said = this.buf.trim(); this.buf = '';
          if (this.waiting && this.turnResolver) { this.waiting = false; this.turnResolver(said); }
          else if (said) this.unsolicited.push(said);
        }
      };
      this.ws.onerror = (e) => { clearTimeout(t); reject(new Error('Live WS error: ' + (e.message || 'unknown'))); };
      this.ws.onclose = (e) => {
        clearTimeout(t);
        if (this.turnResolver && this.waiting) this.turnResolver(`[[WS ปิด code ${e.code} ${e.reason || ''}]]`);
        reject(new Error(`Live closed ${e.code} ${e.reason || ''}`));
      };
    });
  }

  // รอดูว่าผู้ป่วยพูดขึ้นมาเองก่อนถูกถามไหม
  async idle(ms) { await new Promise(r => setTimeout(r, ms)); }

  ask(text, timeoutMs = 30000) {
    return new Promise((resolve) => {
      this.waiting = true;
      const t = setTimeout(() => { this.waiting = false; resolve('[[ไม่ตอบภายใน 30 วินาที]]'); }, timeoutMs);
      this.turnResolver = (s) => { clearTimeout(t); resolve(s); };
      this.ws.send(JSON.stringify({ realtimeInput: { text } }));
    });
  }

  close() { try { this.ws.onclose = null; this.ws.close(); } catch {} }
}

// ── นักศึกษาจำลอง ────────────────────────────────────────────
function transcriptText(hist, patientName = 'ผู้ป่วย') {
  return hist.map(m => `${m.role === 'user' ? 'เภสัชกร' : patientName}: ${m.text}`).join('\n');
}

async function studentTurn(persona, caseData, hist, phase, drugsText, dispensed = []) {
  const da = caseData.drugAnswer || {};
  const answerKey = persona.knowsAnswer
    ? `
ความรู้ของคุณ (ใช้อธิบายให้ถูกต้อง แต่พูดเป็นภาษาคนทั่วไป):
- วิธีใช้ยาที่จ่าย: ${dispensed.map(d => `${d.name} ${d.strength}: ${da.regimen?.[d.drugCode] || '-'}`).join(' · ') || 'ไม่ได้จ่ายยา'}
${da.referral ? `- การส่งต่อ: ${da.referral.note}
` : ''}- สิ่งที่ต้องแนะนำ: ${(da.counseling || []).join(' · ')}` : '';
  const task = phase === 'history'
    ? `คุณกำลังซักประวัติผู้ป่วยที่มาร้านยา
${persona.style}
คุณไม่รู้ข้อมูลอื่นของผู้ป่วยนอกจากที่ผู้ป่วยตอบในบทสนทนา
ถ้าถามพอแล้ว ให้ตอบคำเดียวว่า [จบ]`
    : `${dispensed.length ? `คุณจ่ายยานี้ให้ผู้ป่วยแล้ว: ${drugsText}
ตอนนี้ให้คำแนะนำการใช้ยาทีละเรื่อง (วิธีกิน ระยะเวลา ผลข้างเคียง ข้อควรระวัง เมื่อไรต้องไปหาหมอ) และตอบคำถามผู้ป่วย`
  : 'คุณไม่ได้จ่ายยา ตอนนี้อธิบายว่าผู้ป่วยต้องทำอะไรต่อ และตอบคำถาม'}${answerKey}
${persona.drugs === 'wrong' ? 'คุณให้คำแนะนำแบบผ่านๆ ไม่ครบ' : ''}
ถ้าแนะนำครบแล้ว ให้ตอบคำเดียวว่า [จบ]`;
  const prompt = `${task}

คุณเป็นเภสัชกรผู้ชาย ลงท้ายด้วย "ครับ" เสมอ (ห้ามเขียน "คะ/ครับ")
ถ้ายังไม่เริ่มคุย ให้ทักทายสั้นๆ ก่อน เช่น "สวัสดีครับ มีอะไรให้ช่วยไหมครับ"
พูดเป็นภาษาไทยแบบพูดจริงในร้านยา สั้นๆ 1-2 ประโยค ครั้งละหนึ่งคำถาม/หนึ่งเรื่อง
ตอบเฉพาะสิ่งที่จะพูดออกไป ไม่ต้องมีชื่อผู้พูดนำหน้า

บทสนทนาที่ผ่านมา:
${transcriptText(hist) || '(ยังไม่เริ่ม — ทักทายและเริ่มถามได้เลย)'}`;
  return (await generate(STUDENT_MODEL, prompt, { temperature: 0.8 })).replace(/^เภสัชกร\s*:\s*/, '');
}

// นักศึกษาจำลองชอบพูดเรื่องสุดท้ายแล้วปิดด้วย [จบ] ในข้อความเดียวกัน — ต้องเก็บคำพูดไว้ ไม่งั้นหายทั้งก้อน
function splitDone(raw) {
  const done = /\[จบ\]/.test(raw);
  return { done, text: raw.replace(/\[จบ\]/g, '').replace(/\s*\n+\s*/g, ' ').trim() };
}

function pickDrugs(persona, caseData) {
  const byCode = Object.fromEntries(DRUG_SEED.map(d => [d.drugCode, d]));
  const code = (c) => (typeof c === 'string' ? c : c?.drugCode || c?.code || c?.id);
  const da = caseData.drugAnswer || {};
  let codes;
  if (persona.drugs === 'wrong') {
    const right = new Set([...(da.firstLine || []), ...(da.alternatives || [])].map(code));
    codes = [(da.unacceptable || []).map(code)[0] || DRUG_SEED.find(d => d.isOtc && !right.has(d.drugCode))?.drugCode];
  } else {
    // ปกติ firstLine คือ "ตัวเลือก" ที่ถูกเท่ากัน (เลือกตัวแรก) · ยกเว้นเคสส่งต่อที่ firstLine เป็นสูตรผสม
    const fl = (da.firstLine || []).map(code);
    codes = da.referral ? fl : fl.slice(0, 1);
  }
  return codes.filter(Boolean).map(c => byCode[c]).filter(Boolean)
    .map(d => ({ drugCode: d.drugCode, name: d.name, strength: d.strength, form: d.form }));
}

// ── ผู้ตรวจ (LLM) — ติดธงปัญหาของผู้ป่วยรายเทิร์น ───────────────
async function judge(caseData, hist, counseling) {
  const prompt = `คุณเป็นเภสัชกรอาวุโสที่ตรวจคุณภาพ "ผู้ป่วยจำลอง (AI)" ในโปรแกรมฝึกนักศึกษาเภสัช
หน้าที่: ตรวจว่าผู้ป่วยจำลองเล่นบทสมจริงและไม่ทำให้แบบฝึกเสีย

ข้อมูลเคส (ผู้ป่วยควรเปิดเผยเฉพาะส่วนที่ถูกถามตรงๆ):
${caseData.secretInfo}

อาการนำที่บอกได้ทันที: ${caseData.chiefComplaint}
ตัวตนผู้ป่วย: ${caseData.name} อายุ ${caseData.age} ปี อาชีพ ${caseData.occupation}

หมายเหตุการออกแบบ (ไม่ใช่ปัญหา): เมื่อถูกถามกว้างๆ ผู้ป่วยตั้งใจตอบแค่อาการหลักและไม่เล่ารายละเอียดเพิ่ม
เพื่อฝึกให้นักศึกษาถามเจาะจง — อย่าติดธง unnatural เพราะผู้ป่วยไม่ยอมเล่าเพิ่ม แต่ติดธงได้ถ้าพูดซ้ำแบบหุ่นยนต์

บทสนทนาซักประวัติ:
${transcriptText(hist)}

บทสนทนาให้คำแนะนำ:
${transcriptText(counseling)}

ตรวจทุกเทิร์นของผู้ป่วย แล้วตอบเป็น JSON:
{
  "issues": [{"turn": "ข้อความของผู้ป่วยที่มีปัญหา (ยกมาสั้นๆ)",
              "type": "leak|wrongInfo|offRole|tooLong|unnatural|medicalJargon|other",
              "why": "อธิบายสั้นๆ"}],
  "realism": 1-5,
  "summary": "สรุป 1-2 ประโยคว่าผู้ป่วยเล่นบทดีแค่ไหน"
}
นิยาม: leak = บอกข้อมูลที่ยังไม่ถูกถาม · wrongInfo = ขัดกับข้อมูลเคสหรือแต่งเพิ่มที่สำคัญ ·
offRole = พูดเหมือนหมอ/AI/ผู้ช่วย · tooLong = ยาวเกินคนไข้จริง · unnatural = ภาษาไทยไม่เหมือนคนพูด ·
medicalJargon = ใช้ศัพท์แพทย์ที่คนไข้ทั่วไปไม่ใช้
ถ้าไม่มีปัญหาให้ issues เป็น [] — อย่าหาเรื่อง`;
  try { return parseJson(await generate(JUDGE_MODEL, prompt, { temperature: 0, json: true })); }
  catch (e) { return { issues: [], realism: null, summary: 'judge ล้มเหลว: ' + e.message }; }
}

// ── 1 รอบจำลอง ───────────────────────────────────────────────
async function runOnce(rawCase, personaId) {
  const persona  = PERSONAS[personaId];
  const caseData = P.randomizePatientData(JSON.parse(JSON.stringify(rawCase)));
  const voice    = caseData.gender === 'male' ? 'Puck' : 'Aoede';
  const log      = { proactive: [], errors: [] };
  const hist = [], counseling = [];

  // ขั้น 1 ซักประวัติ
  const live = new LiveSession(P.buildSystemPrompt(caseData, true), voice);
  try {
    await live.open();
    await live.idle(4000);   // proactive audio เปิดถาวรใน 3.8 — ดูว่าผู้ป่วยพูดเองตั้งแต่ยังไม่มีใครทักไหม
    for (let i = 0; i < MAX_HISTORY_TURNS; i++) {
      const { text: q, done } = splitDone(await studentTurn(persona, caseData, hist, 'history'));
      if (q) {
        hist.push({ role: 'user', text: q, via: 'sim' });
        hist.push({ role: 'model', text: await live.ask(q) });
      }
      if (done || !q) break;
    }
    log.proactive.push(...live.unsolicited.map(t => ({ phase: 'history', text: t })));
  } catch (e) { log.errors.push('history: ' + e.message); }
  live.close();

  // ขั้น 2 จ่ายยา
  const dispensed = pickDrugs(persona, caseData);
  const drugsText = dispensed.map(d => `${d.name} ${d.strength}`).join(', ') || '(ไม่ได้จ่าย)';

  // ขั้น 3 ให้คำแนะนำ
  const live2 = new LiveSession(P.buildCounselingPrompt(caseData, dispensed, true), voice);
  try {
    await live2.open();
    await live2.idle(4000);
    for (let i = 0; i < MAX_COUNSELING_TURNS; i++) {
      const { text: q, done } = splitDone(await studentTurn(persona, caseData, counseling, 'counseling', drugsText, dispensed));
      if (q) {
        counseling.push({ role: 'user', text: q, via: 'sim' });
        counseling.push({ role: 'model', text: await live2.ask(q) });
      }
      if (done || !q) break;
    }
    log.proactive.push(...live2.unsolicited.map(t => ({ phase: 'counseling', text: t })));
  } catch (e) { log.errors.push('counseling: ' + e.message); }
  live2.close();

  // ขั้น 4 ประเมิน — ใช้ pipeline ตัวจริง
  let evalJson = null, scored = null;
  try {
    evalJson = P.parseEvalJson(await generate(EVAL_MODEL, P.buildEvalPrompt(caseData, hist, dispensed, counseling), { temperature: 0 }));
    scored = P.scoreRubric(caseData, evalJson.items, caseData.gender);
  } catch (e) { log.errors.push('eval: ' + e.message); }

  const review = await judge(caseData, hist, counseling);

  const patientTurns = [...hist, ...counseling].filter(m => m.role === 'model');
  return {
    caseId: rawCase.id, persona: personaId, personaLabel: persona.label, expect: persona.expect,
    models: { live: LIVE_MODEL, student: STUDENT_MODEL, eval: EVAL_MODEL, judge: JUDGE_MODEL },
    groundingVersion: P.GROUNDING_VERSION,
    patient: { name: caseData.name, gender: caseData.gender, age: caseData.age },
    hist, dispensed, counseling, evalJson, scored, review, ...log,
    stats: {
      patientTurns: patientTurns.length,
      avgPatientChars: patientTurns.length ? Math.round(patientTurns.reduce((s, m) => s + m.text.length, 0) / patientTurns.length) : 0,
    },
  };
}

// ── รายงาน ───────────────────────────────────────────────────
function reportMd(runs) {
  const out = [`# รายงานจำลองเคส — ${new Date().toLocaleString('th-TH')}`, '',
    `โมเดล: live=${LIVE_MODEL} · นักศึกษา=${STUDENT_MODEL} · ประเมิน=${EVAL_MODEL} · ผู้ตรวจ=${JUDGE_MODEL}`, '',
    '| เคส | persona | คะแนนรวม | ซักประวัติ | ยา | แนะนำ | สมจริง | ปัญหา | พูดเอง | error |',
    '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of runs) {
    const s = r.scored || {};
    out.push(`| ${r.caseId} | ${r.persona} | ${s.overall ?? '-'} | ${s.history_score ?? '-'} | ${s.drug_score ?? '-'} | ${s.counseling_score ?? '-'} | ${r.review?.realism ?? '-'} | ${r.review?.issues?.length ?? '-'} | ${r.proactive.length} | ${r.errors.length} |`);
  }
  for (const r of runs) {
    out.push('', `## ${r.caseId} · ${r.persona} (${r.personaLabel})`, `คาดหวัง: ${r.expect}`, '');
    if (r.errors.length) out.push('**❌ error:** ' + r.errors.join(' / '), '');
    if (r.proactive.length) out.push('**🗣️ ผู้ป่วยพูดเองโดยไม่มีใครถาม:**', ...r.proactive.map(p => `- (${p.phase}) ${p.text}`), '');
    out.push(`ผู้ตรวจ: ${r.review?.summary || '-'}`);
    for (const i of r.review?.issues || []) out.push(`- **${i.type}** — "${i.turn}" → ${i.why}`);
    const missed = (r.scored?.checklist_results || []).filter(x => !x.done);
    if (missed.length) out.push('', 'ข้อที่ไม่ได้เต็ม:', ...missed.map(x => `- ${x.id} ${x.label}: ${x.partial ? '0.5' : '0'} — ${x.note || ''}`));
    out.push('', '<details><summary>บทสนทนา</summary>', '', '```',
      transcriptText(r.hist, r.patient.name), '--- จ่ายยา: ' + r.dispensed.map(d => d.name + ' ' + d.strength).join(', '),
      transcriptText(r.counseling, r.patient.name), '```', '</details>');
  }
  return out.join('\n');
}

// ── main ─────────────────────────────────────────────────────
function arg(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : null; }

async function main() {
  if (process.argv.includes('--list')) {
    console.log('เคส:', CASES.map(c => c.id).join(', '));
    console.log('persona:', Object.entries(PERSONAS).map(([k, v]) => `${k} (${v.label})`).join(', '));
    return;
  }
  if (!KEY) { console.error('❌ ไม่พบ GEMINI_API_KEY — ใส่ใน setup/.env.local'); process.exit(1); }

  const caseFilter = arg('case');
  const cases    = CASES.filter(c => !caseFilter || caseFilter.split(',').some(f => c.id.includes(f)));
  const personas = (arg('persona') || Object.keys(PERSONAS).join(',')).split(',');
  const runsEach = Number(arg('runs') || 1);
  for (const p of personas) if (!PERSONAS[p]) { console.error('❌ ไม่รู้จัก persona: ' + p); process.exit(1); }

  const dir = path.join(__dirname, 'sim-runs', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
  fs.mkdirSync(dir, { recursive: true });
  const runs = [];
  for (const c of cases) for (const p of personas) for (let n = 1; n <= runsEach; n++) {
    process.stdout.write(`▶ ${c.id} · ${p} · ${n}/${runsEach} … `);
    const r = await runOnce(c, p);
    runs.push(r);
    fs.writeFileSync(path.join(dir, `${c.id}__${p}__${n}.json`), JSON.stringify(r, null, 2));
    console.log(`คะแนน ${r.scored?.overall ?? '-'} · ปัญหา ${r.review?.issues?.length ?? '-'} · พูดเอง ${r.proactive.length}${r.errors.length ? ' · ❌ ' + r.errors.join(' / ') : ''}`);
  }
  fs.writeFileSync(path.join(dir, 'report.md'), reportMd(runs));
  console.log('\n📄 ' + path.join(dir, 'report.md'));
}

if (require.main === module) main().catch(e => { console.error('❌', e); process.exit(1); });
module.exports = { PERSONAS, pickDrugs, studentTurn };
