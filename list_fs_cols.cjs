const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

const bootstrapFirebaseConfig = {
  apiKey: "AIzaSyAsL_KjXD04b-d_KqMvti_82dcRfR6_b9s",
  authDomain: "gen-lang-client-0450862757.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0450862757-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gen-lang-client-0450862757",
  storageBucket: "gen-lang-client-0450862757.firebasestorage.app",
  messagingSenderId: "665710750210",
  appId: "1:665710750210:web:80fb17dba327b5e63c551b"
};

const app = initializeApp(bootstrapFirebaseConfig);
const fsDb = getFirestore(app);

// In Web SDK, we can't easily list collections. Let's just check if there is a 'bm03.2Orders' or similar.
