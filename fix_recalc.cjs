const fs = require('fs');
let code = fs.readFileSync('src/lib/recalculationService.ts', 'utf8');

// Replace all `rtdbUpdates[`estimateItems/...`]` with batch.update() maybe? No, we can just replace `update(ref(db), rtdbUpdates)` with a custom logic that parses the keys and updates Firestore.
const replacement = `
    const fsDb = getFirestoreDB();
    if (fsDb && Object.keys(rtdbUpdates).length > 0) {
       for (const key of Object.keys(rtdbUpdates)) {
         const parts = key.split('/');
         const col = parts[0];
         const docId = parts[1];
         const fieldPath = parts.slice(2).join('.');
         
         const isFirestore = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders', 'bbntOrders', 'projects', 'lichSu'].includes(col);
         
         if (isFirestore) {
            const val = rtdbUpdates[key];
            if (parts.length === 2) {
               if (val === null) await deleteDoc(doc(fsDb, col, docId));
               else await setDoc(doc(fsDb, col, docId), val, { merge: true });
            } else if (parts.length > 2) {
               if (val === null) {
                  // Ignore nested null update for simplicity or handle it:
                  const updateObj = {}; updateObj[fieldPath] = null;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               } else {
                  const updateObj = {}; updateObj[fieldPath] = val;
                  await setDoc(doc(fsDb, col, docId), updateObj, { merge: true });
               }
            }
         } else {
            const tempDb = getDB();
            if (tempDb) {
               const rUpdate = {};
               rUpdate[key] = rtdbUpdates[key];
               await update(ref(tempDb), rUpdate);
            }
         }
       }
    }
`;

code = code.replace(/await update\(ref\(db\), rtdbUpdates\);/g, replacement);
code = code.replace(/await update\(ref\(db\), removeUndefined\(rtdbUpdates\)\);/g, replacement.replace('rtdbUpdates[key]', 'removeUndefined(rtdbUpdates)[key]'));

fs.writeFileSync('src/lib/recalculationService.ts', code);
