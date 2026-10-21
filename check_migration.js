import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const config = {
  apiKey: "AIzaSyAsL_KjXD04b-d_KqMvti_82dcRfR6_b9s",
  authDomain: "gen-lang-client-0450862757.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0450862757-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gen-lang-client-0450862757",
  storageBucket: "gen-lang-client-0450862757.firebasestorage.app",
  messagingSenderId: "665710750210",
  appId: "1:665710750210:web:80fb17dba327b5e63c551b"
};

const app = initializeApp(config);
const db = getDatabase(app);
const fsDb = getFirestore(app);

const collections = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'];

async function check() {
  console.log('--- KẾT QUẢ ĐỐI SOÁT DỮ LIỆU ---');
  for (const col of collections) {
    try {
      const rtdbSnap = await get(ref(db, col));
      const rtdbCount = rtdbSnap.exists() ? Object.keys(rtdbSnap.val()).length : 0;
      
      const fsSnap = await getDocs(collection(fsDb, col));
      const fsCount = fsSnap.size;
      
      console.log(`\nPhân hệ: ${col}`);
      console.log(`- RTDB: ${rtdbCount} bản ghi`);
      console.log(`- Firestore: ${fsCount} bản ghi`);
      if (rtdbCount === fsCount) {
        console.log(`=> ĐỒNG BỘ 100%`);
      } else {
        console.log(`=> LỆCH DỮ LIỆU (${rtdbCount} vs ${fsCount})`);
      }
    } catch(e) {
      console.log(`\nPhân hệ: ${col}`);
      console.log(`- LỖI: ${e.message}`);
    }
  }
  console.log('\n---------------------------------');
  process.exit(0);
}

check();
