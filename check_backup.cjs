const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');

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
const rtdb = getDatabase(app);

async function check() {
  const snap = await get(ref(rtdb, 'system_backups'));
  if (snap.exists()) {
    const backups = snap.val();
    const keys = Object.keys(backups);
    if (keys.length > 0) {
      const latestKey = keys[keys.length - 1];
      const latestBackup = backups[latestKey];
      console.log('Latest backup key:', latestKey);
      if (latestBackup.data && latestBackup.data.bm032Orders) {
        console.log('BM03.2 in latest backup:', Object.keys(latestBackup.data.bm032Orders).length);
      } else {
        console.log('No BM03.2 in latest backup');
      }
      if (latestBackup.data && latestBackup.data.bm02Orders) {
        console.log('BM02 in latest backup:', Object.keys(latestBackup.data.bm02Orders).length);
      }
    } else {
      console.log('No backups found');
    }
  } else {
    console.log('No system_backups node');
  }
  process.exit(0);
}

check().catch(console.error);
