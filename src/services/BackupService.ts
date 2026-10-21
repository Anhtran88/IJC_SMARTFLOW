import { ref, get } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { getDB, getFirestoreDB } from '../lib/firebaseService';

export class BackupService {
  static isDBAvailable(): boolean {
    return !!getDB();
  }

  static async getBackupDetails(backupId: string): Promise<any> {
    // 1. Kiểm tra và tải từ Firestore system_backups (hỗ trợ ghép chunks đầy đủ)
    const fsDb = getFirestoreDB();
    if (fsDb) {
      try {
        const docSnap = await getDoc(doc(fsDb, 'system_backups', backupId));
        if (docSnap.exists()) {
          const bDoc = docSnap.data();
          if (bDoc?.chunks) {
            let fullStr = '';
            for (let c = 0; c < bDoc.chunks; c++) {
              const cSnap = await getDoc(doc(fsDb, `system_backups/${backupId}/chunks`, `chunk_${c}`));
              if (cSnap.exists()) {
                fullStr += cSnap.data().data;
              }
            }
            if (fullStr) {
              return JSON.parse(fullStr);
            }
          } else if (bDoc?.data) {
            return bDoc.data;
          }
        }
      } catch (fsErr) {
        console.warn('Lỗi đọc chi tiết backup từ Firestore:', fsErr);
      }
    }

    // 2. Fallback sang Realtime Database nếu có
    const dbInstance = getDB();
    if (dbInstance) {
      try {
        const snap = await get(ref(dbInstance, `backups/details/${backupId}`));
        if (snap.exists()) {
          return snap.val();
        }
      } catch (rErr) {}
    }

    throw new Error('Không có dữ liệu chi tiết của bản sao lưu này trên Cloud');
  }
}
