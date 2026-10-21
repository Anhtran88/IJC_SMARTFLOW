import { Firestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDB, handleFirestoreError, OperationType } from '../../lib/firebaseService';

export class FirestoreProvider {
  private get db(): Firestore | null {
    return getFirestoreDB();
  }

  async getDoc<T>(collectionName: string, id: string): Promise<T | null> {
    const dbInstance = this.db;
    if (!dbInstance) return null;
    try {
      const docRef = doc(dbInstance, collectionName, id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as T;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${id}`);
      return null;
    }
  }

  async getCollection<T>(collectionName: string): Promise<T[]> {
    const dbInstance = this.db;
    if (!dbInstance) return [];
    try {
      const colRef = collection(dbInstance, collectionName);
      const snap = await getDocs(colRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, collectionName);
      return [];
    }
  }

  async setDoc<T extends Record<string, any>>(collectionName: string, id: string, data: T, merge = true): Promise<void> {
    const dbInstance = this.db;
    if (!dbInstance) return;
    try {
      const docRef = doc(dbInstance, collectionName, id);
      await setDoc(docRef, data, { merge });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${collectionName}/${id}`);
    }
  }

  async updateDoc(collectionName: string, id: string, updates: Record<string, any>): Promise<void> {
    const dbInstance = this.db;
    if (!dbInstance) return;
    try {
      const docRef = doc(dbInstance, collectionName, id);
      await updateDoc(docRef, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
    }
  }

  async deleteDoc(collectionName: string, id: string): Promise<void> {
    const dbInstance = this.db;
    if (!dbInstance) return;
    try {
      const docRef = doc(dbInstance, collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
    }
  }

  onSnapshot<T>(collectionName: string, id: string, callback: (data: T | null) => void): () => void {
    const dbInstance = this.db;
    if (!dbInstance) return () => {};
    const docRef = doc(dbInstance, collectionName, id);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() } as T);
      } else {
        callback(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${id}`);
    });
  }
}

export const firestoreProvider = new FirestoreProvider();
