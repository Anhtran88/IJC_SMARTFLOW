const fs = require('fs');

const path = 'src/lib/rtdbToFirestoreMigration.ts';

const content = `
import { getDB, getFirestoreDB } from './firebaseService';
import { get, ref } from 'firebase/database';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { exportFirestoreToJson, exportRtdbToJson, MigrationSummaryReport } from './firestoreToRtdbMigration';

export { exportFirestoreToJson, exportRtdbToJson };
export type { MigrationSummaryReport };

export const runRtdbToFirestoreMigration = async (
  onProgress?: (stage: string, percent: number) => void
): Promise<MigrationSummaryReport> => {
  onProgress?.('Bắt đầu tải dữ liệu từ RTDB...', 10);
  
  const db = getDB();
  const fsDb = getFirestoreDB();
  
  if (!db || !fsDb) {
    throw new Error('Chưa cấu hình Firebase hoặc Cloud Firestore.');
  }

  const collections = ['estimateItems', 'estimateGroups', 'bm02Orders', 'bm032Orders', 'bm06Orders'];
  let totalMigratedRecords = 0;
  let totalErrors = 0;
  const nodeReports: any[] = [];
  let totalRtdbRecords = 0;
  let skippedRecords = 0;

  let index = 0;
  for (const col of collections) {
    onProgress?.(\`Đang xử lý phân hệ: \${col}...\`, 10 + (index / collections.length) * 80);
    const nodeReport = {
      nodeName: col,
      firestoreCount: 0,
      rtdbCountBefore: 0,
      migratedCount: 0,
      skippedCount: 0,
      rtdbCountAfter: 0,
      verified: true,
      errors: [] as string[]
    };

    try {
      // 1. Get Firestore count before
      const fsSnap = await getDocs(collection(fsDb, col));
      nodeReport.rtdbCountBefore = fsSnap.size;

      // 2. Get RTDB data
      const rtdbSnap = await get(ref(db, col));
      const rtdbData = rtdbSnap.exists() ? rtdbSnap.val() : {};
      const keys = Object.keys(rtdbData);
      
      nodeReport.firestoreCount = keys.length;
      totalRtdbRecords += keys.length;

      // 3. Migrate
      let count = 0;
      for (const key of keys) {
        try {
          if (rtdbData[key]) {
            await setDoc(doc(fsDb, col, key), rtdbData[key], { merge: true });
            count++;
            totalMigratedRecords++;
          }
        } catch(e: any) {
          totalErrors++;
          nodeReport.errors.push(e.message);
          nodeReport.verified = false;
        }
      }
      
      nodeReport.migratedCount = count;
      
      // 4. Get Firestore count after
      const fsSnapAfter = await getDocs(collection(fsDb, col));
      nodeReport.rtdbCountAfter = fsSnapAfter.size;

      if (nodeReport.firestoreCount !== nodeReport.rtdbCountAfter) {
        nodeReport.verified = false;
      }

    } catch (e: any) {
      nodeReport.verified = false;
      nodeReport.errors.push(e.message);
      totalErrors++;
    }
    
    nodeReports.push(nodeReport);
    index++;
  }

  onProgress?.('Đang đối soát dữ liệu (Verification)...', 95);
  
  const verificationPassed = totalErrors === 0 && nodeReports.every(n => n.verified);
  const verificationRate = verificationPassed ? '100%' : 'CẢNH BÁO';

  onProgress?.('Hoàn tất Migration!', 100);

  return {
    timestamp: new Date().toLocaleString(),
    totalFirestoreRecords: totalRtdbRecords,
    totalMigratedRecords,
    totalErrors,
    verificationPassed,
    verificationRate,
    nodeReports
  };
};
`;

fs.writeFileSync(path, content);
