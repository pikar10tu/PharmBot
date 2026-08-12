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
