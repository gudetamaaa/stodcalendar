// ============================================================
// FIREBASE CONFIG — replace with YOUR project's values.
//
// 1. Go to https://console.firebase.google.com
// 2. Create a project (free "Spark" plan is enough)
// 3. Project settings (gear icon) → General → "Your apps" → Web app (</> icon)
// 4. Copy the firebaseConfig object it gives you and paste the values below
// 5. In the left menu go to "Build" → "Firestore Database" → Create database
//    → start in TEST MODE (fine for an internal office tool; see README for
//    a slightly safer ruleset)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDJMGR5UvL4MGTcNa5bRjUICzN-7xe8aCs",
  authDomain: "calendar-e762f.firebaseapp.com",
  projectId: "calendar-e762f",
  storageBucket: "calendar-e762f.firebasestorage.app",
  messagingSenderId: "1075374888237",
  appId: "1:1075374888237:web:7819b9f2fa03f531416fa4",
  measurementId: "G-D92F429Y9D"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

