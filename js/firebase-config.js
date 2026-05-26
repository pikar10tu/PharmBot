// ============================================================
//  firebase-config.js
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDen-2UBEAFy9j02okgWVb26MvQSSL6zAU",
  authDomain:        "pharmbot-8496c.firebaseapp.com",
  projectId:         "pharmbot-8496c",
  storageBucket:     "pharmbot-8496c.firebasestorage.app",
  messagingSenderId: "718567047408",
  appId:             "1:718567047408:web:00ca3786d8762261350235"
};

firebase.initializeApp(FIREBASE_CONFIG);

const auth = firebase.auth();
const db   = firebase.firestore();
