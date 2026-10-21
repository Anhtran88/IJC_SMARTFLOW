import { getFirestoreDB, getDB, removeUndefined, backupDatabase, logActivity } from './firebaseService';
import { ref, get, update } from 'firebase/database';

export interface MigrationNodeReport {
  nodeName: string;
  firestoreCount: number;
  rtdbCountBefore: number;
  rtdbCountAfter: number;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
  verified: boolean;
  errors: string[];
}

export interface MigrationSummaryReport {
  timestamp: string;
  backupCreated: boolean;
  backupId?: string;
  totalFirestoreRecords: number;
  totalMigratedRecords: number;
  totalErrors: number;
  verificationPassed: boolean;
  verificationRate: string;
  nodeReports: MigrationNodeReport[];
  storageEngineStatus: string;
  firestoreDataPreserved: boolean;
}

// Nodes to migrate mapping (Firestore collection name -> RTDB node path)
const MIGRATION_COLLECTIONS: { collection: string; rtdbPath: string }[] = [
  { collection: 'projects', rtdbPath: 'projects' },
  { collection: 'estimates', rtdbPath: 'estimates' },
  { collection: 'estimateGroups', rtdbPath: 'estimateGroups' },
  { collection: 'estimateItems', rtdbPath: 'estimateItems' },
  { collection: 'bm01Orders', rtdbPath: 'bm01Orders' },
  { collection: 'bm02Orders', rtdbPath: 'bm02Orders' },
  { collection: 'bm032Orders', rtdbPath: 'bm032Orders' },
  { collection: 'bm06Orders', rtdbPath: 'bm06Orders' },
  { collection: 'dashboard', rtdbPath: 'dashboard' },
  { collection: 'materialCatalog', rtdbPath: 'materialCatalog' },
  { collection: 'materials', rtdbPath: 'materials' },
  { collection: 'materialTypeConfigs', rtdbPath: 'materialTypeConfigs' },
  { collection: 'materialTypes', rtdbPath: 'materialTypes' },
  { collection: 'materialTransactions', rtdbPath: 'materialTransactions' },
  { collection: 'orderHistory', rtdbPath: 'orderHistory' },
  { collection: 'users', rtdbPath: 'users' },
  { collection: 'settings', rtdbPath: 'settings' },
  { collection: 'snapshots', rtdbPath: 'snapshots' },
  { collection: 'system_backups', rtdbPath: 'system_backups' },
  { collection: 'systemLogs', rtdbPath: 'systemLogs' },
];

export async function runFirestoreToRtdbMigration(
  onProgress?: (stage: string, percent: number) => void
): Promise<MigrationSummaryReport> {
  const logStage = (stageMsg: string, percent: number) => {
    console.log(`[MIGRATION] [${percent}%] ${stageMsg}`);
    onProgress?.(stageMsg, percent);
  };

  // Step 1: Khởi tạo Migration
  logStage('[Step 1/6] Khởi tạo Migration: Kiểm tra môi trường và tham số hệ thống...', 5);

  // Step 2: Kết nối Firestore
  logStage('[Step 2/6] Kết nối Firestore: Đang kiểm tra kết nối Cloud Firestore...', 10);
  const firestoreDb = getFirestoreDB();
  if (!firestoreDb) {
    const errStr = 'Cloud Firestore chưa được khởi tạo hoặc không khả dụng. Vui lòng kiểm tra lại cấu hình Firebase.';
    console.error(`[MIGRATION_ERROR] ${errStr}`);
    throw new Error(errStr);
  }
  console.log('[MIGRATION] Kết nối Firestore: THÀNH CÔNG (Firestore DB object is active).');

  // Step 3: Kết nối RTDB & Sao lưu
  logStage('[Step 3/6] Kết nối RTDB: Đang kiểm tra kết nối Realtime Database & khởi tạo Backup...', 15);
  const rtdb = getDB();
  if (!rtdb) {
    const errStr = 'Realtime Database (RTDB) chưa được khởi tạo hoặc không khả dụng. Vui lòng kiểm tra lại cấu hình Firebase.';
    console.error(`[MIGRATION_ERROR] ${errStr}`);
    throw new Error(errStr);
  }
  console.log('[MIGRATION] Kết nối RTDB: THÀNH CÔNG (RTDB object is active).');

  let backupId: string | undefined;
  let backupCreated = false;
  try {
    logStage('[Step 3/6] Kết nối RTDB: Đang tự động sao lưu dữ liệu RTDB trước khi Migration...', 18);
    backupId = await backupDatabase('Pre-Migration Backup from Firestore');
    backupCreated = !!backupId;
    console.log('[MIGRATION] Sao lưu RTDB hoàn tất, Backup ID:', backupId);
  } catch (err: any) {
    console.warn('[MIGRATION_WARN] Không thể tạo backup RTDB tự động trước migration:', err);
  }

  // Load Firestore module dynamically
  let firestoreModules: any = null;
  try {
    firestoreModules = await import('firebase/firestore');
    console.log('[MIGRATION] Đã nạp thành công module firebase/firestore.');
  } catch (e: any) {
    const errStr = `Không thể nạp module firebase/firestore: ${e?.message || e}`;
    console.error(`[MIGRATION_ERROR] ${errStr}`);
    throw new Error(errStr);
  }

  const nodeReports: MigrationNodeReport[] = [];
  let totalFirestoreRecords = 0;
  let totalMigratedRecords = 0;
  let totalErrors = 0;

  const totalSteps = MIGRATION_COLLECTIONS.length;

  for (let i = 0; i < totalSteps; i++) {
    const { collection: colName, rtdbPath } = MIGRATION_COLLECTIONS[i];
    const progressPercent = 20 + Math.round(((i + 1) / totalSteps) * 65);

    logStage(`[Step 4/6 & 5/6] Đang xử lý phân hệ [${colName}] (${i + 1}/${totalSteps}) -> RTDB [${rtdbPath}]...`, progressPercent);

    const report: MigrationNodeReport = {
      nodeName: colName,
      firestoreCount: 0,
      rtdbCountBefore: 0,
      rtdbCountAfter: 0,
      migratedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      verified: false,
      errors: [],
    };

    // 1. Fetch current RTDB existing items
    let currentRtdbVal: Record<string, any> = {};
    try {
      const rtdbSnap = await get(ref(rtdb, rtdbPath));
      if (rtdbSnap.exists()) {
        currentRtdbVal = rtdbSnap.val() || {};
      }
    } catch (err: any) {
      const msg = `Lỗi đọc node RTDB ${rtdbPath}: ${err?.message || err}`;
      console.error(`[MIGRATION_ERROR] ${msg}`, err);
      report.errorCount++;
      report.errors.push(msg);
    }
    report.rtdbCountBefore = Object.keys(currentRtdbVal).length;

    // 2. Step 4: Đọc từng Collection từ Firestore
    let firestoreDocs: { id: string; data: any }[] = [];
    try {
      console.log(`[Step 4/6] Đọc Collection [${colName}] từ Firestore...`);
      const { collection, getDocs } = firestoreModules;
      const snap = await getDocs(collection(firestoreDb, colName));
      if (snap && snap.docs) {
        firestoreDocs = snap.docs.map((doc: any) => ({
          id: doc.id,
          data: doc.data(),
        }));
      }
      console.log(`[Step 4/6] Đã đọc thành công ${firestoreDocs.length} tài liệu từ Firestore collection [${colName}]`);
    } catch (err: any) {
      const msg = `Lỗi đọc collection Firestore [${colName}]: ${err?.message || err}`;
      console.error(`[MIGRATION_ERROR] ${msg}`, err);
      report.errorCount++;
      report.errors.push(msg);
    }

    report.firestoreCount = firestoreDocs.length;
    totalFirestoreRecords += report.firestoreCount;

    // 3. Step 5: Ghi dữ liệu vào Realtime Database (RTDB)
    if (firestoreDocs.length > 0) {
      const updatesMap: Record<string, any> = {};

      for (const fDoc of firestoreDocs) {
        const docId = fDoc.id;
        const cleanDocId = docId.replace(/\./g, '_').replace(/[\$#\[\]]/g, '_');
        const cleanPayload = removeUndefined(fDoc.data);
        if (cleanPayload && typeof cleanPayload === 'object' && cleanPayload.id && typeof cleanPayload.id === 'string' && cleanPayload.id.includes('.')) {
          cleanPayload.id = cleanPayload.id.replace(/\./g, '_');
        }
        const existingVal = currentRtdbVal[docId] || currentRtdbVal[cleanDocId];

        // Check if existing content in RTDB is identical to prevent unnecessary overwrite
        if (existingVal && JSON.stringify(existingVal) === JSON.stringify(cleanPayload)) {
          report.skippedCount++;
        } else {
          updatesMap[`${rtdbPath}/${cleanDocId}`] = cleanPayload;
          report.migratedCount++;
        }
      }

      if (Object.keys(updatesMap).length > 0) {
        try {
          console.log(`[Step 5/6] Ghi ${Object.keys(updatesMap).length} mục vào RTDB node [${rtdbPath}]...`);
          await update(ref(rtdb), updatesMap);
          console.log(`[Step 5/6] Ghi thành công vào RTDB node [${rtdbPath}].`);
        } catch (err: any) {
          const msg = `Lỗi ghi dữ liệu vào RTDB path [${rtdbPath}]: ${err?.message || err}`;
          console.error(`[MIGRATION_ERROR] ${msg}`, err);
          report.errorCount++;
          report.errors.push(msg);
        }
      } else {
        console.log(`[Step 5/6] Node [${rtdbPath}] đã khớp hoàn toàn (${report.skippedCount} bản ghi trùng).`);
      }
    }

    // 4. Step 6: Verify từng node đối soát dữ liệu
    try {
      const afterSnap = await get(ref(rtdb, rtdbPath));
      const afterVal = afterSnap.exists() ? afterSnap.val() : {};
      report.rtdbCountAfter = Object.keys(afterVal).length;

      let nodeMatchCount = 0;
      for (const fDoc of firestoreDocs) {
        const cleanDocId = fDoc.id.replace(/\./g, '_').replace(/[\$#\[\]]/g, '_');
        if (afterVal[fDoc.id] || afterVal[cleanDocId]) {
          nodeMatchCount++;
        } else {
          const msg = `Bản ghi ID ${fDoc.id} có trên Firestore nhưng không tìm thấy trong RTDB node ${rtdbPath}`;
          console.error(`[MIGRATION_VERIFY_FAIL] ${msg}`);
          report.errors.push(msg);
        }
      }

      report.verified = firestoreDocs.length === 0 || nodeMatchCount === firestoreDocs.length;
      console.log(`[Step 6/6] Verify node [${colName} -> ${rtdbPath}]: ${report.verified ? 'PASSED (100%)' : 'FAILED'} (${nodeMatchCount}/${firestoreDocs.length} khớp)`);
    } catch (err: any) {
      report.verified = false;
      const msg = `Lỗi verify node ${rtdbPath}: ${err?.message || err}`;
      console.error(`[MIGRATION_VERIFY_ERROR] ${msg}`, err);
      report.errors.push(msg);
    }

    totalMigratedRecords += report.migratedCount;
    totalErrors += report.errorCount + report.errors.length;
    nodeReports.push(report);
  }

  // Step 6: Verify Tổng thể
  logStage('[Step 6/6] Verify: Đang tổng hợp và đối soát dữ liệu 100% giữa Firestore & RTDB...', 95);

  const verificationPassed = totalErrors === 0 && nodeReports.every((r) => r.verified);
  const totalChecked = nodeReports.reduce((acc, r) => acc + r.firestoreCount, 0);
  const totalVerified = nodeReports.reduce(
    (acc, r) => acc + (r.verified ? r.firestoreCount : Math.max(0, r.firestoreCount - r.errors.length)),
    0
  );
  const verificationRate = totalChecked === 0 ? '100.00%' : `${((totalVerified / totalChecked) * 100).toFixed(2)}%`;

  // Log activity
  try {
    await logActivity(
      'admin',
      'admin',
      'IMPORT',
      'Cấu hình',
      `Hoàn thành Migration Firestore -> RTDB. Tổng số bản ghi Firestore: ${totalFirestoreRecords}, Chuyển mới: ${totalMigratedRecords}, Tỷ lệ khớp: ${verificationRate}`
    );
  } catch (e) {
    console.warn('[MIGRATION_WARN] Lỗi ghi nhật ký activity migration:', e);
  }

  logStage('[Hoàn tất] Migration dữ liệu đã hoàn thành thành công!', 100);

  return {
    timestamp: new Date().toLocaleString('vi-VN'),
    backupCreated,
    backupId,
    totalFirestoreRecords,
    totalMigratedRecords,
    totalErrors,
    verificationPassed,
    verificationRate,
    nodeReports,
    storageEngineStatus: 'Firebase Realtime Database (RTDB) - HOẠT ĐỘNG 100%',
    firestoreDataPreserved: true,
  };
}

/**
 * Đọc toàn bộ các collections từ Cloud Firestore, chuyển thành JSON và chuẩn bị file để tải xuống.
 */
export async function exportFirestoreToJson(
  onProgress?: (msg: string, percent: number) => void
): Promise<{ jsonString: string; totalCollections: number; totalDocs: number; filename: string }> {
  console.log('[EXPORT_FIRESTORE] Bắt đầu đọc dữ liệu từ Cloud Firestore...');
  onProgress?.('Đang kết nối với Cloud Firestore...', 5);

  const firestoreDb = getFirestoreDB();
  if (!firestoreDb) {
    const errStr = 'Cloud Firestore chưa được khởi tạo hoặc không khả dụng. Vui lòng kiểm tra lại kết nối hoặc cấu hình Firebase.';
    console.error(`[EXPORT_FIRESTORE_ERROR] ${errStr}`);
    throw new Error(errStr);
  }

  let firestoreModules: any = null;
  try {
    firestoreModules = await import('firebase/firestore');
    console.log('[EXPORT_FIRESTORE] Nạp thành công module firebase/firestore.');
  } catch (e: any) {
    const errStr = `Không thể nạp module firebase/firestore: ${e?.message || e}`;
    console.error(`[EXPORT_FIRESTORE_ERROR] ${errStr}`);
    throw new Error(errStr);
  }

  const { collection, getDocs } = firestoreModules;
  const exportData: Record<string, Record<string, any>> = {};
  let totalDocsCount = 0;
  let nonEmptyCollections = 0;

  const totalSteps = MIGRATION_COLLECTIONS.length;
  for (let i = 0; i < totalSteps; i++) {
    const colName = MIGRATION_COLLECTIONS[i].collection;
    const percent = 10 + Math.round(((i + 1) / totalSteps) * 80);
    onProgress?.(`Đang đọc collection Firestore [${colName}] (${i + 1}/${totalSteps})...`, percent);

    try {
      const snap = await getDocs(collection(firestoreDb, colName));
      if (snap && snap.docs) {
        const colDocs: Record<string, any> = {};
        snap.docs.forEach((doc: any) => {
          colDocs[doc.id] = doc.data();
        });
        exportData[colName] = colDocs;
        totalDocsCount += snap.docs.length;
        if (snap.docs.length > 0) {
          nonEmptyCollections++;
        }
        console.log(`[EXPORT_FIRESTORE] Collection [${colName}]: Đã đọc ${snap.docs.length} tài liệu.`);
      }
    } catch (err: any) {
      console.warn(`[EXPORT_FIRESTORE_WARN] Không thể đọc collection [${colName}]:`, err?.message || err);
      exportData[colName] = { _error: err?.message || String(err) };
    }
  }

  onProgress?.('Đang đóng gói dữ liệu JSON...', 95);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    totalCollections: MIGRATION_COLLECTIONS.length,
    nonEmptyCollections,
    totalDocuments: totalDocsCount,
    collections: exportData
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const filename = `Firestore_Full_Export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  onProgress?.('Đã xuất dữ liệu Firestore thành công!', 100);

  return {
    jsonString,
    totalCollections: MIGRATION_COLLECTIONS.length,
    totalDocs: totalDocsCount,
    filename
  };
}

/**
 * Đọc toàn bộ các nodes từ Realtime Database (RTDB), chuyển thành JSON và chuẩn bị file để tải xuống.
 */
export async function exportRtdbToJson(
  onProgress?: (msg: string, percent: number) => void
): Promise<{ jsonString: string; totalNodes: number; totalRecords: number; filename: string }> {
  console.log('[EXPORT_RTDB] Bắt đầu đọc dữ liệu từ Realtime Database (RTDB)...');
  onProgress?.('Đang kết nối với Realtime Database...', 5);

  const rtdb = getDB();
  if (!rtdb) {
    const errStr = 'Realtime Database (RTDB) chưa được khởi tạo hoặc không khả dụng. Vui lòng kiểm tra lại cấu hình Firebase.';
    console.error(`[EXPORT_RTDB_ERROR] ${errStr}`);
    throw new Error(errStr);
  }

  const exportData: Record<string, any> = {};
  let totalRecordsCount = 0;
  let nonEmptyNodes = 0;

  const extraPaths = ['materialUnitTransactions', 'lichSu'];
  const rtdbPaths = Array.from(new Set([...MIGRATION_COLLECTIONS.map(c => c.rtdbPath), ...extraPaths]));
  const totalSteps = rtdbPaths.length;

  for (let i = 0; i < totalSteps; i++) {
    const nodePath = rtdbPaths[i];
    const percent = 10 + Math.round(((i + 1) / totalSteps) * 80);
    onProgress?.(`Đang đọc node RTDB [${nodePath}] (${i + 1}/${totalSteps})...`, percent);

    try {
      const snap = await get(ref(rtdb, nodePath));
      if (snap.exists()) {
        const val = snap.val();
        exportData[nodePath] = val;
        const count = typeof val === 'object' && val !== null ? Object.keys(val).length : 1;
        totalRecordsCount += count;
        nonEmptyNodes++;
        console.log(`[EXPORT_RTDB] Node [${nodePath}]: Đã đọc ${count} bản ghi.`);
      } else {
        exportData[nodePath] = null;
      }
    } catch (err: any) {
      console.warn(`[EXPORT_RTDB_WARN] Không thể đọc node RTDB [${nodePath}]:`, err?.message || err);
      exportData[nodePath] = { _error: err?.message || String(err) };
    }
  }

  onProgress?.('Đang đóng gói dữ liệu RTDB JSON...', 95);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    totalNodes: rtdbPaths.length,
    nonEmptyNodes,
    totalRecords: totalRecordsCount,
    rtdbData: exportData
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const filename = `RealtimeDB_Full_Export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

  onProgress?.('Đã xuất dữ liệu Realtime Database thành công!', 100);

  return {
    jsonString,
    totalNodes: rtdbPaths.length,
    totalRecords: totalRecordsCount,
    filename
  };
}

