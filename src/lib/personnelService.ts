import { Personnel } from '../../types';
import { getDB, ref, set, getFirestoreDB } from './firebaseService';
import { firebaseListenerManager } from '../services/FirebaseListenerManager';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const LOCAL_STORAGE_KEY = 'danh_ba_nhan_su_v2';
const RTDB_PATH = 'personnelDirectory';
const FIRESTORE_COLLECTION = 'personnelDirectory';

export const DEFAULT_PERSONNEL_LIST: Personnel[] = [
  {
    id: 'p_1',
    gender: 'Bà',
    fullName: 'Nguyễn Thị Thêm',
    defaultTitle: 'Kế toán trưởng',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 100000
  },
  {
    id: 'p_2',
    gender: 'Ông',
    fullName: 'Đỗ Thế Viễn',
    defaultTitle: 'Chỉ huy trưởng',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 90000
  },
  {
    id: 'p_3',
    gender: 'Ông',
    fullName: 'Đỗ Huỳnh Linh Khoa',
    defaultTitle: 'Thủ kho',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 80000
  },
  {
    id: 'p_4',
    gender: 'Ông',
    fullName: 'Trần Nam Anh',
    defaultTitle: 'NV Thu mua',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 70000
  },
  {
    id: 'p_5',
    gender: 'Ông',
    fullName: 'Trần Kim Nguyên',
    defaultTitle: 'Chỉ huy trưởng',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 60000
  },
  {
    id: 'p_6',
    gender: 'Ông',
    fullName: 'Nguyễn Văn Hùng',
    defaultTitle: 'Giám sát trưởng bên nhận',
    company: 'CÔNG TY CP ĐẦU TƯ & XÂY DỰNG BTI',
    active: true,
    createdAt: Date.now() - 50000
  },
  {
    id: 'p_7',
    gender: 'Ông',
    fullName: 'Lê Minh Chánh',
    defaultTitle: 'Cán bộ vật tư',
    company: 'CÔNG TY TNHH MTV XÂY DỰNG IJC',
    active: true,
    createdAt: Date.now() - 40000
  }
];

// Helper to deduplicate personnel list by ID and fullName
export const deduplicatePersonnelList = (list: Personnel[]): Personnel[] => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: Personnel[] = [];

  for (const item of list) {
    if (!item) continue;
    const cleanId = item.id ? String(item.id).trim() : '';
    const cleanName = item.fullName ? String(item.fullName).trim() : '';
    if (cleanId && cleanName && !seenIds.has(cleanId) && !seenNames.has(cleanName)) {
      seenIds.add(cleanId);
      seenNames.add(cleanName);
      result.push({ ...item, id: cleanId, fullName: cleanName });
    }
  }
  return result;
};

// Helper to get local cached list
export const getLocalPersonnelList = (): Personnel[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const rawMerged = [...DEFAULT_PERSONNEL_LIST, ...parsed];
        return deduplicatePersonnelList(rawMerged);
      }
    }
  } catch (e) {
    console.error('Error reading local personnel directory:', e);
  }
  return DEFAULT_PERSONNEL_LIST;
};

// Helper to save local cached list and dispatch window event
export const setLocalPersonnelList = (list: Personnel[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('personnel_directory_updated', { detail: list }));
  } catch (e) {
    console.error('Error writing local personnel directory:', e);
  }
};

// Memory cache for quick sync
let memoryCache: Personnel[] = getLocalPersonnelList();

// Save personnel list to RTDB/Firestore & LocalStorage
export const savePersonnelList = async (list: Personnel[]): Promise<boolean> => {
  memoryCache = list;
  setLocalPersonnelList(list);

  try {
    const db = getDB();
    if (db) {
      const pRef = ref(db, RTDB_PATH);
      const dataObj: Record<string, Personnel> = {};
      list.forEach(p => {
        if (p && p.id) {
          dataObj[p.id] = p;
        }
      });
      await set(pRef, dataObj);
    }

    const fsDb = getFirestoreDB();
    if (fsDb) {
      // Sync each document in Firestore
      for (const person of list) {
        if (person && person.id) {
          const pDocRef = doc(fsDb, FIRESTORE_COLLECTION, person.id);
          await setDoc(pDocRef, person, { merge: true });
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Failed to sync personnel directory to cloud:', err);
    return false;
  }
};

// Realtime subscription to Personnel Directory
export const subscribePersonnelDirectory = (callback: (list: Personnel[]) => void): (() => void) => {
  // Initial call with local cache
  callback(memoryCache);

  // Local window event listener
  const handleLocalUpdate = (e: any) => {
    if (e.detail && Array.isArray(e.detail)) {
      const cleanList = deduplicatePersonnelList(e.detail);
      memoryCache = cleanList;
      callback(cleanList);
    }
  };
  window.addEventListener('personnel_directory_updated', handleLocalUpdate);

  // RTDB Listener
  let unsubRTDB: any = null;
  unsubRTDB = firebaseListenerManager.subscribe(RTDB_PATH, (val) => {
    if (val !== undefined && val !== null) {
      let list: Personnel[] = [];
      if (Array.isArray(val)) {
        list = val.filter(Boolean);
      } else if (typeof val === 'object') {
        list = Object.values(val).filter(Boolean) as Personnel[];
      }
      const cleanList = deduplicatePersonnelList([...DEFAULT_PERSONNEL_LIST, ...list]);
      memoryCache = cleanList;
      setLocalPersonnelList(cleanList);
      callback(cleanList);
    }
  });

  // Firestore Listener
  let unsubFirestore: any = null;
  try {
    const fsDb = getFirestoreDB();
    if (fsDb) {
      const colRef = collection(fsDb, FIRESTORE_COLLECTION);
      unsubFirestore = onSnapshot(colRef, (snapshot) => {
        const list: Personnel[] = snapshot.docs.map(doc => doc.data() as Personnel);
        if (list.length > 0 || snapshot.empty) {
          const cleanList = deduplicatePersonnelList([...DEFAULT_PERSONNEL_LIST, ...list]);
          memoryCache = cleanList;
          setLocalPersonnelList(cleanList);
          callback(cleanList);
        }
      }, (err) => {
        console.warn('Firestore personnel subscription error:', err);
      });
    }
  } catch (e) {
    console.warn('Failed to attach Firestore listener for personnel directory:', e);
  }

  return () => {
    window.removeEventListener('personnel_directory_updated', handleLocalUpdate);
    if (typeof unsubRTDB === 'function') {
      unsubRTDB();
    }
    if (typeof unsubFirestore === 'function') {
      unsubFirestore();
    }
  };
};

// Add new personnel
export const addPersonnel = async (personData: Omit<Personnel, 'id'>): Promise<Personnel> => {
  const newPerson: Personnel = {
    ...personData,
    id: `person_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const currentList = getLocalPersonnelList();
  const updatedList = [newPerson, ...currentList];
  await savePersonnelList(updatedList);
  return newPerson;
};

// Update personnel
export const updatePersonnel = async (id: string, updates: Partial<Personnel>): Promise<boolean> => {
  const currentList = getLocalPersonnelList();
  const updatedList = currentList.map(p => {
    if (p.id === id) {
      return { ...p, ...updates, updatedAt: Date.now() };
    }
    return p;
  });
  return await savePersonnelList(updatedList);
};

// Delete personnel
export const deletePersonnel = async (id: string): Promise<boolean> => {
  if (!id) return false;

  const currentList = getLocalPersonnelList();
  const updatedList = currentList.filter(p => p && p.id !== id);

  try {
    const fsDb = getFirestoreDB();
    if (fsDb) {
      const pDocRef = doc(fsDb, FIRESTORE_COLLECTION, id);
      await deleteDoc(pDocRef);
    }
  } catch (err) {
    console.error('Failed to delete personnel document from Firestore:', err);
  }

  try {
    const db = getDB();
    if (db) {
      const rtdbRef = ref(db, `${RTDB_PATH}/${id}`);
      await set(rtdbRef, null);
    }
  } catch (err) {
    console.error('Failed to delete personnel node from RTDB:', err);
  }

  return await savePersonnelList(updatedList);
};

// Toggle active status
export const togglePersonnelActive = async (id: string): Promise<boolean> => {
  const currentList = getLocalPersonnelList();
  const updatedList = currentList.map(p => {
    if (p.id === id) {
      return { ...p, active: !p.active, updatedAt: Date.now() };
    }
    return p;
  });
  return await savePersonnelList(updatedList);
};
