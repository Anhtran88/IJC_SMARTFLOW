const fs = require('fs');
let code = fs.readFileSync('src/lib/firebaseService.ts', 'utf8');

code = code.replace(/export const loadProjectTotalUnitsAll = async.*?\} catch \(err\) \{/s,
`export const loadProjectTotalUnitsAll = async () => {
  const fsDb = getFirestoreDB();
  if (!fsDb) return;
  try {
    const snap = await getDocs(collection(fsDb, 'projects'));
    const newCache: Record<string, number> = {};
    snap.forEach(docSnap => {
      const k = docSnap.id;
      const decoded = decodeRTDBKey(k);
      const node = docSnap.data();
      if (node && typeof node === 'object' && node.totalUnits) {
        const num = Number(node.totalUnits);
        if (!isNaN(num) && num > 0) {
          newCache[k] = num;
          newCache[decoded] = num;
          const norm = normalizeProjectName(decoded) || normalizeProjectName(k);
          if (norm) newCache[norm] = num;
        }
      }
    });
    _projectTotalUnitsCache = { ..._projectTotalUnitsCache, ...newCache };
  } catch (err) {`);

fs.writeFileSync('src/lib/firebaseService.ts', code);
