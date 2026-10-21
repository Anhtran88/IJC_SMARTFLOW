import { firebaseListenerManager } from './FirebaseListenerManager';
import { getDB } from '../lib/firebaseService';
import { ref, get } from 'firebase/database';

export class MaterialCache {
  private static instance: MaterialCache;

  private pricesCache: Record<string, any> = {};
  private masterItemsCache: Record<string, Record<string, any>> = {};
  private isPricesInitialized = false;
  private isMasterItemsInitialized = false;

  private unsubPrices: (() => void) | null = null;
  private unsubMasterItems: (() => void) | null = null;

  private constructor() {
    this.initListeners();
  }

  public static getInstance(): MaterialCache {
    if (!MaterialCache.instance) {
      MaterialCache.instance = new MaterialCache();
    }
    return MaterialCache.instance;
  }

  private initListeners() {
    // 1. Subscribe to materialPrices (Firebase 1 lần via ListenerManager)
    this.unsubPrices = firebaseListenerManager.subscribe('materialPrices', (data) => {
      if (data) {
        this.pricesCache = data;
      } else {
        this.pricesCache = {};
      }
      this.isPricesInitialized = true;
    });

    // 2. Subscribe to cauHinh/materialItems (Firebase 1 lần via ListenerManager)
    this.unsubMasterItems = firebaseListenerManager.subscribe('cauHinh/materialItems', (data) => {
      if (data) {
        this.masterItemsCache = data;
      } else {
        this.masterItemsCache = {};
      }
      this.isMasterItemsInitialized = true;
    });
  }

  /**
   * Ensure cache is loaded from Firebase. If listener manager hasn't received value yet,
   * performs a one-time get() fallback to guarantee immediate data presence.
   */
  public async ensureLoaded(): Promise<void> {
    const db = getDB();
    if (!db) return;

    if (!this.isPricesInitialized) {
      try {
        const snap = await get(ref(db, 'materialPrices'));
        if (snap.exists()) {
          this.pricesCache = snap.val();
        }
        this.isPricesInitialized = true;
      } catch (e) {
        console.warn('MaterialCache: failed to fetch materialPrices', e);
      }
    }

    if (!this.isMasterItemsInitialized) {
      try {
        const snap = await get(ref(db, 'cauHinh/materialItems'));
        if (snap.exists()) {
          this.masterItemsCache = snap.val();
        }
        this.isMasterItemsInitialized = true;
      } catch (e) {
        console.warn('MaterialCache: failed to fetch cauHinh/materialItems', e);
      }
    }
  }

  /**
   * Get cached material prices for a specific material type (e.g., 'BeTong')
   */
  public getMaterialPrices(loaiVatTu: string = 'BeTong'): any[] {
    const data = this.pricesCache[loaiVatTu];
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return Object.values(data);
    return [];
  }

  /**
   * Get all raw material prices cache map
   */
  public getAllPricesCache(): Record<string, any> {
    return this.pricesCache;
  }

  /**
   * Get cached master items for a specific typeId (e.g., 'BeTong', 'SatThep')
   * Supports flexible category matching and merges related sub-categories.
   */
  public getMasterItems(typeId: string): any[] {
    if (!typeId) return [];
    const normType = typeId.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Find all matching keys in masterItemsCache
    const matchedKeys = Object.keys(this.masterItemsCache).filter(k => {
      const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normK === normType) return true;
      if (normType.includes('thep') && normK.includes('thep')) return true;
      if (normType.includes('betong') && normK.includes('betong')) return true;
      if (normType.includes('catda') && (normK.includes('catda') || normK.includes('cat') || normK.includes('da') || normK.includes('dien'))) return true;
      if (normType.includes('gach') && normK.includes('gach')) return true;
      if (normType.includes('ximang') && normK.includes('ximang')) return true;
      return false;
    });

    // Fallback if no matching key found
    if (matchedKeys.length === 0 && this.masterItemsCache[typeId]) {
      matchedKeys.push(typeId);
    }

    const itemMap = new Map<string, any>();
    matchedKeys.forEach(k => {
      const typeItems = this.masterItemsCache[k];
      if (typeItems && typeof typeItems === 'object') {
        Object.keys(typeItems).forEach((key) => {
          const val = typeItems[key];
          if (val && val.name) {
            const cleanName = val.name.trim().toLowerCase().replace(/\s+/g, ' ');
            const existing = itemMap.get(cleanName);
            const currentPrice = Number(val.unitPrice || 0);

            // If not added yet, or if current item has a valid price while existing had 0, use current
            if (!existing || (currentPrice > 0 && Number(existing.unitPrice || 0) === 0)) {
              itemMap.set(cleanName, {
                id: key,
                name: val.name || '',
                unit: val.unit || 'm3',
                specification: val.specification || '',
                unitPrice: currentPrice,
                updatedAt: val.updatedAt,
                archived: val.archived === true || val.active === false,
                active: val.active !== false && !val.archived,
                categoryKey: k
              });
            }
          }
        });
      }
    });

    const list = Array.from(itemMap.values());
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    return list;
  }

  /**
   * Get raw master items cache map
   */
  public getAllMasterItemsCache(): Record<string, Record<string, any>> {
    return this.masterItemsCache;
  }

  /**
   * Search for a master item across all material types by clean name
   */
  public findMasterItemByName(cleanName: string): { typeId: string; itemId: string; item: any } | null {
    if (!cleanName) return null;
    const target = cleanName.trim().toLowerCase().replace(/\s+/g, ' ');

    for (const typeId of Object.keys(this.masterItemsCache)) {
      const itemsMap = this.masterItemsCache[typeId];
      if (itemsMap && typeof itemsMap === 'object') {
        for (const itemId of Object.keys(itemsMap)) {
          const item = itemsMap[itemId];
          if (item && item.name) {
            const name = item.name.trim().toLowerCase().replace(/\s+/g, ' ');
            if (name === target) {
              return { typeId, itemId, item };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Update cache in memory immediately upon write
   */
  public updateLocalMasterPrice(typeId: string, itemId: string, newPrice: number): void {
    if (!this.masterItemsCache[typeId]) {
      this.masterItemsCache[typeId] = {};
    }
    if (this.masterItemsCache[typeId][itemId]) {
      this.masterItemsCache[typeId][itemId].unitPrice = newPrice;
      this.masterItemsCache[typeId][itemId].updatedAt = Date.now();
    }
  }

  /**
   * Add or update a full master item in memory cache immediately
   */
  public addOrUpdateMasterItem(typeId: string, itemData: any): void {
    if (!typeId || !itemData || !itemData.id) return;
    if (!this.masterItemsCache[typeId]) {
      this.masterItemsCache[typeId] = {};
    }
    this.masterItemsCache[typeId][itemData.id] = {
      name: itemData.name || '',
      unit: itemData.unit || 'm3',
      specification: itemData.specification || itemData.quyCach || '',
      unitPrice: Number(itemData.unitPrice) || 0,
      updatedAt: itemData.updatedAt || Date.now(),
      active: true,
      archived: false
    };
  }

  /**
   * Cleanup listeners
   */
  public destroy(): void {
    if (this.unsubPrices) this.unsubPrices();
    if (this.unsubMasterItems) this.unsubMasterItems();
  }
}

export const materialCache = MaterialCache.getInstance();
export const MaterialCacheService = MaterialCache;
