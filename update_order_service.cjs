const fs = require('fs');

const path = 'src/services/OrderService.ts';
let content = fs.readFileSync(path, 'utf8');

// Add Firestore imports
content = "import { doc, collection, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';\n" + content;
content = content.replace(
  "import { getDB, removeUndefined, ref, update, sanitizeRTDBPath } from '../lib/firebaseService';",
  "import { getDB, getFirestoreDB, removeUndefined, ref, update, sanitizeRTDBPath } from '../lib/firebaseService';"
);

// We replace fetchBM02Orders, fetchBM06Orders, getBM06Record, getEstimateItemSnapshot, getEstimateGroupSnapshot, getAllEstimateItems, deleteBM06Order, deleteBM02Order, getEstimateItemPrice
// Instead of replacing manually with regex, we can write a script to replace the function bodies.

content = content.replace(/static async fetchBM02Orders\(\): Promise<any\[\]> \{[\s\S]*?catch \(e\) \{[\s\S]*?return \[\];\s*\}\s*\}/, `static async fetchBM02Orders(): Promise<any[]> {
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
  }`);

content = content.replace(/static async fetchBM06Orders\(\): Promise<any\[\]> \{[\s\S]*?catch \(e\) \{[\s\S]*?return \[\];\s*\}\s*\}/, `static async fetchBM06Orders(): Promise<any[]> {
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
  }`);

content = content.replace(/static async getBM06Record\(bm06Id: string\): Promise<any> \{[\s\S]*?catch \(e\) \{[\s\S]*?return null;\s*\}\s*\}/, `static async getBM06Record(bm06Id: string): Promise<any> {
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
  }`);

content = content.replace(/static async getEstimateItemSnapshot\(itemId: string\): Promise<any> \{[\s\S]*?catch \(e\) \{[\s\S]*?return null;\s*\}\s*\}/, `static async getEstimateItemSnapshot(itemId: string): Promise<any> {
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
  }`);

content = content.replace(/static async getEstimateGroupSnapshot\(groupId: string\): Promise<any> \{[\s\S]*?catch \(e\) \{[\s\S]*?return null;\s*\}\s*\}/, `static async getEstimateGroupSnapshot(groupId: string): Promise<any> {
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
  }`);

content = content.replace(/static async getAllEstimateItems\(\): Promise<Record<string, any>> \{[\s\S]*?catch \(e\) \{[\s\S]*?return \{\};\s*\}\s*\}/, `static async getAllEstimateItems(): Promise<Record<string, any>> {
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
  }`);

content = content.replace(/static async deleteBM06Order\(rawId: string\): Promise<void> \{[\s\S]*?catch \(e\) \{[\s\S]*?\}\s*\}/, `static async deleteBM06Order(rawId: string): Promise<void> {
    const fsDb = getFirestoreDB();
    if (!fsDb || !rawId) return;
    try {
      const clean = sanitizeRTDBPath(rawId);
      const pureRaw = clean.replace(/^(BM06|BM02|BM03\\.2)-/i, '');
      const idsToRemove = Array.from(new Set([clean, pureRaw, \`BM06-\${pureRaw}\`]));
      for (const key of idsToRemove) {
        if (key) {
          await deleteDoc(doc(fsDb, 'bm06Orders', key));
        }
      }
    } catch (e) {
      console.error('OrderService.deleteBM06Order failed:', e);
    }
  }`);

content = content.replace(/static async deleteBM02Order\(rawId: string\): Promise<void> \{[\s\S]*?catch \(e\) \{[\s\S]*?\}\s*\}/, `static async deleteBM02Order(rawId: string): Promise<void> {
    const fsDb = getFirestoreDB();
    if (!fsDb || !rawId) return;
    try {
      const clean = sanitizeRTDBPath(rawId);
      const pureRaw = clean.replace(/^(BM06|BM02|BM03\\.2)-/i, '');
      const idsToRemove = Array.from(new Set([clean, pureRaw, \`BM02-\${pureRaw}\`, rawId]));
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
          const itemRawId = String(itemKey).replace(/^(BM02|BM06|BM03\\.2)-/i, '');
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
  }`);

content = content.replace(/static async getEstimateItemPrice\(materialName: string, rowProj\?: string, rowUnit\?: string\): Promise<number> \{[\s\S]*?catch \(e\) \{[\s\S]*?return 0;\s*\}\s*\}/, `static async getEstimateItemPrice(materialName: string, rowProj?: string, rowUnit?: string): Promise<number> {
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
  }`);

fs.writeFileSync(path, content);
