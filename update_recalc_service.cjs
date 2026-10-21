const fs = require('fs');

const path = 'src/lib/recalculationService.ts';
let content = fs.readFileSync(path, 'utf8');

content = "import { doc, collection, getDocs, getDoc, setDoc, updateDoc } from 'firebase/firestore';\nimport { getFirestoreDB } from './firebaseService';\n" + content;

content = content.replace(/const itemsSnap = await get\(ref\(db, 'estimateItems'\)\);[\s\S]*?const val = itemsSnap\.val\(\);/, `
      const fsDb = getFirestoreDB();
      const itemsSnap = await getDocs(collection(fsDb!, 'estimateItems'));
      const val: any = {};
      itemsSnap.forEach(d => { val[d.id] = d.data(); });
`);

content = content.replace(/const grpSnap = await get\(ref\(db, 'estimateGroups'\)\);[\s\S]*?const grpVal = grpSnap\.val\(\);/, `
      const grpSnap = await getDocs(collection(fsDb!, 'estimateGroups'));
      const grpVal: any = {};
      grpSnap.forEach(d => { grpVal[d.id] = d.data(); });
`);

content = content.replace(/const ordersSnap = await get\(ref\(db, 'bm06Orders'\)\);[\s\S]*?const ordersVal = ordersSnap\.val\(\);/, `
      const ordersSnap = await getDocs(collection(fsDb!, 'bm06Orders'));
      const ordersVal: any = {};
      ordersSnap.forEach(d => { ordersVal[d.id] = d.data(); });
`);

// update() writes to both or just RTDB? recalculationService updates estimateItems and estimateGroups!
// await update(ref(db), rtdbUpdates);
// We need to split rtdbUpdates into firestoreUpdates and rtdbUpdates!
content = content.replace(/await update\(ref\(db\), rtdbUpdates\);/g, `
    const fsDb2 = getFirestoreDB();
    if (fsDb2) {
      for (const [k, v] of Object.entries(rtdbUpdates)) {
        const parts = k.split('/');
        if (['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'].includes(parts[0])) {
           if (parts.length > 1) {
             const docId = parts[1];
             const restPath = parts.slice(2).join('.');
             if (restPath) {
               await updateDoc(doc(fsDb2, parts[0], docId), { [restPath]: v });
             } else {
               await setDoc(doc(fsDb2, parts[0], docId), v, { merge: true });
             }
           }
           delete rtdbUpdates[k];
        }
      }
    }
    await update(ref(db), rtdbUpdates);
`);

fs.writeFileSync(path, content);
