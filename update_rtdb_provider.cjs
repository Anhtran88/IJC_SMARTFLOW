const fs = require('fs');

const path = 'src/data/providers/RealtimeDatabaseProvider.ts';
let content = fs.readFileSync(path, 'utf8');

content = "import { doc, collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';\n" + content;
content = content.replace(
  "import { getDB, ref, set, update, sanitizeRTDBPath } from '../../lib/firebaseService';",
  "import { getDB, getFirestoreDB, ref, set, update, sanitizeRTDBPath } from '../../lib/firebaseService';"
);

const MIGRATED_COLS = "['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders']";

const newGet = `
  async get<T>(path: string): Promise<T | null> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (${MIGRATED_COLS}.includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        if (parts.length === 1) {
          const snapshot = await getDocs(collection(fsDb, parts[0]));
          const val: any = {};
          snapshot.forEach(doc => { val[doc.id] = doc.data(); });
          return Object.keys(val).length > 0 ? (val as T) : null;
        } else {
          const snapshot = await getDoc(doc(fsDb, parts[0], parts.slice(1).join('/')));
          if (snapshot.exists()) {
            return snapshot.data() as T;
          }
          return null;
        }
      }
    }
    
    const dbRef = ref(this.db);
    const snapshot = await get(child(dbRef, safePath));
    if (snapshot.exists()) {
      return snapshot.val() as T;
    }
    return null;
  }
`;

const newSet = `
  async set<T>(path: string, data: T): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (${MIGRATED_COLS}.includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        if (parts.length > 1) {
          await setDoc(doc(fsDb, parts[0], parts.slice(1).join('/')), data);
          return;
        }
      }
    }
    await set(ref(this.db, path), data);
  }
`;

const newPush = `
  async push<T>(path: string, data: T): Promise<string | null> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (${MIGRATED_COLS}.includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        const docRef = doc(collection(fsDb, parts[0]));
        await setDoc(docRef, data);
        return docRef.id;
      }
    }
    const newRef = push(ref(this.db, path));
    await set(newRef, data);
    return newRef.key;
  }
`;

const newUpdate = `
  async update(path: string, updates: Record<string, any>): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (${MIGRATED_COLS}.includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb && parts.length > 1) {
        await updateDoc(doc(fsDb, parts[0], parts.slice(1).join('/')), updates);
        return;
      }
    }
    await update(ref(this.db, path), updates);
  }
`;

const newRemove = `
  async remove(path: string): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (${MIGRATED_COLS}.includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb && parts.length > 1) {
        await deleteDoc(doc(fsDb, parts[0], parts.slice(1).join('/')));
        return;
      }
    }
    await remove(ref(this.db, path));
  }
`;

content = content.replace(/async get<T>\(path: string\): Promise<T \| null> \{[\s\S]*?return null;\s*\}/, newGet.trim());
content = content.replace(/async set<T>\(path: string, data: T\): Promise<void> \{[\s\S]*?await set\(ref\(this\.db, path\), data\);\s*\}/, newSet.trim());
content = content.replace(/async push<T>\(path: string, data: T\): Promise<string \| null> \{[\s\S]*?return newRef\.key;\s*\}/, newPush.trim());
content = content.replace(/async update\(path: string, updates: Record<string, any>\): Promise<void> \{[\s\S]*?await update\(ref\(this\.db, path\), updates\);\s*\}/, newUpdate.trim());
content = content.replace(/async remove\(path: string\): Promise<void> \{[\s\S]*?await remove\(ref\(this\.db, path\)\);\s*\}/, newRemove.trim());

fs.writeFileSync(path, content);
