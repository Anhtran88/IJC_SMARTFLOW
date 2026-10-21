import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref as rtdbRef, set as rtdbSet, get, child, push, remove, update as rtdbUpdate, onValue, runTransaction } from 'firebase/database';
import { initializeFirestore, getFirestore, writeBatch, doc, collection, query, where, getDocs, deleteDoc, setDoc, getDoc, setLogLevel } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { EstimateItem, EstimateGroup } from '../../types';
import { normalizeProjectName } from './formatUtils';
import { bootstrapFirebaseConfig } from '../bootstrapFirebaseConfig';

let db: any = null;
let firestoreDb: any = null;

// Suppress benign Firestore offline connection retry warnings
try {
  setLogLevel('silent');
} catch (_) {}

if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = function (...args: any[]) {
    const msg = args.map(a => typeof a === 'string' ? a : (a?.message || '')).join(' ');
    if (
      msg.includes('Could not reach Cloud Firestore backend') || 
      msg.includes('Backend didn\'t respond within 10 seconds') ||
      msg.includes('@firebase/firestore')
    ) {
      console.warn('[Firestore Offline Notice]', ...args);
      return;
    }
    origConsoleError.apply(console, args);
  };
}

export const initFirebase = (config: any) => {
  try {
    if (!config || !config.apiKey) return false;
    const apps = getApps();
    let app = apps.find(a => a.name === '[DEFAULT]');
    if (!app) {
      app = initializeApp(config);
    }
    db = getDatabase(app);
    const dbId = config.databaseId || config.firestoreDatabaseId;
    const isDefault = !dbId || dbId === '(default)' || dbId === 'default';
    const settings: any = {
      experimentalAutoDetectLongPolling: true,
    };
    if (!firestoreDb) {
      try {
        firestoreDb = isDefault 
          ? initializeFirestore(app, settings) 
          : initializeFirestore(app, settings, dbId);
      } catch (fsErr) {
        firestoreDb = isDefault
          ? getFirestore(app)
          : getFirestore(app, dbId);
      }
    }
    console.log(`Firebase Realtime Database and Firestore (${isDefault ? '(default)' : dbId}) initialized successfully`);
    
    // Auto-seed default admin account
    ensureAdminAccountInDB(db);
    
    return true;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return false;
  }
};

export const getDB = () => {
  if (!db && bootstrapFirebaseConfig && bootstrapFirebaseConfig.apiKey) {
    initFirebase(bootstrapFirebaseConfig);
  }
  return db;
};

export const getFirestoreDB = () => {
  if (typeof window !== 'undefined' && (window as any)._isFirestoreQuotaExceeded) {
    return null;
  }
  if (!firestoreDb && bootstrapFirebaseConfig && bootstrapFirebaseConfig.apiKey) {
    initFirebase(bootstrapFirebaseConfig);
  }
  return firestoreDb;
};

// Auto-initialize with default bootstrap configuration on module load
if (!db && bootstrapFirebaseConfig && bootstrapFirebaseConfig.apiKey) {
  initFirebase(bootstrapFirebaseConfig);
}

// Helper function to remove undefined and NaN values recursively
export const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') {
    return Number.isNaN(obj) ? 0 : obj;
  }
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)).filter(item => item !== undefined);
  }
  
  const newObj: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      const cleaned = removeUndefined(obj[key]);
      if (cleaned !== undefined) {
        newObj[key] = cleaned;
      }
    }
  });
  return newObj;
};

export function sanitizeRTDBPath(pathStr: string): string {
  if (!pathStr) return pathStr;
  return pathStr
    .split('/')
    .map(segment => segment.replace(/\./g, '_').replace(/[\$#\[\]]/g, '_'))
    .join('/');
}

export function safeRef(dbObj: any, pathStr?: string) {
  if (!pathStr) return rtdbRef(dbObj);
  return rtdbRef(dbObj, sanitizeRTDBPath(pathStr));
}

export function safeUpdate(refObj: any, updatesMap: Record<string, any>) {
  if (!updatesMap || typeof updatesMap !== 'object') {
    const cleanMap = removeUndefined(updatesMap);
    return rtdbUpdate(refObj, cleanMap === undefined ? {} : cleanMap);
  }
  const sanitizedMap: Record<string, any> = {};
  for (const k of Object.keys(updatesMap)) {
    const cleanKey = sanitizeRTDBPath(k);
    const cleanedVal = removeUndefined(updatesMap[k]);
    if (cleanedVal !== undefined) {
      sanitizedMap[cleanKey] = cleanedVal;
    }
  }
  return rtdbUpdate(refObj, sanitizedMap);
}

export function safeSet(refObj: any, data: any) {
  const cleanData = removeUndefined(data);
  return rtdbSet(refObj, cleanData === undefined ? null : cleanData);
}

export const ref = safeRef;
export const update = safeUpdate;
export const set = safeSet;
export { get, onValue };

// Unified validator to filter out temporary, placeholder, and invalid materials
export function isValidEstimateItem(item: any): boolean {
  if (!item) return false;
  
  const isTemp = item.isTemporary === true || item.isVirtual === true || item.status === "TEMP";
  if (isTemp) return false;

  const nameStr = (item.name || item.itemName || "").trim();
  if (!nameStr) return false;
  if (nameStr.startsWith("Vật tư khởi tạo")) return false;
  
  const unitStr = (item.unit || "").trim();
  if (!unitStr) return false;

  // Project-shared, shared-cost, grouped estimate items or PDF/OCR items are always valid as long as they have a name and unit
  if (
    item.sourceType === 'PDF' || 
    (item.id && String(item.id).includes('-ocr-')) ||
    item.isProjectShared === true || 
    item.isSharedCost === true || 
    item.isGroupedEstimate === true || 
    !!item.groupId || 
    item.unitId === 'PROJECT_SHARED' || 
    item.sourceType === 'PROJECT_COST' || 
    item.sourceType === 'PROJECT_SHARED_DISTRIBUTED' ||
    item.createdFrom === 'PROJECT_COST'
  ) {
    return true;
  }
  
  const qtyVal = item.estimatedQty !== undefined ? item.estimatedQty : (item.orderQty !== undefined ? item.orderQty : item.quantity);
  const qty = Number(qtyVal) || 0;
  if (qty <= 0) return false;

  const notesStr = (item.notes || item.note || "").trim();
  if (notesStr === "Tự động khởi tạo từ BM06") return false;

  return true;
}

// Helper to safely encode keys for RTDB (cannot contain ".", "#", "$", "/", "[", or "]")
export const encodeRTDBKey = (key: string): string => {
  return key
    .replace(/%/g, '%25')
    .replace(/\./g, '%2E')
    .replace(/#/g, '%23')
    .replace(/\$/g, '%24')
    .replace(/\//g, '%2F')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
};

// Helper to safely decode keys from RTDB
export const decodeRTDBKey = (key: string): string => {
  return key
    .replace(/%5D/g, ']')
    .replace(/%5B/g, '[')
    .replace(/%2F/g, '/')
    .replace(/%24/g, '$')
    .replace(/%23/g, '#')
    .replace(/%2E/g, '.')
    .replace(/%25/g, '%');
};

// Các hàm thao tác dữ liệu
export const firebaseAPI = {
  saveCauHinh: async (loaiVatTu: string, data: any) => {
    if (!db) return null;
    try {
      await set(ref(db, `cauHinh/${loaiVatTu}`), removeUndefined(data));
      return true;
    } catch (e) {
      console.error('saveCauHinh failed:', e);
      return null;
    }
  },

  getCauHinh: async (loaiVatTu: string) => {
    if (!db) return null;
    try {
      const snapshot = await get(ref(db, `cauHinh/${loaiVatTu}`));
      if (snapshot.exists()) return snapshot.val();
      return null;
    } catch (e) {
      console.error('getCauHinh failed:', e);
      return null;
    }
  },

  saveDonHang: async (loaiVatTu: string, data: any) => {
    const fsDb = getFirestoreDB();
    if (!fsDb) return null;
    try {
      const id = data.id || generateUUID();
      const record = removeUndefined({ ...data, id, updatedAt: Date.now() });
      record.loaiVatTu = loaiVatTu;
      await setDoc(doc(fsDb, 'lichSu', id), record, { merge: true });
      return record;
    } catch (e) {
      console.error('saveDonHang failed:', e);
      return null;
    }
  },
  fetchLichSu: async (loaiVatTu: string) => {
    const fsDb = getFirestoreDB();
    if (!fsDb) return [];
    try {
      const snapshot = await getDocs(query(collection(fsDb, 'lichSu'), where('loaiVatTu', '==', loaiVatTu)));
      const records: any[] = [];
      snapshot.forEach(docSnap => records.push({ ...docSnap.data(), id: docSnap.id }));
      return records.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    } catch (e) {
      console.error('fetchLichSu failed:', e);
      return [];
    }
  },

  deleteDonHang: async (loaiVatTu: string, id: string) => {
    const fsDb = getFirestoreDB();
    if (!fsDb) return null;
    try {
      await deleteDoc(doc(fsDb, 'lichSu', id));
      return true;
    } catch (e) {
      console.error('deleteDonHang failed:', e);
      return null;
    }
  },

  // Vật tư và Giá
  saveMaterialPrices: async (loaiVatTu: string, prices: any) => {
    if (!db) return null;
    try {
      await set(ref(db, `materialPrices/${loaiVatTu}`), prices);
      return true;
    } catch (e) {
      console.error('saveMaterialPrices failed:', e);
      return null;
    }
  },

  loadMaterialPrices: async (loaiVatTu: string) => {
    if (!db) return null;
    try {
      const snapshot = await get(ref(db, `materialPrices/${loaiVatTu}`));
      if (snapshot.exists()) return snapshot.val();
      return null;
    } catch (e) {
      return null;
    }
  },

  savePriceDateOptions: async (loaiVatTu: string, options: any) => {
    if (!db) return null;
    try {
       await set(ref(db, `priceDateOptions/${loaiVatTu}`), options);
       return true;
    } catch(e) {
      return null;
    }
  },

  loadPriceDateOptions: async (loaiVatTu: string) => {
     if (!db) return null;
     try {
       const snapshot = await get(ref(db, `priceDateOptions/${loaiVatTu}`));
       if (snapshot.exists()) return snapshot.val();
       return null;
     } catch(e) {
       return null;
     }
  }
};

// ============================================
// FIRESTORE HARDENED ERROR HANDLING & HELPERS
// ============================================
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const auth = getAuth();
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';
  const isQuotaExceeded = errCode === 'resource-exhausted' || errMsg.includes('resource-exhausted') || errMsg.includes('Quota exceeded');
  const isUnavailable = errCode === 'unavailable' || errCode === 'failed-precondition' || errCode === 'deadline-exceeded' || errMsg.includes('unavailable') || errMsg.includes('Could not reach Cloud Firestore') || errMsg.includes('offline');

  if (isQuotaExceeded || isUnavailable) {
    if (typeof window !== 'undefined') {
      (window as any)._isFirestoreQuotaExceeded = true;
      console.warn(`[Firestore ${isQuotaExceeded ? 'Quota Exceeded' : 'Unavailable'}] Operation '${operationType}' on '${path}': ${errMsg}. System switching to Realtime Database & Local Storage mode.`);
      window.dispatchEvent(new CustomEvent('firestoreQuotaExceeded', { detail: { path, operationType, error: errMsg } }));
    }
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Non-fatal Operation Warning: ', JSON.stringify(errInfo));
}

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// ============================================
// ESTIMATE ITEMS REALTIME DATABASE OPERATIONS
// ============================================
export const saveEstimateItems = async (projectId: string, unitId: string, items: EstimateItem[]): Promise<string[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  const savedIds: string[] = [];
  try {
    for (const item of items) {
      const itemId = item.id || generateUUID();
      const enrichedItem = { ...item, id: itemId, projectId, unitId, createdAt: item.createdAt || Date.now(), updatedAt: Date.now() };
      await setDoc(doc(fsDb, 'estimateItems', itemId), removeUndefined(enrichedItem), { merge: true });
      savedIds.push(itemId);
    }
    return savedIds;
  } catch (error: any) {
    console.error('Realtime DB saveEstimateItems error:', error);
    throw new Error(error.message || String(error));
  }
};

export const getEstimateItems = async (projectId: string, unitId: string): Promise<EstimateItem[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    const snapshot = await getDocs(collection(fsDb, 'estimateItems'));
    const items: EstimateItem[] = [];
    snapshot.forEach((docSnap) => {
      const item = docSnap.data() as EstimateItem;
      if (item && item.projectId === projectId && item.unitId === unitId) {
        items.push({ ...item, id: docSnap.id });
      }
    });
    return items.sort((a, b) => {
      const codeA = (a.code || '').toLowerCase();
      const codeB = (b.code || '').toLowerCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  } catch (error: any) {
    console.error('Realtime DB getEstimateItems error:', error);
    throw new Error(error.message || String(error));
  }
};

export const updateEstimateItem = async (itemId: string, updates: Partial<EstimateItem>): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    const sanitizedUpdates = removeUndefined({ ...updates, updatedAt: Date.now() });
    await setDoc(doc(fsDb, 'estimateItems', itemId), sanitizedUpdates, { merge: true });
  } catch (error: any) {
    console.error('Realtime DB updateEstimateItem error:', error);
    throw new Error(error.message || String(error));
  }
};

export const deleteEstimateItem = async (itemId: string): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    await deleteDoc(doc(fsDb, 'estimateItems', itemId));
  } catch (error: any) {
    console.error('Realtime DB deleteEstimateItem error:', error);
    throw new Error(error.message || String(error));
  }
};

// ============================================
// MATERIAL CONTENT CONFIGURATION OPERATIONS
// ============================================

export const saveMaterialTypeConfig = async (materialTypeId: string, config: any): Promise<boolean> => {
  const cleanId = materialTypeId.trim();
  if (!cleanId) {
    throw new Error('ID loại vật tư không được để trống.');
  }

  try {
    const fixedSenderComp = config.bm032?.senderCompany || config.pkg_tenBenGiao || config.bm032?.bbnt_benA_congTy || config.bbnt_benA_congTy || '';
    const firstSenderRep = config.bm032?.senderRepresentatives?.[0];
    const sanitizedPayload = removeUndefined({
      ...config,
      bbnt_benA_congTy: fixedSenderComp,
      pkg_tenBenGiao: fixedSenderComp,
      pkg_benGiao_ds: config.bm032?.senderRepresentatives ? JSON.stringify(config.bm032.senderRepresentatives) : config.pkg_benGiao_ds,
      pkg_benGiaoTen: firstSenderRep?.name || config.pkg_benGiaoTen || config.bbnt_benA_daiDien || '',
      pkg_benGiaoChucVu: firstSenderRep?.position || config.pkg_benGiaoChucVu || '',
      bbnt_benA_daiDien: firstSenderRep?.name || config.bbnt_benA_daiDien || config.pkg_benGiaoTen || '',
      bbnt_benB_congTy: config.bm032?.receiverCompany || config.bm032?.bbnt_benB_congTy || config.bbnt_benB_congTy || 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
      pkg_benNhan_ds: config.bm032?.receiverRepresentatives ? JSON.stringify(config.bm032.receiverRepresentatives) : config.pkg_benNhan_ds,
      materialTypeId: cleanId,
      updatedAt: Date.now()
    });

    // 1. Save to Realtime Database under cauHinh/${cleanId}
    if (db) {
      const rtdbRef = ref(db, `cauHinh/${cleanId}`);
      const snapshot = await get(rtdbRef);
      const existing = snapshot.exists() ? snapshot.val() : {};
      const merged = {
        ...existing,
        ...sanitizedPayload
      };
      await set(rtdbRef, removeUndefined(merged));
    }


    console.log(`Saved material content config for ${cleanId} to RTDB & Firestore successfully.`, sanitizedPayload);
    return true;
  } catch (error: any) {
    console.error('saveMaterialTypeConfig failed:', error);
    if (firestoreDb) {
      handleFirestoreError(error, OperationType.WRITE, `materialTypeConfigs/${cleanId}`);
    }
    return false;
  }
};

export const getMaterialTypeConfig = async (materialTypeId: string): Promise<any | null> => {
  const cleanId = materialTypeId.trim();
  if (!cleanId) return null;

  try {
    // 1. Try to load from Realtime Database first
    if (db) {
      const snapshot = await get(ref(db, `cauHinh/${cleanId}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (data && typeof data === 'object') {
          return data;
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error('getMaterialTypeConfig failed:', error);
    if (firestoreDb) {
      handleFirestoreError(error, OperationType.GET, `materialTypeConfigs/${cleanId}`);
    }
    return null;
  }
};

export const getAllMaterialTypeConfigs = async (): Promise<any[]> => {
  if (!db) return [];
  try {
    const snapshot = await get(ref(db, 'cauHinh'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.keys(data).map(k => ({ ...data[k], materialTypeId: k }));
    }
    return [];
  } catch (error: any) {
    console.error('getAllMaterialTypeConfigs failed:', error);
    return [];
  }
};

export const deleteMaterialTypeConfig = async (materialTypeId: string): Promise<boolean> => {
  if (!db) return false;
  const cleanId = materialTypeId.trim();
  if (!cleanId) return false;
  try {
    await remove(ref(db, `cauHinh/${cleanId}`));
    return true;
  } catch (error: any) {
    console.error('deleteMaterialTypeConfig failed:', error);
    return false;
  }
};

// ============================================
// DATABASE RESET, BACKUP & RESTORE OPERATIONS
// ============================================

export function formatBackupDate(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${dd}.${mm}.${yyyy}_${hh}.${min}.${ss}`;
}

export const parseBackupTimestamp = (b: any): number => {
  if (!b) return 0;
  if (typeof b.createdAt === 'number' && !isNaN(b.createdAt) && b.createdAt > 0) {
    return b.createdAt;
  }
  if (typeof b.timestamp === 'number' && !isNaN(b.timestamp) && b.timestamp > 0) {
    return b.timestamp;
  }
  if (b.createdAt) {
    const t = new Date(b.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (b.timestamp) {
    const t = new Date(b.timestamp).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const idStr = String(b.backupId || b.id || b.backupName || '');
  const match = idStr.match(/(\d{10,13})/);
  if (match) {
    const num = Number(match[1]);
    if (num > 1000000000) return num < 10000000000 ? num * 1000 : num;
  }
  return 0;
};

export const listBackups = async () => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }
  try {
    const fsDb = getFirestoreDB();
    if (!fsDb || (typeof window !== 'undefined' && (window as any)._isFirestoreQuotaExceeded)) return [];
    const colRef = collection(fsDb, 'system_backups');
    const qSnap = await getDocs(colRef);
    const backups: any[] = [];
    qSnap.forEach(d => {
      const b = d.data();
      if (b) {
        const docId = d.id;
        const backupId = b.backupId || b.id || docId;
        const timestamp = parseBackupTimestamp(b);
        backups.push({
          ...b,
          docId,
          backupId,
          createdAt: timestamp,
          timestamp
        });
      }
    });
    return backups.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota exceeded')) {
      if (typeof window !== 'undefined') (window as any)._isFirestoreQuotaExceeded = true;
      console.warn('Lỗi Firestore quota khi lấy danh sách bản sao lưu:', err);
      return [];
    }
    console.error('Lỗi khi lấy danh sách bản sao lưu:', err);
    return [];
  }
};

export function identifyBackupDuplicates(backups: any[]): { primaryIds: Set<string>; duplicateIds: Set<string> } {
  const primaryIds = new Set<string>();
  const duplicateIds = new Set<string>();
  
  if (!backups || backups.length === 0) {
    return { primaryIds, duplicateIds };
  }

  // Filter auto or pre_restore_safety backups
  const autoBackups = backups.filter(b => b.backupType === 'auto' || b.backupType === 'pre_restore_safety');
  const grouped: any[][] = [];
  
  autoBackups.forEach(b => {
    const bTime = parseBackupTimestamp(b);
    const bKey = b.backupKey;
    
    let foundGroup = false;
    for (const group of grouped) {
      const firstInGroup = group[0];
      const gTime = parseBackupTimestamp(firstInGroup);
      const gKey = firstInGroup.backupKey;
      
      let isMatch = false;
      if (bKey && gKey) {
        isMatch = (bKey === gKey);
      } else {
        // Fallback for old backups: same type and within 5 minutes (300,000ms)
        isMatch = (b.backupType === firstInGroup.backupType && Math.abs(bTime - gTime) <= 5 * 60 * 1000);
      }
      
      if (isMatch) {
        group.push(b);
        foundGroup = true;
        break;
      }
    }
    
    if (!foundGroup) {
      grouped.push([b]);
    }
  });
  
  grouped.forEach(group => {
    // Keep the newest as primary, mark others as duplicates
    group.sort((a, b) => parseBackupTimestamp(b) - parseBackupTimestamp(a));
    primaryIds.add(group[0].backupId);
    for (let i = 1; i < group.length; i++) {
      duplicateIds.add(group[i].backupId);
    }
  });
  
  return { primaryIds, duplicateIds };
}

let isRetentionRunning = false;

/**
 * Tự động xoay vòng và áp dụng giới hạn số lượng bản sao lưu Cloud (Rolling Backup)
 * - Áp dụng cho MỌI nguồn tạo backup (tự động và thủ công)
 * - Giữ lại đúng N bản mới nhất theo timestamp thực tế
 * - Xóa sạch cả document metadata và toàn bộ chunks subcollection của các bản cũ vượt quá giới hạn
 * - Tuyệt đối không xóa nhầm bản vừa tạo (newlyCreatedBackupId)
 */
export const enforceCloudBackupRetention = async (
  keepLastCount?: number, 
  newlyCreatedBackupId?: string
): Promise<{ deletedCount: number; remainingCount: number }> => {
  const fsDb = getFirestoreDB();
  if (!fsDb || (typeof window !== 'undefined' && (window as any)._isFirestoreQuotaExceeded)) {
    return { deletedCount: 0, remainingCount: 0 };
  }

  if (isRetentionRunning) {
    console.log('[Retention] Quá trình xoay vòng sao lưu đang chạy, bỏ qua gọi trùng lặp.');
    return { deletedCount: 0, remainingCount: 0 };
  }
  isRetentionRunning = true;

  try {
    let limit = keepLastCount;
    if (typeof limit !== 'number' || isNaN(limit) || limit <= 0) {
      const rtdb = getDB();
      if (rtdb) {
        try {
          const schedSnap = await get(ref(rtdb, 'systemConfig/backupSchedule'));
          if (schedSnap.exists() && schedSnap.val()?.keepLast) {
            limit = Number(schedSnap.val().keepLast);
          }
        } catch (sErr) {
          console.warn('Lỗi đọc keepLast từ RTDB:', sErr);
        }
      }
    }
    limit = Math.max(1, limit || 10);

    const colRef = collection(fsDb, 'system_backups');
    const qSnap = await getDocs(colRef);
    const allBackups: any[] = [];

    qSnap.forEach(d => {
      const b = d.data();
      if (b) {
        const docId = d.id;
        const backupId = b.backupId || b.id || docId;
        const timestamp = parseBackupTimestamp(b);
        allBackups.push({
          ...b,
          docId,
          backupId,
          createdAt: timestamp,
          timestamp,
          chunks: b.chunks || 0
        });
      }
    });

    // Sắp xếp giảm dần theo timestamp (bản ghi mới nhất đứng đầu danh sách)
    allBackups.sort((a, b) => b.timestamp - a.timestamp);

    if (allBackups.length <= limit) {
      return { deletedCount: 0, remainingCount: allBackups.length };
    }

    // Giữ lại N bản mới nhất (chỉ số 0 đến limit - 1)
    const keepList = allBackups.slice(0, limit);
    const keepDocIds = new Set(keepList.map(item => item.docId));
    if (newlyCreatedBackupId) {
      keepDocIds.add(newlyCreatedBackupId);
    }

    // Các bản cũ nhất vượt quá giới hạn N sẽ được xóa
    const deleteCandidates = allBackups.filter(
      item => !keepDocIds.has(item.docId) && item.backupId !== newlyCreatedBackupId
    );

    let deletedCount = 0;
    for (const bDel of deleteCandidates) {
      try {
        const targetId = bDel.docId;
        // 1. Xóa toàn bộ documents trong subcollection chunks
        try {
          const chunksCol = collection(fsDb, `system_backups/${targetId}/chunks`);
          const chunksSnap = await getDocs(chunksCol);
          for (const cDoc of chunksSnap.docs) {
            await deleteDoc(cDoc.ref);
          }
        } catch (cSnapErr) {
          // Fallback nếu subcollection query không thành công
          if (bDel.chunks) {
            for (let c = 0; c < bDel.chunks; c++) {
              try {
                await deleteDoc(doc(fsDb, `system_backups/${targetId}/chunks`, `chunk_${c}`));
              } catch (e) {}
            }
          }
        }

        // 2. Xóa metadata document chính trên Firestore
        await deleteDoc(doc(fsDb, 'system_backups', targetId));
        deletedCount++;
        console.log(`[Retention] Đã xóa bản sao lưu cũ vượt giới hạn (${limit}): ${bDel.backupName || targetId}`);
      } catch (delErr) {
        console.warn(`[Retention] Lỗi khi xóa bản sao lưu ${bDel.docId}:`, delErr);
      }
    }

    const remainingCount = allBackups.length - deletedCount;
    console.log(`[Retention] Hoàn tất xoay vòng sao lưu: Đã xóa ${deletedCount} bản cũ, còn lại ${remainingCount} bản (giới hạn: ${limit}).`);
    return { deletedCount, remainingCount };
  } catch (rotErr) {
    console.warn('Lỗi khi thực thi quy tắc lưu giữ (retention) bản backup:', rotErr);
    return { deletedCount: 0, remainingCount: 0 };
  } finally {
    isRetentionRunning = false;
  }
};

export const enforceAutoBackupRetention = enforceCloudBackupRetention;

export const backupDatabase = async (
  note: string = 'Sao lưu hệ thống',
  backupType: 'manual' | 'auto' | 'pre_restore_safety' = 'manual',
  createdBy: string = 'System',
  scheduleType?: 'daily' | 'weekly' | 'monthly'
) => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }

  let finalType = backupType;
  if (note && note.includes('PRE_RESTORE_SAFETY_')) {
    finalType = 'pre_restore_safety';
  } else if (note && note.includes('AUTO_BACKUP_')) {
    finalType = 'auto';
  }

  try {
    const timestamp = Date.now();
    const dateStr = formatBackupDate(new Date(timestamp));

    let backupKey = '';
    if (finalType !== 'manual') {
      const pad = (num: number) => String(num).padStart(2, '0');
      const d = new Date(timestamp);
      const dd = pad(d.getDate());
      const mm = pad(d.getMonth() + 1);
      const yyyy = d.getFullYear();
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      backupKey = `${dd}.${mm}.${yyyy}_${hh}.${min}_${finalType}`;
    }

    if (backupKey && firestoreDb) {
      try {
        // 1. Check if a backup with this backupKey already exists on Firestore
        const colRef = collection(firestoreDb, 'system_backups');
        const q = query(colRef, where('backupKey', '==', backupKey));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          console.log(`[Backup Check] Bản sao lưu tự động với key [${backupKey}] đã tồn tại trên Cloud. Không tạo thêm.`);
          const existingDoc = querySnap.docs[0].data();
          
          try {
            const chunksRef = collection(firestoreDb, `system_backups/${existingDoc.backupId}/chunks`);
            const chunksSnap = await getDocs(chunksRef);
            const sortedChunks = chunksSnap.docs
              .map(docD => docD.data())
              .sort((a, b) => (a.index || 0) - (b.index || 0));
            const fullPayloadStr = sortedChunks.map(c => c.data).join('');
            if (fullPayloadStr) {
              return JSON.parse(fullPayloadStr);
            }
          } catch (chunkErr) {
            console.warn("Lỗi khi tải chunks của bản sao lưu cũ:", chunkErr);
          }
          
          return {
            id: existingDoc.backupId,
            timestamp: existingDoc.createdAt,
            rtdb: {},
            firestore: {},
            skipped: true,
            reason: 'duplicate'
          };
        }
      } catch (checkErr) {
        console.warn("Lỗi kiểm tra trùng lặp backup trên Firestore:", checkErr);
      }

      // 2. Distributed Lock on Realtime Database to prevent multiple tabs/devices from running at the same time
      try {
        const lockRef = ref(db, `locks/backup_${backupKey}`);
        const result = await runTransaction(lockRef, (currentData) => {
          if (currentData === null) {
            return { locked: true, timestamp: Date.now() };
          }
          return; // Abort transaction if lock exists
        });

        if (!result.committed) {
          console.warn(`[Lock Collide] Một thiết bị hoặc tab khác đang/đã thực hiện sao lưu tự động [${backupKey}]. Bỏ qua.`);
          // Wait 2 seconds and check Firestore again to see if the other device has finished uploading
          await new Promise(resolve => setTimeout(resolve, 2000));
          const colRef = collection(firestoreDb, 'system_backups');
          const q = query(colRef, where('backupKey', '==', backupKey));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            const existingDoc = querySnap.docs[0].data();
            try {
              const chunksRef = collection(firestoreDb, `system_backups/${existingDoc.backupId}/chunks`);
              const chunksSnap = await getDocs(chunksRef);
              const sortedChunks = chunksSnap.docs
                .map(docD => docD.data())
                .sort((a, b) => (a.index || 0) - (b.index || 0));
              const fullPayloadStr = sortedChunks.map(c => c.data).join('');
              if (fullPayloadStr) {
                return JSON.parse(fullPayloadStr);
              }
            } catch (chunkErr) {}
            return {
              id: existingDoc.backupId,
              timestamp: existingDoc.createdAt,
              rtdb: {},
              firestore: {},
              skipped: true,
              reason: 'duplicate'
            };
          }
          
          return {
            id: `bk_skipped_${timestamp}`,
            timestamp,
            rtdb: {},
            firestore: {},
            skipped: true,
            reason: 'duplicate'
          };
        }
      } catch (lockErr: any) {
        console.warn("Lỗi xử lý khóa đồng bộ trên RTDB:", lockErr);
      }
    }
    
    let backupName = '';
    if (finalType === 'manual') {
      backupName = `MANUAL_BACKUP_IJC_SmartFlow_${dateStr}.json`;
    } else if (finalType === 'auto') {
      backupName = `AUTO_BACKUP_IJC_SmartFlow_${dateStr}.json`;
    } else if (finalType === 'pre_restore_safety') {
      backupName = `AUTO_PRE_RESTORE_SAFETY_BACKUP_${dateStr}.json`;
    } else {
      backupName = `BACKUP_${dateStr}.json`;
    }

    let backupId = `bk_${timestamp}`;
    if (finalType !== 'manual' && backupKey) {
      backupId = `bk_${backupKey.replace(/\./g, '_')}`;
    }

    // 1. Gather Realtime Database paths (filtered to exclude temporary and invalid items)
    const rtdbPaths = [
      'materialCatalog',
      'estimateGroups',
      'estimateItems',
      'bm06Orders',
      'bm06OrderHistory',
      'materialUnitTransactions',
      'MaterialUnitTransactions',
      'lichSu',
      'materialPrices',
      'priceDateOptions',
      'cauHinh',
      'users',
      'appSettings',
      'themeSettings',
      'reports'
    ];
    
    const rtdbData: any = {};
    for (const path of rtdbPaths) {
      try {
        const snap = await get(ref(db, path));
        if (snap.exists()) {
          let val = snap.val();
          
          if (path === 'estimateItems' && val) {
            const filteredEst: any = {};
            Object.keys(val).forEach(key => {
              const item = val[key];
              if (item && isValidEstimateItem({ ...item, id: key })) {
                filteredEst[key] = item;
              }
            });
            val = filteredEst;
          }
          
          if (path === 'bm06Orders' && val) {
            const filteredOrders: any = {};
            Object.keys(val).forEach(key => {
              const order = val[key];
              if (order) {
                const rawItems = order.selectedItems || order.items || [];
                const cleanItems = rawItems.filter((it: any) => isValidEstimateItem(it));
                filteredOrders[key] = {
                  ...order,
                  selectedItems: cleanItems,
                  items: cleanItems
                };
              }
            });
            val = filteredOrders;
          }

          rtdbData[path] = val;
        } else {
          rtdbData[path] = null;
        }
      } catch (err) {
        console.warn(`Không thể sao lưu path RTDB "${path}":`, err);
        rtdbData[path] = null;
      }
    }

    // 2. Gather Firestore data (filtered to exclude temporary and invalid items)
    const fsData: any = {};
    if (firestoreDb && !(window as any)._isFirestoreQuotaExceeded) {
      const fsCollections = [
        'bm02Orders',
        'bbntOrders',
        'bm032Orders',
        'bm06Orders',
        'estimateGroups',
        'estimateItems',
        'MaterialUnitTransactions',
        'materialUnitTransactions',
        'materialTypeConfigs',
        'materialCatalog',
        'users',
        'roles',
        'appSettings',
        'themeSettings',
        'reports',
        'activityLogs'
      ];
      
      for (const col of fsCollections) {
        try {
          const colSnap = await getDocs(collection(firestoreDb, col));
          const docs: any = {};
          colSnap.forEach(d => {
            let data = d.data();
            
            if (col === 'estimateItems' && data) {
              if (!isValidEstimateItem({ ...data, id: d.id })) {
                return;
              }
            }

            if ((col === 'bm06Orders' || col === 'bm02Orders' || col === 'bm032Orders') && data) {
              const rawItems = data.selectedItems || data.items || [];
              const cleanItems = rawItems.filter((it: any) => isValidEstimateItem(it));
              data = {
                ...data,
                selectedItems: cleanItems,
                items: cleanItems
              };
            }

            docs[encodeRTDBKey(d.id)] = data;
          });
          fsData[col] = docs;
        } catch (e: any) {
          if (e?.code === 'resource-exhausted' || e?.message?.includes('Quota exceeded')) {
            (window as any)._isFirestoreQuotaExceeded = true;
            console.warn(`[Quota Exceeded] Interrupted Firestore backup reads on '${col}': ${e.message}`);
            break;
          }
          console.warn(`Không thể sao lưu collection Firestore "${col}":`, e);
          fsData[col] = null;
        }
      }
    }

    const backupPayload = {
      id: backupId,
      timestamp,
      rtdb: rtdbData,
      firestore: fsData
    };

    const payloadStr = JSON.stringify(backupPayload);
    const dataSize = payloadStr.length;
    const MAX_CHUNK_SIZE = 800000;
    const numChunks = Math.ceil(dataSize / MAX_CHUNK_SIZE);

    const backupDoc = {
      backupId,
      backupName,
      backupType: finalType,
      scheduleType: scheduleType || null,
      createdAt: timestamp,
      createdBy,
      dataSize,
      chunks: numChunks,
      backupKey: backupKey || null
    };

    // Save backup to Firestore
    if (firestoreDb && !(window as any)._isFirestoreQuotaExceeded) {
      try {
        await setDoc(doc(firestoreDb, 'system_backups', backupId), removeUndefined(backupDoc));
        
        // Save data in chunks if needed
        for (let i = 0; i < numChunks; i++) {
          const chunkStr = payloadStr.substring(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
          await setDoc(doc(firestoreDb, `system_backups/${backupId}/chunks`, `chunk_${i}`), { data: chunkStr, index: i });
        }
      } catch (fsWriteErr: any) {
        if (fsWriteErr?.code === 'resource-exhausted' || fsWriteErr?.message?.includes('Quota exceeded')) {
          (window as any)._isFirestoreQuotaExceeded = true;
          console.warn("[Quota Exceeded] Skipped saving backup record to Firestore, backup safely saved in Realtime Database & LocalStorage.");
        } else {
          console.warn("Lỗi lưu metadata backup lên Firestore:", fsWriteErr);
        }
      }
    }

    // Save to latest in RTDB
    await set(ref(db, 'backups/latest'), removeUndefined({
      id: backupId,
      timestamp,
      backupName,
      backupType: finalType,
      createdBy,
      dataSize
    }));

    // LocalStorage fallback
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('latest_firebase_backup', JSON.stringify(backupPayload));
    }

    // Rolling retention rotation for ALL cloud backups (manual, auto, pre_restore_safety)
    // Only executed after the new backup is successfully committed to Cloud
    if (getFirestoreDB() && !(typeof window !== 'undefined' && (window as any)._isFirestoreQuotaExceeded)) {
      try {
        await enforceCloudBackupRetention(undefined, backupId);
      } catch (retErr) {
        console.warn("Lỗi khi chạy retention xoay vòng sau khi tạo backup:", retErr);
      }
    }

    // Log Activity
    try {
      await logActivity(
        createdBy,
        createdBy === 'System' ? 'viewer' : 'admin',
        'EXPORT',
        'Cấu hình',
        `${finalType === 'auto' ? 'Tự động sao lưu' : (finalType === 'pre_restore_safety' ? 'Sao lưu an toàn tự động trước khi restore' : 'Sao lưu thủ công')} hệ thống thành công. Tên: ${backupName}`,
        backupId
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động backup:', logErr);
    }

    return backupPayload;
  } catch (err: any) {
    console.error('Lỗi khi sao lưu database:', err);
    throw new Error(err.message || String(err));
  }
};

export const restoreDatabase = async (customBackupPayload?: any) => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }

  try {
    let performedBy = 'khách';
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      performedBy = currentUser?.username || 'khách';
    } catch (e) {}

    // 1. CRITICAL: Always auto-create a pre_restore_safety backup first!
    try {
      console.log("Creating AUTO_PRE_RESTORE_SAFETY backup before restoration...");
      await backupDatabase('PRE_RESTORE_SAFETY_AUTO', 'pre_restore_safety', performedBy);
    } catch (safeErr) {
      console.error("Safety backup failed before restore:", safeErr);
    }

    let payload = null;

    if (typeof customBackupPayload === 'string') {
      if (firestoreDb) {
        const docSnap = await getDoc(doc(firestoreDb, 'system_backups', customBackupPayload));
        if (docSnap.exists()) {
          const bDoc = docSnap.data();
          if (bDoc?.chunks) {
            let fullStr = '';
            for (let c = 0; c < bDoc.chunks; c++) {
              const cSnap = await getDoc(doc(firestoreDb, `system_backups/${customBackupPayload}/chunks`, `chunk_${c}`));
              if (cSnap.exists()) fullStr += cSnap.data().data;
            }
            try {
              payload = JSON.parse(fullStr);
            } catch (e) {
              console.error("Failed to parse chunked backup:", e);
            }
          } else {
            payload = bDoc?.data;
          }
        }
      }
      if (!payload) {
        throw new Error(`Không tìm thấy bản sao lưu "${customBackupPayload}" trên Cloud.`);
      }
    } else if (customBackupPayload && typeof customBackupPayload === 'object') {
      payload = customBackupPayload.data || customBackupPayload;
    }

    if (!payload) {
      try {
        const snap = await get(ref(db, 'backups/latest'));
        if (snap.exists()) {
          const meta = snap.val();
          if (meta && meta.id && firestoreDb) {
            const docSnap = await getDoc(doc(firestoreDb, 'system_backups', meta.id));
            if (docSnap.exists()) {
              const bDoc = docSnap.data();
              if (bDoc?.chunks) {
                let fullStr = '';
                for (let c = 0; c < bDoc.chunks; c++) {
                  const cSnap = await getDoc(doc(firestoreDb, `system_backups/${meta.id}/chunks`, `chunk_${c}`));
                  if (cSnap.exists()) fullStr += cSnap.data().data;
                }
                try {
                  payload = JSON.parse(fullStr);
                } catch (e) {
                  console.error("Failed to parse chunked auto backup:", e);
                }
              } else {
                payload = bDoc?.data;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Không thể đọc bản sao lưu mới nhất từ Cloud:', e);
      }
    }

    if (!payload) {
      const localStr = localStorage.getItem('latest_firebase_backup');
      if (localStr) {
        try {
          payload = JSON.parse(localStr);
        } catch (e) {
          console.error('Lỗi parse bản backup local storage:', e);
        }
      }
    }

    if (!payload) {
      throw new Error('Không tìm thấy bản sao lưu nào để khôi phục.');
    }

    // 1. Restore Realtime Database
    if (payload.rtdb) {
      const rtdbPaths = [
        'materialCatalog',
        'estimateGroups',
        'estimateItems',
        'bm06Orders',
        'bm06OrderHistory',
        'lichSu',
        'materialPrices',
        'priceDateOptions',
        'cauHinh',
        'users',
        'appSettings',
        'themeSettings',
        'reports'
      ];
      
      for (const path of rtdbPaths) {
        if (payload.rtdb[path] !== undefined) {
          if (payload.rtdb[path]) {
            await set(ref(db, path), removeUndefined(payload.rtdb[path]));
          } else {
            await remove(ref(db, path));
          }
        }
      }
    }

    // 2. Restore Firestore
    if (payload.firestore && firestoreDb) {
      const fsCollections = [
        'bm02Orders',
        'bbntOrders',
        'bm032Orders',
        'bm06Orders',
        'estimateGroups',
        'estimateItems',
        'materialTypeConfigs',
        'materialCatalog',
        'users',
        'roles',
        'appSettings',
        'themeSettings',
        'reports',
        'activityLogs'
      ];
      
      for (const col of fsCollections) {
        if (payload.firestore[col] !== undefined) {
          try {
            const colRef = collection(firestoreDb, col);
            const snap = await getDocs(colRef);
            const docsArray = snap.docs;
            for (let i = 0; i < docsArray.length; i += 400) {
              const chunk = docsArray.slice(i, i + 400);
              const batch = writeBatch(firestoreDb);
              chunk.forEach(d => {
                batch.delete(d.ref);
              });
              await batch.commit();
            }
          } catch (e) {
            console.warn(`Lỗi khi dọn dẹp Firestore collection "${col}" trong khi khôi phục:`, e);
          }

          const docsObj = payload.firestore[col];
          if (docsObj && Object.keys(docsObj).length > 0) {
            const docIds = Object.keys(docsObj);
            for (let i = 0; i < docIds.length; i += 400) {
              const chunkIds = docIds.slice(i, i + 400);
              const batch = writeBatch(firestoreDb);
              chunkIds.forEach(encodedDocId => {
                const docId = decodeRTDBKey(encodedDocId);
                const docRef = doc(firestoreDb, col, docId);
                batch.set(docRef, removeUndefined(docsObj[encodedDocId]));
              });
              await batch.commit();
            }
          }
        }
      }
    }

    try {
      localStorage.setItem('latest_firebase_backup', JSON.stringify(payload));
    } catch (e) {}

    // Log Activity
    try {
      await logActivity(
        performedBy,
        'admin',
        'IMPORT',
        'Cấu hình',
        `Khôi phục database thành công từ nguồn: ${typeof customBackupPayload === 'string' ? `Mã bản lưu Cloud [${customBackupPayload}]` : 'Bản sao lưu .json tải lên / Gần nhất'}`
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động khôi phục:', logErr);
    }

    return payload;
  } catch (err: any) {
    console.error('Lỗi khi khôi phục database:', err);
    throw new Error(err.message || String(err));
  }
};

export const deleteBackup = async (backupId: string, backupObj?: any) => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }
  try {
    const fsDb = getFirestoreDB();
    if (fsDb) {
      const targetId = backupObj?.docId || backupId;
      const bDocSnap = await getDoc(doc(fsDb, 'system_backups', targetId));
      if (bDocSnap.exists()) {
        const bDoc = bDocSnap.data();
        try {
          const chunksCol = collection(fsDb, `system_backups/${targetId}/chunks`);
          const chunksSnap = await getDocs(chunksCol);
          for (const cDoc of chunksSnap.docs) {
            await deleteDoc(cDoc.ref);
          }
        } catch (cErr) {
          if (bDoc?.chunks) {
            for (let c = 0; c < bDoc.chunks; c++) {
              try {
                await deleteDoc(doc(fsDb, `system_backups/${targetId}/chunks`, `chunk_${c}`));
              } catch (e) {}
            }
          }
        }
      }
      await deleteDoc(doc(fsDb, 'system_backups', targetId));
    }

    // Log Activity
    try {
      const currentUserStr = typeof localStorage !== 'undefined' ? localStorage.getItem('currentUser') : null;
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      await logActivity(
        currentUser?.username || 'khách',
        currentUser?.role || 'viewer',
        'DELETE_BACKUP',
        'Sao lưu & Khôi phục',
        `Xóa vĩnh viễn bản sao lưu [${backupObj?.backupName || backupId}] khỏi hệ thống Cloud`,
        backupId,
        null,
        null,
        {
          backupId,
          backupName: backupObj?.backupName || 'Chưa rõ',
          backupType: backupObj?.backupType || 'manual',
          backupCreatedAt: backupObj?.createdAt || backupObj?.timestamp || null
        }
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động xóa bản sao lưu:', logErr);
    }

    return true;
  } catch (err: any) {
    console.error('Lỗi khi xóa bản sao lưu:', err);
    throw new Error(err.message || String(err));
  }
};

export const resetDatabase = async () => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }

  try {
    // 1. Clear RTDB paths
    // NOTE: 'users' path containing User accounts & permissions is strictly preserved and NEVER cleared per user constraints.
    // 'cauHinh' containing material content configurations (Cấu hình nội dung VT) is also strictly preserved and NEVER cleared.
    // 'activityLogs' (Operation Audit Log / Nhật ký kiểm toán thao tác) is cleared as requested.
    const pathsToClear = ['estimateItems', 'estimateGroups', 'bm06Orders', 'bm06OrderHistory', 'lichSu', 'materialPrices', 'priceDateOptions', 'activityLogs'];
    for (const path of pathsToClear) {
      await remove(ref(db, path));
    }

    // Clear local activity logs cache in local storage
    localStorage.removeItem('local_activity_logs');

    // 2. Clear Firestore collections safely using chunked batches (max 400 docs per batch)
    if (firestoreDb) {
      // NOTE: 'materialTypeConfigs' containing Firestore material content configurations is strictly preserved.
      const fsCollections = ['bm02Orders', 'bbntOrders', 'bm032Orders', 'bm06Orders', 'estimateGroups', 'estimateItems'];
      for (const col of fsCollections) {
        try {
          const colRef = collection(firestoreDb, col);
          const snap = await getDocs(colRef);
          const docsArray = snap.docs;
          for (let i = 0; i < docsArray.length; i += 400) {
            const chunk = docsArray.slice(i, i + 400);
            const batch = writeBatch(firestoreDb);
            chunk.forEach(d => {
              batch.delete(d.ref);
            });
            await batch.commit();
          }
        } catch (e) {
          console.warn(`Lỗi khi dọn dẹp Firestore collection "${col}" trong khi reset:`, e);
        }
      }
    }

    // Auditing activity log
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      await logActivity(
        currentUser?.username || 'khách',
        currentUser?.role || 'viewer',
        'DELETE',
        'Cấu hình',
        `Xóa sạch vĩnh viễn toàn bộ cơ sở dữ liệu (Reset Database)`
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động reset:', logErr);
    }

    return true;
  } catch (err: any) {
    console.error('Lỗi khi reset database:', err);
    throw new Error(err.message || String(err));
  }
};


// =========================================================================
// CENTRALIZED AUDIT LOGGING & CUSTOM USER DATABASE SESSIONS
// =========================================================================

export const logActivity = async (
  username: string,
  role: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'IMPORT' | 'EXPORT' | 'DELETE_USER' | 'DELETE_BACKUP',
  moduleName: 'Dự toán' | 'BM06' | 'BM02' | 'BM03.2' | 'Báo cáo' | 'Cấu hình' | 'Quản lý tài khoản & Quyền hạn' | 'Sao lưu & Khôi phục',
  description: string,
  targetId?: string,
  beforeData?: any,
  afterData?: any,
  extraParams?: Record<string, any>
) => {
  const rtdb = getDB();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const logData = removeUndefined({
    logId,
    username,
    role,
    action,
    module: moduleName,
    description,
    targetId: targetId || null,
    targetUser: action === 'DELETE_USER' ? targetId : undefined,
    beforeData: beforeData ? JSON.parse(JSON.stringify(beforeData)) : null,
    afterData: afterData ? JSON.parse(JSON.stringify(afterData)) : null,
    createdAt: Date.now(),
    ...extraParams
  });

  if (rtdb) {
    try {
      await set(ref(rtdb, `activityLogs/${logId}`), logData);
    } catch(e) {
      console.warn("Lỗi ghi log hoạt động vào Realtime Database:", e);
    }
  }

  // Luôn đồng bộ dự phòng local storage để xem nhanh
  try {
    const localLogs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
    localLogs.unshift(logData);
    localStorage.setItem('local_activity_logs', JSON.stringify(localLogs.slice(0, 300)));
  } catch(e) {
    console.warn("Lỗi ghi log hoạt động vào local storage:", e);
  }
};

export const logCopyConfigActivity = async (
  username: string,
  role: string,
  sourceMaterialTypeId: string,
  sourceMaterialTypeName: string,
  targetMaterialTypeIds: string[],
  targetMaterialTypeNames: string[],
  copiedSections: string[]
) => {
  const rtdb = getDB();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const logData = removeUndefined({
    logId,
    user: username,
    role,
    action: 'COPY_CONFIG',
    module: 'Cấu hình vật tư',
    sourceMaterialTypeId,
    sourceMaterialTypeName,
    targetMaterialTypeIds,
    targetMaterialTypeNames,
    copiedSections,
    createdAt: Date.now()
  });

  if (rtdb) {
    try {
      await set(ref(rtdb, `activityLogs/${logId}`), logData);
    } catch(e) {
      console.warn("Lỗi ghi log COPY_CONFIG vào Realtime Database:", e);
    }
  }

  // Luôn đồng bộ dự phòng local storage để xem nhanh
  try {
    const localLogs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
    localLogs.unshift(logData);
    localStorage.setItem('local_activity_logs', JSON.stringify(localLogs.slice(0, 300)));
  } catch(e) {
    console.warn("Lỗi ghi log COPY_CONFIG vào local storage:", e);
  }
};

export const logCopyMaterialConfigActivity = async (
  username: string,
  role: string,
  sourceMaterialTypeId: string,
  sourceMaterialTypeName: string,
  targetMaterialTypeIds: string[],
  targetMaterialTypeNames: string[],
  selectedSections: string[],
  description: string
) => {
  const rtdb = getDB();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const logData = removeUndefined({
    logId,
    user: username,
    role,
    action: 'COPY_MATERIAL_CONFIG',
    module: 'Cấu hình vật tư',
    sourceMaterial: sourceMaterialTypeName,
    targetMaterials: targetMaterialTypeNames,
    sourceMaterialTypeId,
    sourceMaterialTypeName,
    targetMaterialTypeIds,
    targetMaterialTypeNames,
    selectedSections,
    description,
    createdAt: Date.now()
  });

  if (rtdb) {
    try {
      await set(ref(rtdb, `activityLogs/${logId}`), logData);
    } catch(e) {
      console.warn("Lỗi ghi log COPY_MATERIAL_CONFIG vào Realtime Database:", e);
    }
  }

  // Luôn đồng bộ dự phòng local storage để xem nhanh
  try {
    const localLogs = JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
    localLogs.unshift(logData);
    localStorage.setItem('local_activity_logs', JSON.stringify(localLogs.slice(0, 300)));
  } catch(e) {
    console.warn("Lỗi ghi log COPY_MATERIAL_CONFIG vào local storage:", e);
  }
};

export const fetchActivityLogs = async (): Promise<any[]> => {
  const rtdb = getDB();
  if (rtdb) {
    try {
      const snapshot = await get(ref(rtdb, 'activityLogs'));
      if (snapshot.exists()) {
        const val = snapshot.val();
        return Object.keys(val).map(key => ({
          ...val[key],
          id: key
        })).sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch (e) {
      console.error("fetchActivityLogs error:", e);
    }
  }
  // Dự phòng local list
  try {
    return JSON.parse(localStorage.getItem('local_activity_logs') || '[]');
  } catch(e) {
    return [];
  }
};

export async function ensureAdminAccountInDB(dbInstance: any) {
  if (!dbInstance) return;
  try {
    const adminRef = rtdbRef(dbInstance, 'users/admin');
    const snap = await get(adminRef);
    if (!snap.exists()) {
      await rtdbSet(adminRef, {
        username: 'admin',
        password: 'anhtran2261988',
        role: 'admin',
        createdAt: Date.now()
      });
      console.log('Tài khoản admin mặc định đã được khởi tạo thành công.');
      
      const seedLogId = `log_seed_${Date.now()}`;
      await rtdbSet(rtdbRef(dbInstance, `activityLogs/${seedLogId}`), {
        logId: seedLogId,
        username: 'Hệ thống',
        role: 'admin',
        action: 'CREATE',
        module: 'Cấu hình',
        description: 'Tự động tạo tài khoản admin mặc định: admin/****',
        targetId: 'admin',
        createdAt: Date.now()
      });
    }
  } catch (e) {
    console.error('ensureAdminAccountInDB failed:', e);
  }
};

export const loginUserInDB = async (username: string, passwordInput: string): Promise<any> => {
  const rtdb = getDB();
  
  if (!rtdb) {
    // Dự phòng offline local storage khi chưa kết nối database
    if (username === 'admin' && passwordInput === 'anhtran2261988') {
      return { username: 'admin', role: 'admin' };
    }
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    if (!localUsers[username]) {
      throw new Error("USER_NOT_FOUND");
    }
    if (localUsers[username].password !== passwordInput) {
      throw new Error("WRONG_PASSWORD");
    }
    return { username, role: localUsers[username].role };
  }

  try {
    const userRef = ref(rtdb, `users/${username}`);
    const snap = await get(userRef);
    if (!snap.exists()) {
      throw new Error("USER_NOT_FOUND");
    }
    const userData = snap.val();
    if (userData.password !== passwordInput) {
      throw new Error("WRONG_PASSWORD");
    }
    return { username: userData.username, role: userData.role };
  } catch (err: any) {
    if (err.message === "USER_NOT_FOUND" || err.message === "WRONG_PASSWORD") {
      throw err;
    }
    throw new Error(err.message || "Lỗi xác thực đăng nhập");
  }
};

export const registerUserInDB = async (username: string, passwordInput: string, role: string = 'viewer'): Promise<any> => {
  const rtdb = getDB();
  
  if (!rtdb) {
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    if (username === 'admin' || localUsers[username]) {
      throw new Error("USER_EXISTS");
    }
    localUsers[username] = { username, password: passwordInput, role, createdAt: Date.now() };
    localStorage.setItem('offline_users', JSON.stringify(localUsers));
    return { username, role };
  }

  try {
    const userRef = ref(rtdb, `users/${username}`);
    const snap = await get(userRef);
    if (snap.exists()) {
      throw new Error("USER_EXISTS");
    }
    const newUser = {
      username,
      password: passwordInput,
      role,
      createdAt: Date.now()
    };
    await set(userRef, newUser);
    return { username, role };
  } catch (err: any) {
    if (err.message === "USER_EXISTS") {
      throw err;
    }
    throw new Error(err.message || "Lỗi đăng ký tài khoản");
  }
};

export const fetchUserAccountsFromDB = async (): Promise<any[]> => {
  const rtdb = getDB();
  if (!rtdb) {
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    const usersArr = Object.values(localUsers).map((u: any) => ({
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      password: u.password
    }));
    if (!usersArr.some((u: any) => u.username === 'admin')) {
      usersArr.unshift({ username: 'admin', password: 'anhtran2261988', role: 'admin', createdAt: Date.now() });
    }
    return usersArr;
  }
  
  try {
    const snap = await get(ref(rtdb, 'users'));
    if (snap.exists()) {
      const val = snap.val();
      return Object.values(val);
    }
  } catch (e) {
    console.warn("fetchUserAccountsFromDB fail:", e);
  }
  return [{ username: 'admin', password: 'anhtran2261988', role: 'admin', createdAt: Date.now() }];
};

export const updateUserRoleInDB = async (username: string, newRole: string): Promise<boolean> => {
  const rtdb = getDB();
  if (!rtdb) {
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    if (localUsers[username]) {
      localUsers[username].role = newRole;
      localStorage.setItem('offline_users', JSON.stringify(localUsers));
      return true;
    }
    return false;
  }
  
  try {
    await update(ref(rtdb, `users/${username}`), { role: newRole });
    return true;
  } catch (e) {
    console.error("updateUserRoleInDB fail:", e);
    return false;
  }
};

export const deleteUserFromDB = async (username: string): Promise<boolean> => {
  if (username === 'admin') return false;
  const rtdb = getDB();
  if (!rtdb) {
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    if (localUsers[username]) {
      delete localUsers[username];
      localStorage.setItem('offline_users', JSON.stringify(localUsers));
      return true;
    }
    return false;
  }
  
  try {
    await remove(ref(rtdb, `users/${username}`));
    return true;
  } catch (e) {
    console.error("deleteUserFromDB fail:", e);
    return false;
  }
};

export const updateUserDetailedInDB = async (
  oldUsername: string,
  newUsername: string,
  newPassword?: string,
  newRole?: string
): Promise<boolean> => {
  const rtdb = getDB();
  if (!rtdb) {
    const localUsers = JSON.parse(localStorage.getItem('offline_users') || '{}');
    
    if (oldUsername !== newUsername) {
      if (oldUsername === 'admin') return false;
      if (localUsers[newUsername]) return false;
      
      const userData = localUsers[oldUsername] || { createdAt: Date.now() };
      delete localUsers[oldUsername];
      localUsers[newUsername] = {
        username: newUsername,
        password: newPassword !== undefined ? newPassword : userData.password,
        role: newRole !== undefined ? newRole : userData.role,
        createdAt: userData.createdAt || Date.now()
      };
      localStorage.setItem('offline_users', JSON.stringify(localUsers));
      return true;
    } else {
      if (oldUsername === 'admin') {
        if (newPassword !== undefined) {
          localUsers['admin'] = {
            username: 'admin',
            password: newPassword,
            role: 'admin',
            createdAt: Date.now()
          };
          localStorage.setItem('offline_users', JSON.stringify(localUsers));
          return true;
        }
        return true;
      }
      
      if (localUsers[oldUsername]) {
        if (newPassword !== undefined) localUsers[oldUsername].password = newPassword;
        if (newRole !== undefined) localUsers[oldUsername].role = newRole;
        localStorage.setItem('offline_users', JSON.stringify(localUsers));
        return true;
      }
      return false;
    }
  }

  try {
    const defaultCreatedAt = Date.now();
    let oldUserData: any = { createdAt: defaultCreatedAt, role: 'viewer', password: '' };
    const oldSnap = await get(ref(rtdb, `users/${oldUsername}`));
    if (oldSnap.exists()) {
      oldUserData = oldSnap.val();
    }

    const finalPassword = newPassword !== undefined ? newPassword : oldUserData.password;
    const finalRole = newRole !== undefined ? newRole : oldUserData.role;
    const finalCreatedAt = oldUserData.createdAt || defaultCreatedAt;

    if (oldUsername !== newUsername) {
      if (oldUsername === 'admin') return false;
      
      const newSnap = await get(ref(rtdb, `users/${newUsername}`));
      if (newSnap.exists()) {
        throw new Error("USER_EXISTS");
      }
      
      await set(ref(rtdb, `users/${newUsername}`), {
        username: newUsername,
        password: finalPassword,
        role: finalRole,
        createdAt: finalCreatedAt
      });
      await remove(ref(rtdb, `users/${oldUsername}`));
    } else {
      const updates: any = {};
      if (newPassword !== undefined) updates.password = newPassword;
      if (newRole !== undefined && oldUsername !== 'admin') updates.role = newRole;
      
      await update(ref(rtdb, `users/${oldUsername}`), updates);
    }
    return true;
  } catch (e) {
    console.error("updateUserDetailedInDB fail:", e);
    throw e;
  }
};

// =========================================================================
// SYSTEM CONFIGURATION MANAGEMENT
// =========================================================================

export const fetchSystemFirebaseConfig = async (): Promise<any | null> => {
  if (!bootstrapFirebaseConfig.apiKey || !bootstrapFirebaseConfig.databaseURL) {
    return null;
  }
  
  try {
    let app;
    const apps = getApps();
    const bootstrapAppIndex = apps.findIndex(a => a.name === 'bootstrapApp');
    if (bootstrapAppIndex === -1) {
      app = initializeApp(bootstrapFirebaseConfig, 'bootstrapApp');
    } else {
      app = apps[bootstrapAppIndex];
    }
    const tempDb = getDatabase(app);
    const snap = await get(ref(tempDb, 'systemConfig/firebaseConfig'));
    if (snap.exists()) {
      return snap.val();
    }
  } catch (e) {
    console.error('Error fetching system config:', e);
  }
  return null;
};

export const saveSystemFirebaseConfig = async (config: any, isInitial: boolean = false): Promise<boolean> => {
  if (!db) {
    if (isInitial) {
      // Allow saving via temp app if db not initialized
      try {
         let app;
         const apps = getApps();
         const bootstrapAppIndex = apps.findIndex(a => a.name === 'bootstrapApp');
         if (bootstrapAppIndex === -1) {
           app = initializeApp(config, 'bootstrapApp');
         } else {
           app = apps[bootstrapAppIndex];
         }
         const tempDb = getDatabase(app);
         const payload = {
            ...config,
            updatedAt: Date.now(),
            isDefault: true
         };
         await set(ref(tempDb, 'systemConfig/firebaseConfig'), payload);
         return true;
      } catch (e) {
         console.error('Error initial saving system config:', e);
         return false;
      }
    }
    return false;
  }
  
  try {
    const payload = {
      ...config,
      updatedAt: Date.now(),
      isDefault: true
    };
    
    // Backup old config first if it exists
    const oldSnap = await get(ref(db, 'systemConfig/firebaseConfig'));
    if (oldSnap.exists()) {
      const backupId = `bk_config_${Date.now()}`;
      await set(ref(db, `firebaseConfigBackups/${backupId}`), {
        backupId,
        config: oldSnap.val(),
        createdAt: Date.now(),
        note: 'Tự động sao lưu trước khi cập nhật cấu hình mới'
      });
    }

    await set(ref(db, 'systemConfig/firebaseConfig'), payload);
    
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      await logActivity(
        currentUser?.username || 'admin',
        currentUser?.role || 'admin',
        'UPDATE',
        'Cấu hình',
        'Cập nhật firebaseConfig mới và đặt làm cấu hình mặc định',
        undefined,
        oldSnap.exists() ? oldSnap.val() : null,
        payload
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động cập nhật firebaseConfig:', logErr);
    }

    return true;
  } catch (err) {
    console.error('saveSystemFirebaseConfig error:', err);
    return false;
  }
};

export const getSystemFirebaseConfigBackups = async (): Promise<any[]> => {
  if (!db) return [];
  try {
    const snap = await get(ref(db, 'firebaseConfigBackups'));
    if (snap.exists()) {
      const val = snap.val();
      return Object.values(val).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (e) {
    console.error('getSystemFirebaseConfigBackups error:', e);
  }
  return [];
};

export const restoreSystemFirebaseConfig = async (backupId: string): Promise<any | null> => {
  if (!db) return null;
  try {
    const snap = await get(ref(db, `firebaseConfigBackups/${backupId}`));
    if (snap.exists()) {
      const backupData = snap.val();
      const config = backupData.config;
      await saveSystemFirebaseConfig(config);
      return config;
    }
  } catch (e) {
    console.error('restoreSystemFirebaseConfig error:', e);
  }
  return null;
};

export const fetchBackupScheduleConfig = async () => {
  if (!db) {
    return {
      enabled: true,
      scheduleType: 'daily' as const,
      backupTime: '12:00',
      keepLast: 10,
      lastRunAt: null,
      nextRunAt: null,
      status: 'active' as const
    };
  }
  try {
    const snap = await get(ref(db, 'systemConfig/backupSchedule'));
    if (snap.exists()) {
      const val = snap.val();
      return {
        enabled: val.enabled !== undefined ? val.enabled : true,
        scheduleType: val.scheduleType || 'daily',
        backupTime: val.backupTime || '12:00',
        keepLast: Number(val.keepLast) || 10,
        lastRunAt: val.lastRunAt || null,
        nextRunAt: val.nextRunAt || null,
        status: val.status || 'active'
      };
    }
  } catch (e) {
    console.error('Lỗi khi fetch backup schedule config:', e);
  }
  return {
    enabled: true,
    scheduleType: 'daily' as const,
    backupTime: '12:00',
    keepLast: 10,
    lastRunAt: null,
    nextRunAt: null,
    status: 'active' as const
  };
};

export const saveBackupScheduleConfig = async (config: any) => {
  if (!db) return false;
  try {
    await set(ref(db, 'systemConfig/backupSchedule'), removeUndefined(config));

    // Auditing activity log
    try {
      const currentUserStr = localStorage.getItem('currentUser');
      const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
      await logActivity(
        currentUser?.username || 'khách',
        currentUser?.role || 'viewer',
        'UPDATE',
        'Cấu hình',
        `Cập nhật cấu hình lịch sao lưu tự động: ${config.enabled ? 'Bật' : 'Tắt'}, Tần suất: ${config.scheduleType}, Giờ: ${config.backupTime}, Giữ lại: ${config.keepLast} bản.`
      );
    } catch (logErr) {
      console.warn('Lỗi ghi log hoạt động cập nhật cấu hình backup schedule:', logErr);
    }

    return true;
  } catch (e) {
    console.error('Lỗi khi save backup schedule config:', e);
    return false;
  }
};

// =========================================================================
// ESTIMATE GROUP MANAGEMENT (Group-based Norms Architecture)
// =========================================================================

export const getEstimateGroups = async (projectId: string, unitId: string): Promise<EstimateGroup[]> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) return [];
  try {
    const snapshot = await getDocs(collection(fsDb, 'estimateGroups'));
    const groups: EstimateGroup[] = [];
    snapshot.forEach((docSnap) => {
      const g = docSnap.data();
      const matchProject = !projectId || projectId === 'ALL' || g.projectId === projectId;
      const matchUnit = !unitId || unitId === 'ALL' || g.unitId === unitId;
      if (matchProject && matchUnit) {
        groups.push({ ...(g as EstimateGroup), groupId: docSnap.id });
      }
    });
    return groups.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (error: any) {
    console.error('Realtime DB getEstimateGroups error:', error);
    throw error;
  }
};

export const deleteEstimateGroup = async (groupId: string): Promise<void> => {
  const fsDb = getFirestoreDB();
  if (!fsDb) throw new Error('Chưa cấu hình Firebase.');
  try {
    await deleteDoc(doc(fsDb, 'estimateGroups', groupId));
    const snapItems = await getDocs(collection(fsDb, 'estimateItems'));
    snapItems.forEach(async (docSnap) => {
      const it = docSnap.data();
      if (it && it.groupId === groupId) {
        await setDoc(doc(fsDb, 'estimateItems', docSnap.id), {
          groupId: null, isGroupedEstimate: false, estimatedQty: 0, remainingQty: 0, warningStatus: 'NORMAL', updatedAt: Date.now()
        }, { merge: true });
      }
    });
  } catch (error: any) {
    console.error('Realtime DB deleteEstimateGroup error:', error);
    throw error;
  }
};

export const saveEstimateGroup = async (group: Partial<EstimateGroup> & { materialDetails?: any[] }): Promise<string> => {
  if (!db) {
    throw new Error('Chưa cấu hình Firebase. Vui lòng thiết lập kết nối Firebase.');
  }

  const groupId = group.groupId || generateUUID();
  const now = Date.now();
  
  const estQty = Number(group.estimatedQty) || 0;
  const cumQty = Number(group.cumulativeQty) || 0;
  const remQty = estQty - cumQty;
  
  const calculateWarningLocal = (estimated: number, cumulative: number) => {
    if (estimated <= 0) return 'NORMAL';
    if (cumulative > estimated) return 'EXCEEDED';
    if ((estimated - cumulative) / estimated <= 0.10) return 'NEARLY_EMPTY';
    return 'NORMAL';
  };
  
  const status = calculateWarningLocal(estQty, cumQty);

  const enrichedGroup: EstimateGroup = {
    groupId,
    projectId: group.projectId || '',
    unitId: group.unitId || '',
    materialTypeId: group.materialTypeId || '',
    groupName: group.groupName || '',
    unit: group.unit || '',
    estimatedQty: estQty,
    cumulativeQty: cumQty,
    remainingQty: remQty,
    materialIds: group.materialIds || [],
    status: status as any,
    notes: group.notes || '',
    createdAt: group.createdAt || now,
    updatedAt: now
  };

  const updates: any = {};
  updates[`estimateGroups/${groupId}`] = removeUndefined(enrichedGroup);

  const isTemplateGroup = enrichedGroup.projectId === 'ALL' || enrichedGroup.unitId === 'ALL';
  if (isTemplateGroup) {
    await update(ref(db), updates);
    return groupId;
  }

  const snapItems = await get(ref(db, 'estimateItems'));
  const allItemsVal = snapItems.exists() ? snapItems.val() : {};
  
  const existingMemberItems = Object.keys(allItemsVal)
    .map(k => ({ ...allItemsVal[k], id: k }))
    .filter(it => it.groupId === groupId);

  const selectedMaterialDetails = group.materialDetails || [];
  const activeItemIds: string[] = [];

  for (const mat of selectedMaterialDetails) {
    const matId = mat.id;
    let existingItem = Object.keys(allItemsVal)
      .map(k => ({ ...allItemsVal[k], id: k }))
      .find(it => it.projectId === enrichedGroup.projectId && it.unitId === enrichedGroup.unitId && it.materialId === matId);

    if (!existingItem) {
      existingItem = existingMemberItems.find(it => it.materialId === matId);
    }

    const itemId = existingItem ? existingItem.id : generateUUID();
    activeItemIds.push(itemId);

    const currentItemCum = existingItem ? 
      (existingItem.itemCumulativeQty !== undefined ? existingItem.itemCumulativeQty : 
        (existingItem.isGroupedEstimate && existingItem.groupId ? 0 : (existingItem.cumulativeQty || 0))
      ) : 0;

    const itemPayload = {
      id: itemId,
      projectId: enrichedGroup.projectId,
      unitId: enrichedGroup.unitId,
      code: existingItem?.code || mat.code || mat.id.substring(0, 8).toUpperCase(),
      name: mat.name,
      unit: mat.unit,
      specs: mat.specification || '',
      basePrice: Number(mat.unitPrice) || 0,
      
      groupId: groupId,
      isGroupedEstimate: true,
      groupName: enrichedGroup.groupName,
      
      estimatedQty: enrichedGroup.estimatedQty,
      cumulativeQty: enrichedGroup.cumulativeQty,
      remainingQty: enrichedGroup.remainingQty,
      warningStatus: enrichedGroup.status,

      materialId: matId,
      itemCumulativeQty: currentItemCum,
      itemLastOrderQty: existingItem?.itemLastOrderQty || 0,
      itemNote: existingItem?.itemNote || '',

      createdAt: existingItem?.createdAt || now,
      updatedAt: now
    };

    updates[`estimateItems/${itemId}`] = removeUndefined(itemPayload);
  }

  const activeItemIdSet = new Set(activeItemIds);
  const itemsToDissociate = existingMemberItems.filter(it => !activeItemIdSet.has(it.id));
  
  for (const it of itemsToDissociate) {
    updates[`estimateItems/${it.id}`] = {
      ...it,
      groupId: null,
      isGroupedEstimate: false,
      estimatedQty: 0,
      remainingQty: 0,
      warningStatus: 'NORMAL',
      updatedAt: now
    };
  }

  let totalGroupCum = 0;
  activeItemIds.forEach(itemId => {
    const itemPath = `estimateItems/${itemId}`;
    const payload = updates[itemPath];
    if (payload) {
      totalGroupCum += Number(payload.itemCumulativeQty) || 0;
    }
  });

  enrichedGroup.cumulativeQty = totalGroupCum;
  enrichedGroup.remainingQty = enrichedGroup.estimatedQty - totalGroupCum;
  enrichedGroup.status = calculateWarningLocal(enrichedGroup.estimatedQty, totalGroupCum) as any;

  updates[`estimateGroups/${groupId}`] = removeUndefined(enrichedGroup);

  activeItemIds.forEach(itemId => {
    const itemPath = `estimateItems/${itemId}`;
    if (updates[itemPath]) {
      updates[itemPath].cumulativeQty = enrichedGroup.cumulativeQty;
      updates[itemPath].remainingQty = enrichedGroup.remainingQty;
      updates[itemPath].warningStatus = enrichedGroup.status;
    }
  });

  await update(ref(db), updates);
  return groupId;
};




let _projectTotalUnitsCache: Record<string, number> = {};

export const loadProjectTotalUnitsAll = async () => {
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
  } catch (err) {
    console.warn('loadProjectTotalUnitsAll error:', err);
  }
};

export const getProjectTotalUnits = (projectId: string): number | null => {
  if (!projectId) return null;
  if (_projectTotalUnitsCache[projectId]) return _projectTotalUnitsCache[projectId];

  const norm = normalizeProjectName(projectId);
  if (norm && _projectTotalUnitsCache[norm]) return _projectTotalUnitsCache[norm];

  const keys = Object.keys(_projectTotalUnitsCache);
  for (const k of keys) {
    if (k.toLowerCase() === projectId.toLowerCase() || (norm && normalizeProjectName(k) === norm)) {
      return _projectTotalUnitsCache[k];
    }
  }
  return null;
};

export const updateProjectTotalUnitsCache = (projectId: string, totalUnits: number) => {
  if (projectId) {
    _projectTotalUnitsCache[projectId] = totalUnits;
    const norm = normalizeProjectName(projectId);
    if (norm) _projectTotalUnitsCache[norm] = totalUnits;
  }
};
