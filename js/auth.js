// ============================================================
//  auth.js — Firebase Authentication helpers
//  Blind participant login: P00001 → p00001@pharmbot.local
// ============================================================

let _currentUser = null;  // Firebase user object
let _userProfile  = null; // Firestore /users/{uid} document

function participantIdToEmail(participantId) {
  return participantId.toLowerCase().trim() + '@pharmbot.local';
}

async function loginWithParticipantId(participantId, password) {
  const email = participantIdToEmail(participantId);
  const cred  = await auth.signInWithEmailAndPassword(email, password);
  _currentUser = cred.user;

  // Load user profile from Firestore
  const snap = await db.collection('users').doc(_currentUser.uid).get();
  _userProfile = snap.exists ? snap.data() : { participantId, role: 'student' };

  // Load Gemini API key into memory
  await loadGeminiConfig();

  return { user: _currentUser, profile: _userProfile };
}

async function logout() {
  clearGeminiConfig();
  _currentUser = null;
  _userProfile  = null;
  await auth.signOut();
  Router.go('login');
}

function getCurrentUser()    { return _currentUser;  }
function getUserProfile()    { return _userProfile;   }
function isAdmin()           { return _userProfile?.role === 'admin'; }

// Called on app start — restore session if still logged in.
//
// ⚠️ ต้องยิง callback "ครั้งเดียว" เท่านั้น
// onAuthStateChanged ยิงซ้ำตอน sign-in สำเร็จด้วย (โหลดหน้า = null → login = user)
// รอบที่สองจะไปเรียก Router.init() ซ้ำ → มี hashchange listener 2 ตัว →
// ทุกหน้า render 2 รอบ → เข้าเคส 1 ครั้งได้ session doc 2 ใบ + เรียก Gemini ซ้ำ
// state หลังจากนี้ดูแลโดย loginWithParticipantId() / logout() โดยตรงอยู่แล้ว
function onAuthReady(callback) {
  let fired      = false;
  let unsubscribe = null;

  unsubscribe = auth.onAuthStateChanged(async (user) => {
    if (fired) return;
    fired = true;
    // null ได้เฉพาะกรณียิงแบบ synchronous ซึ่ง flag ด้านบนกันไว้แล้ว
    if (unsubscribe) unsubscribe();

    if (user) {
      _currentUser = user;
      try {
        const snap = await db.collection('users').doc(user.uid).get();
        _userProfile = snap.exists ? snap.data() : null;
        await loadGeminiConfig();
      } catch (e) {
        console.warn('onAuthReady restore failed:', e);
      }
    }
    callback(user);
  });
}
