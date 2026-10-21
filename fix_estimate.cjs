const fs = require('fs');
let code = fs.readFileSync('src/lib/estimateDataService.ts', 'utf8');

code = code.replace(
  /if \(db\) \{\s*try \{\s*const grpSnap = await get\(ref\(db, 'estimateGroups'\)\);\s*if \(grpSnap\.exists\(\)\) \{\s*const val = grpSnap\.val\(\);\s*rawGroups = Object\.keys\(val\)\.map\(k => \(\{ \.\.\.val\[k\], id: k, groupId: val\[k\]\.groupId \|\| k \}\)\);\s*\}\s*\} catch \(e\) \{\s*console\.warn\("RTDB estimateGroups fetch error:", e\);\s*\}/,
  `if (getFirestoreDB()) {
    try {
      const grpSnap = await getDocs(collection(getFirestoreDB(), 'estimateGroups'));
      grpSnap.forEach(doc => rawGroups.push({ ...doc.data(), id: doc.id, groupId: doc.data().groupId || doc.id }));
    } catch (e) { console.warn("Firestore estimateGroups fetch error:", e); }`
);

code = code.replace(
  /try \{\s*const itemsSnap = await get\(ref\(db, 'estimateItems'\)\);\s*if \(itemsSnap\.exists\(\)\) \{\s*const val = itemsSnap\.val\(\);\s*rawItems = Object\.keys\(val\)\.map\(k => \(\{ \.\.\.val\[k\], id: k \}\)\);\s*\}\s*\} catch \(e\) \{\s*console\.warn\("RTDB estimateItems fetch error:", e\);\s*\}/,
  `try {
      const itemsSnap = await getDocs(collection(getFirestoreDB(), 'estimateItems'));
      itemsSnap.forEach(doc => rawItems.push({ ...doc.data(), id: doc.id }));
    } catch (e) { console.warn("Firestore estimateItems fetch error:", e); }`
);

code = code.replace(
  /try \{\s*const ordersSnap = await get\(ref\(db, 'bm06Orders'\)\);\s*if \(ordersSnap\.exists\(\)\) \{\s*const val = ordersSnap\.val\(\);\s*rawOrders = Object\.keys\(val\)\.map\(k => \(\{ \.\.\.val\[k\], id: k \}\)\);\s*\}\s*\} catch \(e\) \{\s*console\.warn\("RTDB bm06Orders fetch error:", e\);\s*\}/,
  `try {
      const ordersSnap = await getDocs(collection(getFirestoreDB(), 'bm06Orders'));
      ordersSnap.forEach(doc => rawOrders.push({ ...doc.data(), id: doc.id }));
    } catch (e) { console.warn("Firestore bm06Orders fetch error:", e); }`
);

// Add missing imports to the top if not present
if (!code.includes("import { collection, getDocs }")) {
   code = code.replace("import { doc, getDoc, setDoc }", "import { doc, getDoc, setDoc, collection, getDocs }");
   // wait, is it imported? Let's just import it cleanly.
   code = "import { collection, getDocs } from 'firebase/firestore';\n" + "import { getFirestoreDB } from './firebaseService';\n" + code;
}

fs.writeFileSync('src/lib/estimateDataService.ts', code);
