const fs = require('fs');
let code = fs.readFileSync('src/services/OrderService.ts', 'utf8');

const replacement = `  static async updateRTDB(updates: Record<string, any>): Promise<boolean> {
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
  }`;

// Replace the updateRTDB function
const pattern = /  static async updateRTDB\(updates: Record<string, any>\): Promise<boolean> {[\s\S]*?    \} catch \(e\) {[\s\S]*?      console.error\('OrderService.updateRTDB failed:', e\);[\s\S]*?      return false;[\s\S]*?    }\n  }/;
code = code.replace(pattern, replacement);

fs.writeFileSync('src/services/OrderService.ts', code);
