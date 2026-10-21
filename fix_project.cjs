const fs = require('fs');
let code = fs.readFileSync('src/services/ProjectService.ts', 'utf8');

const targetMethodPattern = /async getProjectsFromDB\(\): Promise<ProjectRecord\[\]> \{[\s\S]*?catch \(err\) \{[\s\S]*?return \[\];\s*\}\s*\}/;

const replacement = `  async getProjectsFromDB(): Promise<ProjectRecord[]> {
    const fsDb = getFirestoreDB();
    if (!fsDb) return [];
    try {
      const snap = await getDocs(collection(fsDb, 'projects'));
      const records: ProjectRecord[] = [];
      snap.forEach(docSnap => {
        const key = docSnap.id;
        const node = docSnap.data();
        let rawName = '';
        if (typeof node === 'object' && node !== null) {
          rawName = node.name || node.info?.name || node.projectName || node.ten || '';
        }
        const resolvedName = (rawName && String(rawName).trim()) ? String(rawName).trim() : key;
        const normalizedName = normalizeProjectName(resolvedName) || resolvedName;
        const totalUnitsVal = (typeof node === 'object' && node !== null) ? (node.totalUnits ?? null) : null;
        
        if (totalUnitsVal !== null && !isNaN(Number(totalUnitsVal))) {
          const num = Number(totalUnitsVal);
          updateProjectTotalUnitsCache(key, num);
          updateProjectTotalUnitsCache(resolvedName, num);
          updateProjectTotalUnitsCache(normalizedName, num);
        }
        const record: ProjectRecord = {
          id: key,
          key: key,
          name: normalizedName,
          totalUnits: totalUnitsVal !== null ? Number(totalUnitsVal) : null,
          ...(typeof node === 'object' && node !== null ? node : {})
        };
        this.keyToNameMap.set(key, normalizedName);
        this.nameToKeyMap.set(normalizedName.toLowerCase(), key);
        records.push(record);
      });
      return records;
    } catch (err) {
      console.warn('[ProjectService] Lỗi khi đọc danh sách projects từ DB:', err);
      return [];
    }
  }`;

code = code.replace(targetMethodPattern, replacement);
if (!code.includes("import { collection, getDocs }")) {
   code = "import { collection, getDocs } from 'firebase/firestore';\n" + "import { getFirestoreDB } from '../lib/firebaseService';\n" + code;
}

fs.writeFileSync('src/services/ProjectService.ts', code);
