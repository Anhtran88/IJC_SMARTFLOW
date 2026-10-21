import { MaterialService } from './MaterialService';
import { materialCache } from './MaterialCache';
import { getDB } from '../lib/firebaseService';
import { ref, set } from 'firebase/database';

export interface MasterCatalogItem {
  id: string;
  maVatTu?: string;
  tenVatTu: string;
  donVi: string;
  quyCach?: string;
  nhomVatTu?: string;
  giaHienHanh: number;
  loaiVatTu: string;
  originalRaw?: any;
}

export interface MaterialMatchResult {
  matched: boolean;
  confidence: number; // 0 - 100
  matchMethod: 'exact' | 'alias' | 'diameter_spec' | 'fuzzy' | 'none';
  matchedMaterialId: string | null;
  matchedName: string | null;
  unit: string | null;
  unitPrice: number;
  originalOcrName: string;
  statusMessage?: string;
  catalogItem?: MasterCatalogItem;
}

/**
 * Remove Vietnamese accents and normalize text
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Clean material name string for comparisons
 */
export function cleanMaterialName(name: string): string {
  if (!name) return '';
  let cleaned = removeVietnameseAccents(name);
  // Standardize phi / d symbols
  cleaned = cleaned.replace(/[ΦφøØ]/g, 'd');
  cleaned = cleaned.replace(/\bfi\b/gi, 'd');
  // Clean special punctuation
  cleaned = cleaned.replace(/[^a-z0-9\s]/gi, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Helper to extract rebar / steel diameter (e.g. 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32)
 */
export function extractDiameter(text: string): number | null {
  if (!text) return null;
  const cleaned = removeVietnameseAccents(text).toLowerCase();

  // Pattern 1: d6, d10, d12, d14, d16, d18, d20, phi 6, phi 10, ø14, fi 12
  const match = cleaned.match(/(?:phi|d|ø|fi|f)\s*(\d{1,2})\b/i);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val >= 4 && val <= 50) return val;
  }

  // Pattern 2: "thep 10", "sat 14", "cuon 6", "cay 16", "cb240t 6"
  const match2 = cleaned.match(/(?:thep|sat|cuon|cay|thanh)\s+(\d{1,2})\b/i);
  if (match2) {
    const val = parseInt(match2[1], 10);
    if (val >= 4 && val <= 50) return val;
  }

  // Pattern 3: Lone number if string clearly implies steel (e.g. "D10", "D 14", "D20")
  const match3 = cleaned.match(/\bd\s*(\d{1,2})\b/i);
  if (match3) {
    const val = parseInt(match3[1], 10);
    if (val >= 4 && val <= 50) return val;
  }

  return null;
}

/**
 * Helper to extract concrete grade (e.g. M200, M250, M300, M350, M400)
 */
export function extractConcreteGrade(text: string): number | null {
  if (!text) return null;
  const cleaned = removeVietnameseAccents(text).toLowerCase();
  const match = cleaned.match(/(?:m|mac|mark)\s*(\d{3})\b/i);
  if (match) {
    const val = parseInt(match[1], 10);
    if (val >= 100 && val <= 800) return val;
  }
  return null;
}

export interface AliasMapping {
  ocrCleanKey: string;
  originalOcrName: string;
  matchedMaterialId: string;
  matchedName: string;
  unit: string;
  unitPrice: number;
  timestamp: number;
}

export class MaterialMatchingService {
  private static STORAGE_KEY_ALIAS = 'material_alias_mappings_v1';

  /**
   * Read saved alias mappings from localStorage
   */
  public static getAliasMappings(): Record<string, AliasMapping> {
    try {
      const raw = localStorage.getItem(MaterialMatchingService.STORAGE_KEY_ALIAS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Lỗi đọc alias mappings:', e);
      return {};
    }
  }

  /**
   * Save an alias mapping when user selects or confirms a material for an OCR name
   */
  public static saveAliasMapping(
    ocrName: string,
    catalogItem: { id: string; tenVatTu: string; donVi: string; giaHienHanh: number }
  ): void {
    if (!ocrName || !catalogItem) return;
    const cleanKey = cleanMaterialName(ocrName);
    if (!cleanKey) return;

    try {
      const map = MaterialMatchingService.getAliasMappings();
      map[cleanKey] = {
        ocrCleanKey: cleanKey,
        originalOcrName: ocrName,
        matchedMaterialId: catalogItem.id,
        matchedName: catalogItem.tenVatTu,
        unit: catalogItem.donVi,
        unitPrice: catalogItem.giaHienHanh,
        timestamp: Date.now()
      };
      localStorage.setItem(MaterialMatchingService.STORAGE_KEY_ALIAS, JSON.stringify(map));
    } catch (e) {
      console.error('Lỗi khi lưu alias mapping:', e);
    }
  }

  /**
   * Get Master Catalog items strictly for a given material category (loaiVatTu)
   */
  static async getMasterCatalog(loaiVatTu: string = 'BeTong'): Promise<MasterCatalogItem[]> {
    try {
      await materialCache.ensureLoaded();
      const rawPrices = await MaterialService.getDanhSachVatTu(loaiVatTu);
      const catalogList: MasterCatalogItem[] = [];

      let vatTuList: any[] = [];
      if (rawPrices && rawPrices.vatTu) {
        vatTuList = rawPrices.vatTu;
      } else if (Array.isArray(rawPrices)) {
        vatTuList = rawPrices;
      }

      vatTuList.forEach((item: any, idx: number) => {
        let latestPrice = 0;
        if (item.gia && typeof item.gia === 'object') {
          // Prefer giaGoc if available and > 0
          if (item.gia.giaGoc && Number(item.gia.giaGoc) > 0) {
            latestPrice = Number(item.gia.giaGoc);
          }
          // Check all keys for latest price
          const priceVals = Object.keys(item.gia)
            .map(v => Number(item.gia[v]))
            .filter(v => !isNaN(v) && v > 0);
          if (priceVals.length > 0) {
            latestPrice = priceVals[priceVals.length - 1];
          }
        } else if (item.unitPrice) {
          latestPrice = Number(item.unitPrice) || 0;
        }

        const name = item.tenVatTu || item.name || '';
        if (name) {
          catalogList.push({
            id: item.id || item.maVatTu || `vt-${idx}`,
            maVatTu: item.maVatTu || item.id || '',
            tenVatTu: name,
            donVi: item.donVi || item.unit || 'kg',
            quyCach: item.quyCach || item.specification || item.spec || '',
            nhomVatTu: item.nhomVatTu || item.group || loaiVatTu,
            giaHienHanh: latestPrice,
            loaiVatTu,
            originalRaw: item
          });
        }
      });

      // Also merge with masterItemsCache in MaterialCache
      const cachedMasterItems = materialCache.getMasterItems(loaiVatTu);
      cachedMasterItems.forEach((cItem: any) => {
        const found = catalogList.find(cat => cat.id === cItem.id || cleanMaterialName(cat.tenVatTu) === cleanMaterialName(cItem.name));
        if (found) {
          if (cItem.unitPrice > 0) {
            found.giaHienHanh = cItem.unitPrice;
          }
          if (cItem.unit) {
            found.donVi = cItem.unit;
          }
          if (cItem.specification) {
            found.quyCach = cItem.specification;
          }
        } else {
          catalogList.push({
            id: cItem.id,
            maVatTu: cItem.id,
            tenVatTu: cItem.name,
            donVi: cItem.unit || 'kg',
            quyCach: cItem.specification || '',
            nhomVatTu: loaiVatTu,
            giaHienHanh: cItem.unitPrice || 0,
            loaiVatTu,
            originalRaw: cItem
          });
        }
      });

      return catalogList;
    } catch (e) {
      console.error('Lỗi khi tải Master Catalog trong MaterialMatchingService:', e);
      return [];
    }
  }

  /**
   * Core Business Logic: Match OCR material name against Master Catalog of selected material category
   */
  static matchItem(ocrName: string, catalog: MasterCatalogItem[]): MaterialMatchResult {
    if (!ocrName || !ocrName.trim()) {
      return {
        matched: false,
        confidence: 0,
        matchMethod: 'none',
        matchedMaterialId: null,
        matchedName: null,
        unit: null,
        unitPrice: 0,
        originalOcrName: ocrName || '',
        statusMessage: 'Tên vật tư rỗng'
      };
    }

    if (!catalog || catalog.length === 0) {
      return {
        matched: false,
        confidence: 0,
        matchMethod: 'none',
        matchedMaterialId: null,
        matchedName: null,
        unit: null,
        unitPrice: 0,
        originalOcrName: ocrName,
        statusMessage: 'Danh mục vật tư trống'
      };
    }

    const rawClean = cleanMaterialName(ocrName);

    // ----------------------------------------------------
    // STEP 0: SAVED ALIAS MATCH (Confidence = 100)
    // ----------------------------------------------------
    const aliasMap = MaterialMatchingService.getAliasMappings();
    const savedAlias = aliasMap[rawClean];
    if (savedAlias) {
      const cat = catalog.find(
        c => c.id === savedAlias.matchedMaterialId || cleanMaterialName(c.tenVatTu) === cleanMaterialName(savedAlias.matchedName)
      );
      const finalName = cat ? cat.tenVatTu : savedAlias.matchedName;
      const finalUnit = cat ? cat.donVi : savedAlias.unit;
      const finalPrice = cat && cat.giaHienHanh > 0 ? cat.giaHienHanh : savedAlias.unitPrice;
      const finalId = cat ? cat.id : savedAlias.matchedMaterialId;

      return {
        matched: true,
        confidence: 100,
        matchMethod: 'alias',
        matchedMaterialId: finalId,
        matchedName: finalName,
        unit: finalUnit,
        unitPrice: finalPrice,
        originalOcrName: ocrName,
        catalogItem: cat || {
          id: finalId,
          tenVatTu: finalName,
          donVi: finalUnit,
          giaHienHanh: finalPrice,
          loaiVatTu: 'BeTong'
        },
        statusMessage: 'Khớp theo Tên viết tắt/Alias đã lưu (100%)'
      };
    }

    // ----------------------------------------------------
    // STEP 1: EXACT MATCH (Confidence = 100)
    // ----------------------------------------------------
    for (const cat of catalog) {
      const catClean = cleanMaterialName(cat.tenVatTu);
      if (catClean === rawClean) {
        return {
          matched: true,
          confidence: 100,
          matchMethod: 'exact',
          matchedMaterialId: cat.id,
          matchedName: cat.tenVatTu,
          unit: cat.donVi,
          unitPrice: cat.giaHienHanh,
          originalOcrName: ocrName,
          catalogItem: cat,
          statusMessage: 'Khớp chính xác (100%)'
        };
      }
    }

    // ----------------------------------------------------
    // STEP 2: CODE / ALIAS MATCH (Confidence = 98)
    // ----------------------------------------------------
    for (const cat of catalog) {
      if (cat.maVatTu && cleanMaterialName(cat.maVatTu) === rawClean) {
        return {
          matched: true,
          confidence: 98,
          matchMethod: 'alias',
          matchedMaterialId: cat.id,
          matchedName: cat.tenVatTu,
          unit: cat.donVi,
          unitPrice: cat.giaHienHanh,
          originalOcrName: ocrName,
          catalogItem: cat,
          statusMessage: 'Khớp theo mã vật tư (98%)'
        };
      }
    }

    // ----------------------------------------------------
    // STEP 3: STEEL DIAMETER / CONCRETE GRADE MATCH (Confidence = 95)
    // Handles expressions: D6, D10, D12, D14, D16, D18, D20, Phi 6, Phi 10, Ø6, etc.
    // ----------------------------------------------------
    const ocrDiameter = extractDiameter(ocrName);
    const ocrGrade = extractConcreteGrade(ocrName);

    if (ocrDiameter !== null) {
      // Find catalog items that match the extracted diameter
      const diameterMatches: { cat: MasterCatalogItem; score: number }[] = [];

      for (const cat of catalog) {
        const catDiameter = extractDiameter(cat.tenVatTu);
        if (catDiameter === ocrDiameter) {
          let score = 95;

          const catClean = cleanMaterialName(cat.tenVatTu);
          // Check coil vs bar preference (cuộn vs cây/thanh)
          if (rawClean.includes('cuon') && catClean.includes('cuon')) {
            score += 3;
          } else if ((rawClean.includes('cay') || rawClean.includes('thanh')) && (catClean.includes('cay') || catClean.includes('thanh'))) {
            score += 3;
          }

          // Check steel brand or grade overlap (e.g. cb240t, cb300v, cb400v, hoa phat)
          if (rawClean.includes('cb240') && catClean.includes('cb240')) score += 1;
          if (rawClean.includes('cb300') && catClean.includes('cb300')) score += 1;
          if (rawClean.includes('cb400') && catClean.includes('cb400')) score += 1;
          if (rawClean.includes('hoa phat') && catClean.includes('hoa phat')) score += 1;

          diameterMatches.push({ cat, score: Math.min(score, 99) });
        }
      }

      if (diameterMatches.length > 0) {
        // Sort by highest score
        diameterMatches.sort((a, b) => b.score - a.score);
        const best = diameterMatches[0];

        return {
          matched: true,
          confidence: best.score,
          matchMethod: 'diameter_spec',
          matchedMaterialId: best.cat.id,
          matchedName: best.cat.tenVatTu,
          unit: best.cat.donVi,
          unitPrice: best.cat.giaHienHanh,
          originalOcrName: ocrName,
          catalogItem: best.cat,
          statusMessage: `Khớp theo đường kính D${ocrDiameter} (${best.score}%)`
        };
      }
    }

    if (ocrGrade !== null) {
      // Concrete Grade matching
      const gradeMatches: { cat: MasterCatalogItem; score: number }[] = [];

      for (const cat of catalog) {
        const catGrade = extractConcreteGrade(cat.tenVatTu);
        if (catGrade === ocrGrade) {
          gradeMatches.push({ cat, score: 95 });
        }
      }

      if (gradeMatches.length > 0) {
        const best = gradeMatches[0];
        return {
          matched: true,
          confidence: best.score,
          matchMethod: 'diameter_spec',
          matchedMaterialId: best.cat.id,
          matchedName: best.cat.tenVatTu,
          unit: best.cat.donVi,
          unitPrice: best.cat.giaHienHanh,
          originalOcrName: ocrName,
          catalogItem: best.cat,
          statusMessage: `Khớp theo mác bê tông M${ocrGrade} (${best.score}%)`
        };
      }
    }

    // ----------------------------------------------------
    // STEP 4: TOKEN OVERLAP & FUZZY MATCH
    // ----------------------------------------------------
    let bestCat: MasterCatalogItem | null = null;
    let maxConfidence = 0;

    const ocrTokens = rawClean.split(' ').filter(t => t.length > 1);

    for (const cat of catalog) {
      const catClean = cleanMaterialName(cat.tenVatTu);
      const catTokens = catClean.split(' ').filter(t => t.length > 1);

      if (ocrTokens.length === 0 || catTokens.length === 0) continue;

      let matchCount = 0;
      ocrTokens.forEach(tok => {
        if (catTokens.includes(tok)) matchCount++;
      });

      const tokenRatio = matchCount / Math.max(ocrTokens.length, catTokens.length);
      const calculatedConfidence = Math.round(tokenRatio * 100);

      if (calculatedConfidence > maxConfidence) {
        maxConfidence = calculatedConfidence;
        bestCat = cat;
      }
    }

    // ----------------------------------------------------
    // STEP 5: EVALUATE CONFIDENCE THRESHOLDS
    // >= 90%  -> AUTO MATCH
    // 70-89%  -> SUGGESTED / PROPOSED (requires confirmation)
    // < 70%   -> UNMATCHED
    // ----------------------------------------------------
    if (bestCat && maxConfidence >= 90) {
      return {
        matched: true,
        confidence: maxConfidence,
        matchMethod: 'fuzzy',
        matchedMaterialId: bestCat.id,
        matchedName: bestCat.tenVatTu,
        unit: bestCat.donVi,
        unitPrice: bestCat.giaHienHanh,
        originalOcrName: ocrName,
        catalogItem: bestCat,
        statusMessage: `Tự động khớp (${maxConfidence}%)`
      };
    } else if (bestCat && maxConfidence >= 70) {
      return {
        matched: false, // Not auto matched
        confidence: maxConfidence,
        matchMethod: 'fuzzy',
        matchedMaterialId: bestCat.id,
        matchedName: bestCat.tenVatTu,
        unit: bestCat.donVi,
        unitPrice: bestCat.giaHienHanh,
        originalOcrName: ocrName,
        catalogItem: bestCat,
        statusMessage: `Đề xuất vật tư (${maxConfidence}%)`
      };
    }

    // Unmatched (< 70%)
    return {
      matched: false,
      confidence: maxConfidence,
      matchMethod: 'none',
      matchedMaterialId: null,
      matchedName: null,
      unit: null,
      unitPrice: 0,
      originalOcrName: ocrName,
      statusMessage: 'Chưa tìm thấy vật tư phù hợp trong Danh mục'
    };
  }

  /**
   * Sync/update post-fill edited material data back to Master Data
   */
  static async syncEditedItemToCatalog(
    loaiVatTu: string = 'BeTong',
    itemData: {
      id?: string;
      name: string;
      unit: string;
      quyCach?: string;
      unitPrice: number;
      maVatTu?: string;
    }
  ): Promise<boolean> {
    try {
      const activeLoai = loaiVatTu || 'BeTong';
      const res = await MaterialService.addOrUpdateMaterialInCatalog(activeLoai, {
        id: itemData.id,
        name: itemData.name,
        unit: itemData.unit,
        unitPrice: Number(itemData.unitPrice) || 0,
        specification: itemData.quyCach
      });
      return res.success;
    } catch (e) {
      console.error('Lỗi syncEditedItemToCatalog:', e);
      return false;
    }
  }

  /**
   * Create or retrieve a material in Master Catalog (with duplicate check)
   * Ensures material is persisted to BOTH `cauHinh/materialItems/${activeLoai}` and `materialPrices/${activeLoai}`
   */
  static async addNewMaterialToCatalog(
    loaiVatTu: string = 'BeTong',
    newItemData: {
      name: string;
      unit: string;
      quyCach?: string;
      unitPrice: number;
      maVatTu?: string;
    }
  ): Promise<MasterCatalogItem | null> {
    try {
      const activeLoai = loaiVatTu || 'BeTong';
      const todayStr = new Date().toISOString().split('T')[0];
      const nameTrim = newItemData.name.trim();
      const unitTrim = newItemData.unit.trim();
      const specTrim = (newItemData.quyCach || '').trim();
      const priceNum = Number(newItemData.unitPrice) || 0;

      const cleanNew = cleanMaterialName(nameTrim);
      const db = getDB();

      // 1. Check existing in cauHinh/materialItems & materialCache
      await materialCache.ensureLoaded();
      const cachedMasterItems = materialCache.getMasterItems(activeLoai) || [];
      const foundMaster = cachedMasterItems.find((it: any) => 
        cleanMaterialName(it.name) === cleanNew || (newItemData.maVatTu && it.id === newItemData.maVatTu)
      );

      let targetItemId = foundMaster ? foundMaster.id : (newItemData.maVatTu || `mat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

      // 2. Prepare master item data for cauHinh/materialItems/${activeLoai}/${targetItemId}
      const itemData = {
        id: targetItemId,
        name: nameTrim,
        unit: unitTrim,
        specification: specTrim,
        unitPrice: priceNum,
        updatedAt: Date.now()
      };

      // 3. Persist to Realtime Database: cauHinh/materialItems & materialCatalog
      if (db) {
        try {
          const itemRef = ref(db, `cauHinh/materialItems/${activeLoai}/${targetItemId}`);
          await set(itemRef, itemData);

          const catalogRef = ref(db, `materialCatalog/${targetItemId}`);
          await set(catalogRef, {
            materialId: targetItemId,
            materialTypeId: activeLoai,
            name: nameTrim,
            unit: unitTrim,
            specification: specTrim,
            unitPrice: priceNum,
            updatedAt: Date.now()
          });
        } catch (err) {
          console.warn('Lỗi ghi cauHinh/materialItems:', err);
        }
      }

      // 4. Update in-memory materialCache immediately
      materialCache.addOrUpdateMasterItem(activeLoai, itemData);

      // 5. ALSO update materialPrices/${activeLoai}
      const existingPrices = await MaterialService.getDanhSachVatTu(activeLoai) || [];
      let list: any[] = Array.isArray(existingPrices) ? existingPrices : (existingPrices.vatTu || []);

      const existingIdx = list.findIndex((it: any) => {
        const itemClean = cleanMaterialName(it.tenVatTu || it.name || '');
        const codeClean = cleanMaterialName(it.maVatTu || it.id || '');
        return itemClean === cleanNew || codeClean === cleanMaterialName(targetItemId);
      });

      if (existingIdx >= 0) {
        const existing = { ...list[existingIdx] };
        existing.tenVatTu = nameTrim;
        if (unitTrim) existing.donVi = unitTrim;
        if (specTrim) existing.quyCach = specTrim;

        if (priceNum > 0) {
          if (!existing.gia || typeof existing.gia !== 'object') existing.gia = {};
          existing.gia[todayStr] = priceNum;
        }

        list[existingIdx] = existing;
      } else {
        const newRecord = {
          id: targetItemId,
          maVatTu: targetItemId,
          tenVatTu: nameTrim,
          donVi: unitTrim,
          quyCach: specTrim,
          nhomVatTu: activeLoai,
          gia: { [todayStr]: priceNum }
        };
        list.push(newRecord);
      }

      await MaterialService.savePriceData(activeLoai, { vatTu: list });

      return {
        id: targetItemId,
        maVatTu: targetItemId,
        tenVatTu: nameTrim,
        donVi: unitTrim,
        quyCach: specTrim,
        nhomVatTu: activeLoai,
        giaHienHanh: priceNum,
        loaiVatTu: activeLoai,
        originalRaw: itemData
      };
    } catch (e) {
      console.error('Lỗi addNewMaterialToCatalog:', e);
      return null;
    }
  }
}
