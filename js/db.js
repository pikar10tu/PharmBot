// ============================================================
//  db.js — Firestore CRUD helpers
// ============================================================

// ── Disease Groups ────────────────────────────────────────────
async function getGroups() {
  const snap = await db.collection('diseaseGroups').orderBy('sortOrder').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Cases ─────────────────────────────────────────────────────
async function getCasesByGroup(groupId) {
  const snap = await db.collection('cases')
    .where('groupId', '==', groupId)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getCaseById(caseId) {
  const snap = await db.collection('cases').doc(caseId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getAllCases() {
  const snap = await db.collection('cases').where('isActive', '==', true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Drugs ─────────────────────────────────────────────────────
async function getDrugs() {
  const snap = await db.collection('drugs').where('isActive', '==', true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Sessions ──────────────────────────────────────────────────
async function createSession(userId, caseData) {
  const sessionData = {
    userId,
    caseId:           caseData.id,
    caseSnapshot:     caseData,
    patientGender:    caseData.gender,
    patientAge:       caseData.age,
    chatHistory:      [],
    dispensedDrugs:   [],
    counselingHistory:[],
    status:           'in_progress',
    startedAt:        firebase.firestore.FieldValue.serverTimestamp(),
    endedAt:          null,
    durationSec:      null,
  };
  const ref = await db.collection('sessions').add(sessionData);
  return { id: ref.id, ...sessionData };
}

async function updateSessionChat(sessionId, chatHistory) {
  await db.collection('sessions').doc(sessionId).update({ chatHistory });
}

async function updateSessionDrugs(sessionId, dispensedDrugs) {
  await db.collection('sessions').doc(sessionId).update({ dispensedDrugs });
}

async function updateSessionCounseling(sessionId, counselingHistory) {
  await db.collection('sessions').doc(sessionId).update({ counselingHistory });
}

async function completeSession(sessionId, startedAt) {
  const endedAt     = new Date();
  const startMs     = startedAt?.toDate ? startedAt.toDate().getTime() : Date.now();
  const durationSec = Math.round((endedAt.getTime() - startMs) / 1000);
  await db.collection('sessions').doc(sessionId).update({
    status:      'completed',
    endedAt:     firebase.firestore.FieldValue.serverTimestamp(),
    durationSec,
  });
  return durationSec;
}

// ── Rate Limiting ─────────────────────────────────────────────
async function getTodaySessionCount(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const snap = await db.collection('sessions')
    .where('userId', '==', userId)
    .where('startedAt', '>=', today)
    .get();
  return snap.size;
}

// ── Results ───────────────────────────────────────────────────
async function saveResult(sessionId, userId, evalJson) {
  const resultData = {
    sessionId,
    userId,
    checklistJson:     evalJson.checklist_results || [],
    historyScore:      evalJson.history_score     || 0,
    diagnosisScore:    evalJson.diagnosis_score   || 0,
    drugScore:         evalJson.drug_score        || 0,
    counselingScore:   evalJson.counseling_score  || 0,
    overallScore:      evalJson.overall           || 0,
    feedbackJson:      evalJson,
    createdAt:         firebase.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('sessions').doc(sessionId).update({ status: 'evaluated' });
  const ref = await db.collection('results').add(resultData);
  return { id: ref.id, ...resultData };
}

async function getMyResults(userId) {
  const snap = await db.collection('results')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getSessionById(sessionId) {
  const snap = await db.collection('sessions').doc(sessionId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ── Admin helpers ─────────────────────────────────────────────
async function adminSaveCase(caseData, caseId = null) {
  if (caseId) {
    await db.collection('cases').doc(caseId).set(caseData, { merge: true });
    return caseId;
  }
  const ref = await db.collection('cases').add({
    ...caseData,
    isActive:  true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function adminToggleCase(caseId, isActive) {
  await db.collection('cases').doc(caseId).update({ isActive });
}

async function adminGetAllResults() {
  const snap = await db.collection('results').orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function adminSaveDrug(drugData, drugId = null) {
  if (drugId) {
    await db.collection('drugs').doc(drugId).set(drugData, { merge: true });
    return drugId;
  }
  const ref = await db.collection('drugs').add({ ...drugData, isActive: true });
  return ref.id;
}
