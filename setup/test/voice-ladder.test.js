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
