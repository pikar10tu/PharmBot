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

// Called on app start — restore session if still logged in
function onAuthReady(callback) {
  auth.onAuthStateChanged(async (user) => {
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
