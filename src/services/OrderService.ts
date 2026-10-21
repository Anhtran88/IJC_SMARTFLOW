import { doc, collection, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { get, remove } from 'firebase/database';
import { getDB, getFirestoreDB, removeUndefined, ref, update, sanitizeRTDBPath } from '../lib/firebaseService';
import { firebaseListenerManager } from './FirebaseListenerManager';
import { materialCache } from './MaterialCache';
import { extractMaPhieu } from '../utils/extractMaPhieu';

export class OrderService {
  static subscribeBM02(docId: string, callback: (data: any) => void): () => void {
    const cleanDocId = sanitizeRTDBPath(docId);
    return firebaseListenerManager.subscribe(`bm02Orders/${cleanDocId}`, (val) => {
      if (val) callback(val);
    });
  }

  static subscribeBM032(docId: string, callback: (data: any) => void): () => void {
    const cleanDocId = sanitizeRTDBPath(docId);
    return firebaseListenerManager.subscribe(`bm032Orders/${cleanDocId}`, (val) => {
      if (val) callback(val);
    });
  }

  static async fetchBM02Orders(): Promise<any[]> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return [];
    try {
      const snap = await getDocs(collection(fsDb, 'bm02Orders'));
      const list: any[] = [];
      snap.forEach(doc => { list.push({ ...doc.data(), id: doc.id }); });
      return list;
    } catch (e) {
      console.error('OrderService.fetchBM02Orders failed:', e);
      return [];
    }
  }

  static async fetchBM06Orders(): Promise<any[]> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return [];
    try {
      const snap = await getDocs(collection(fsDb, 'bm06Orders'));
      const list: any[] = [];
      snap.forEach(doc => { list.push({ ...doc.data(), id: doc.id }); });
      return list;
    } catch (e) {
      console.error('OrderService.fetchBM06Orders failed:', e);
      return [];
    }
  }

  static async getBM06Record(bm06Id: string): Promise<any> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return null;
    try {
      const snap = await getDoc(doc(fsDb, 'bm06Orders', bm06Id));
      if (snap.exists()) return snap.data();
      return null;
    } catch (e) {
      console.error('OrderService.getBM06Record failed:', e);
      return null;
    }
  }

  static async getEstimateItemSnapshot(itemId: string): Promise<any> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return null;
    try {
      const snap = await getDoc(doc(fsDb, 'estimateItems', itemId));
      if (snap.exists()) return snap.data();
      return null;
    } catch (e) {
      console.error('OrderService.getEstimateItemSnapshot failed:', e);
      return null;
    }
  }

  static async getEstimateGroupSnapshot(groupId: string): Promise<any> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return null;
    try {
      const snap = await getDoc(doc(fsDb, 'estimateGroups', groupId));
      if (snap.exists()) return snap.data();
      return null;
    } catch (e) {
      console.error('OrderService.getEstimateGroupSnapshot failed:', e);
      return null;
    }
  }

  static async getAllEstimateItems(): Promise<Record<string, any>> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return {};
    try {
      const snap = await getDocs(collection(fsDb, 'estimateItems'));
      const dict: any = {};
      snap.forEach(doc => { dict[doc.id] = doc.data(); });
      return dict;
    } catch (e) {
      console.error('OrderService.getAllEstimateItems failed:', e);
      return {};
    }
  }

  static async updateRTDB(updates: Record<string, any>): Promise<boolean> {
    const db = getDB();
    const fsDb = getFirestoreDB();
    if (!db || !fsDb) return false;

    try {
      const rtdbUpdates: Record<string, any> = {};
      
      const firestoreCollections = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders', 'bbntOrders', 'projects', 'lichSu'];
      
      for (const k of Object.keys(updates || {})) {
        const cleanKey = sanitizeRTDBPath(k);
        let cleanedVal = removeUndefined(updates[k]);
        if (cleanedVal === undefined) continue;
        
        const parts = cleanKey.split('/');
        const col = parts[0];
        
        if (firestoreCollections.includes(col)) {
          if (parts.length === 2) {
            const docId = parts[1];
            if (cleanedVal === null) {
              await deleteDoc(doc(fsDb, col, docId));
            } else {
              await setDoc(doc(fsDb, col, docId), cleanedVal, { merge: true });
            }
          } else if (parts.length > 2) {
             const docId = parts[1];
             const fieldPath = parts.slice(2).join('.');
             if (cleanedVal === null) {
                 // Not fully supported in this simple merge, but can use deleteField() from firestore
                 // For now, if someone updates a nested field to null, we might need a workaround.
                 // In our codebase, they usually update the whole object. Let's merge it:
                 const updateObj = {}; updateObj[fieldPath] = null; // actually should use deleteField()
                 await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
             } else {
                 const updateObj = {}; updateObj[fieldPath] = cleanedVal;
                 await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
             }
          }
        } else {
          rtdbUpdates[cleanKey] = cleanedVal;
        }
      }
      if (Object.keys(rtdbUpdates).length > 0) {
        await update(ref(db), rtdbUpdates);
      }
      return true;
    } catch (e) {
      console.error('OrderService.updateRTDB/Firestore dispatch failed:', e);
      return false;
    }
  }

  static async deleteBM06Order(rawId: string): Promise<void> {
    const fsDb = getFirestoreDB();
    if (!fsDb || !rawId) return;
    try {
      const clean = sanitizeRTDBPath(rawId);
      const pureRaw = clean.replace(/^(BM06|BM02|BM03\.2)-/i, '');
      const idsToRemove = Array.from(new Set([clean, pureRaw, `BM06-${pureRaw}`]));
      for (const key of idsToRemove) {
        if (key) {
          await deleteDoc(doc(fsDb, 'bm06Orders', key));
        }
      }
    } catch (e) {
      console.error('OrderService.deleteBM06Order failed:', e);
    }
  }

  static async deleteBM02Order(rawId: string): Promise<void> {
    const fsDb = getFirestoreDB();
    if (!fsDb || !rawId) return;
    try {
      const clean = sanitizeRTDBPath(rawId);
      const pureRaw = clean.replace(/^(BM06|BM02|BM03\.2)-/i, '');
      const idsToRemove = Array.from(new Set([clean, pureRaw, `BM02-${pureRaw}`, rawId]));
      for (const key of idsToRemove) {
        if (key) {
          await deleteDoc(doc(fsDb, 'bm02Orders', key));
        }
      }
      
      const snap = await getDocs(collection(fsDb, 'bm02Orders'));
      const val: any = {};
      snap.forEach(d => { val[d.id] = d.data(); });
      
      if (val && typeof val === 'object') {
        for (const itemKey of Object.keys(val)) {
          const item = val[itemKey];
          if (!item) continue;
          const itemCode = extractMaPhieu(item);
          const itemRawId = String(itemKey).replace(/^(BM02|BM06|BM03\.2)-/i, '');
          const matches = idsToRemove.some(tid => {
            if (!tid) return false;
            const lowerTid = tid.toLowerCase();
            return itemKey.toLowerCase() === lowerTid ||
              itemRawId.toLowerCase() === lowerTid ||
              (itemCode && itemCode.toLowerCase() === lowerTid) ||
              (item.id && String(item.id).toLowerCase() === lowerTid) ||
              (item.snapshotId && String(item.snapshotId).toLowerCase() === lowerTid) ||
              (item.maPhieu && String(item.maPhieu).toLowerCase() === lowerTid);
          });
          if (matches) {
            await deleteDoc(doc(fsDb, 'bm02Orders', itemKey));
          }
        }
      }
    } catch (e) {
      console.error('OrderService.deleteBM02Order failed:', e);
    }
  }

  static async getEstimateItemPrice(materialName: string, rowProj?: string, rowUnit?: string): Promise<number> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return 0;
    try {
      const snap = await getDocs(collection(fsDb, 'estimateItems'));
      let matchedEstPrice = 0;
      snap.forEach(docSnap => {
        const est = docSnap.data();
        if (
          est &&
          String(est.name).toLowerCase().trim() === materialName.toLowerCase().trim() &&
          (!rowProj || String(est.projectId).toLowerCase().trim() === rowProj.toLowerCase().trim()) &&
          (!rowUnit || String(est.unitId).toLowerCase().trim() === rowUnit.toLowerCase().trim())
        ) {
          if (Number(est.basePrice) > 0) {
            matchedEstPrice = Number(est.basePrice);
          }
        }
      });
      return matchedEstPrice;
    } catch (e) {
      console.error('OrderService.getEstimateItemPrice failed:', e);
      return 0;
    }
  }

  static async checkMasterMaterialItemByName(materialName: string): Promise<{ matchedTypeId: string; matchedItemId: string; oldPrice: number } | null> {
    try {
      await materialCache.ensureLoaded();
      const match = materialCache.findMasterItemByName(materialName);
      if (match) {
        return {
          matchedTypeId: match.typeId,
          matchedItemId: match.itemId,
          oldPrice: Number(match.item.unitPrice) || 0
        };
      }
      return null;
    } catch (e) {
      console.error('OrderService.checkMasterMaterialItemByName failed:', e);
      return null;
    }
  }

  static async updateMasterMaterialPrice(typeId: string, itemId: string, newPrice: number): Promise<boolean> {
    const db = getDB();
    if (!db) return false;
    try {
      await update(ref(db, `cauHinh/materialItems/${typeId}/${itemId}`), {
        unitPrice: newPrice,
        updatedAt: Date.now()
      });
      materialCache.updateLocalMasterPrice(typeId, itemId, newPrice);
      return true;
    } catch (e) {
      console.error('OrderService.updateMasterMaterialPrice failed:', e);
      return false;
    }
  }
}
