const fs = require('fs');
const path = 'src/lib/recalculationService.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const itemsSnap = await get\(ref\(db, 'estimateItems'\)\);[\s\S]*?if \(itemsSnap\.exists\(\)\) \{[\s\S]*?const val = itemsSnap\.val\(\);[\s\S]*?estimateItems = Object\.keys\(val\)\.map\(k => \(\{ id: k, \.\.\.val\[k\] \}\)\);[\s\S]*?\}/g, `
      const fsDb2 = getFirestoreDB();
      const itemsSnap = await getDocs(collection(fsDb2!, 'estimateItems'));
      const val: any = {};
      itemsSnap.forEach(d => { val[d.id] = d.data(); });
      estimateItems = Object.keys(val).map(k => ({ id: k, ...val[k] }));
`);

content = content.replace(/const grpSnap = await get\(ref\(db, 'estimateGroups'\)\);[\s\S]*?if \(grpSnap\.exists\(\)\) \{[\s\S]*?const val = grpSnap\.val\(\);[\s\S]*?estimateGroups = Object\.keys\(val\)\.map\(k => \(\{ \.\.\.val\[k\], groupId: k, id: k \}\)\);[\s\S]*?\}/g, `
      const fsDb2 = getFirestoreDB();
      const grpSnap = await getDocs(collection(fsDb2!, 'estimateGroups'));
      const grpVal: any = {};
      grpSnap.forEach(d => { grpVal[d.id] = d.data(); });
      estimateGroups = Object.keys(grpVal).map(k => ({ ...grpVal[k], groupId: k, id: k }));
`);

content = content.replace(/const ordersSnap = await get\(ref\(db, 'bm06Orders'\)\);[\s\S]*?if \(ordersSnap\.exists\(\)\) \{[\s\S]*?const val = ordersSnap\.val\(\);[\s\S]*?bm06Orders = Object\.keys\(val\)\.map\(k => \(\{ id: k, \.\.\.val\[k\] \}\)\);[\s\S]*?\}/g, `
      const fsDb2 = getFirestoreDB();
      const ordersSnap = await getDocs(collection(fsDb2!, 'bm06Orders'));
      const ordersVal: any = {};
      ordersSnap.forEach(d => { ordersVal[d.id] = d.data(); });
      bm06Orders = Object.keys(ordersVal).map(k => ({ id: k, ...ordersVal[k] }));
`);

fs.writeFileSync(path, content);
