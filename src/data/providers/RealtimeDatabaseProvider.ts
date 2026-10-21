import { doc, collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getDatabase, get, push, remove, runTransaction, child, Database } from 'firebase/database';
import { getDB, getFirestoreDB, ref, set, update, sanitizeRTDBPath, handleFirestoreError, OperationType } from '../../lib/firebaseService';
import { firebaseListenerManager } from '../../services/FirebaseListenerManager';

export class RealtimeDatabaseProvider {
  private get db(): Database {
    const dbInstance = getDB();
    if (!dbInstance) {
      throw new Error('Realtime Database is not initialized');
    }
    return dbInstance;
  }

  async get<T>(path: string): Promise<T | null> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        try {
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
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.GET, safePath);
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

  async set<T>(path: string, data: T): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        if (parts.length > 1) {
          try {
            await setDoc(doc(fsDb, parts[0], parts.slice(1).join('/')), data);
            return;
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.WRITE, safePath);
          }
        }
      }
    }
    await set(ref(this.db, path), data);
  }

  async push<T>(path: string, data: T): Promise<string | null> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb) {
        try {
          const docRef = doc(collection(fsDb, parts[0]));
          await setDoc(docRef, data);
          return docRef.id;
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.WRITE, safePath);
        }
      }
    }
    const newRef = push(ref(this.db, path));
    await set(newRef, data);
    return newRef.key;
  }

  async update(path: string, updates: Record<string, any>): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb && parts.length > 1) {
        try {
          await updateDoc(doc(fsDb, parts[0], parts.slice(1).join('/')), updates);
          return;
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.UPDATE, safePath);
        }
      }
    }
    await update(ref(this.db, path), updates);
  }

  async remove(path: string): Promise<void> {
    const safePath = sanitizeRTDBPath(path);
    const parts = safePath.split('/');
    if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
      const fsDb = getFirestoreDB();
      if (fsDb && parts.length > 1) {
        try {
          await deleteDoc(doc(fsDb, parts[0], parts.slice(1).join('/')));
          return;
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.DELETE, safePath);
        }
      }
    }
    await remove(ref(this.db, path));
  }

  async transaction(path: string, transactionUpdate: (currentData: any) => any): Promise<{ committed: boolean; snapshot: any }> {
    await runTransaction(ref(this.db, path), transactionUpdate);
    return {
      committed: true,
      snapshot: null
    };
  }

  onValue<T>(path: string, callback: (data: T | null) => void): () => void {
    return firebaseListenerManager.subscribe<T>(path, callback);
  }

  async multiUpdate(updates: Record<string, any>): Promise<void> {
    const dbRef = ref(this.db);
    await update(dbRef, updates);
  }
}

export const rtDbProvider = new RealtimeDatabaseProvider();
