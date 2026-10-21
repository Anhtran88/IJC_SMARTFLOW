import { materialPricesRTRepository } from '../data/repositories/rtdb/MaterialPricesRTRepository';
import { priceDateOptionsRTRepository } from '../data/repositories/rtdb/PriceDateOptionsRTRepository';
import { materialCache } from './MaterialCache';
import { getDB } from '../lib/firebaseService';
import { ref, set, get, update } from 'firebase/database';

function extractPrice(m: any): number {
  if (!m) return 0;
  if (typeof m.unitPrice === 'number' && m.unitPrice > 0) return m.unitPrice;
  if (typeof m.giaGoc === 'number' && m.giaGoc > 0) return m.giaGoc;
  if (typeof m.gia === 'number' && m.gia > 0) return m.gia;
  if (m.gia && typeof m.gia === 'object') {
    if (Number(m.gia.giaGoc) > 0) return Number(m.gia.giaGoc);
    const giaGocKey = Object.keys(m.gia).find(k => k.startsWith('giaGoc'));
    if (giaGocKey && Number(m.gia[giaGocKey]) > 0) return Number(m.gia[giaGocKey]);
    for (const key of Object.keys(m.gia)) {
      const num = Number(m.gia[key]);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  const direct = Number(m.unitPrice || m.giaGoc || m.gia);
  return (!isNaN(direct) && direct > 0) ? direct : 0;
}

export class MaterialService {
  /**
   * Get unified material list for a category.
   * Merges Master Items (cauHinh/materialItems/${loaiVatTu}) and historical prices (materialPrices/${loaiVatTu}).
   * Every item is guaranteed to have tenVatTu, name, donVi, unit, unitPrice, gia, quyCach, specification.
   */
  static async getDanhSachVatTu(loaiVatTu: string = 'BeTong'): Promise<any> {
    try {
      const activeLoai = loaiVatTu || 'BeTong';
      await materialCache.ensureLoaded();

      // 1. Master Items from Quản lý vật tư (cauHinh/materialItems)
      let masterItems = materialCache.getMasterItems(activeLoai) || [];

      // If masterItems is empty in cache, attempt direct fetch from Firebase RTDB
      if (masterItems.length === 0) {
        const db = getDB();
        if (db) {
          try {
            const snap = await get(ref(db, `cauHinh/materialItems/${activeLoai}`));
            if (snap.exists()) {
              const val = snap.val();
              const list: any[] = [];
              Object.keys(val || {}).forEach(k => {
                const item = val[k];
                if (item && item.name) {
                  list.push({
                    id: k,
                    name: item.name,
                    unit: item.unit || 'm3',
                    specification: item.specification || '',
                    unitPrice: Number(item.unitPrice || 0),
                    updatedAt: item.updatedAt
                  });
                }
              });
              if (list.length > 0) {
                masterItems = list;
              }
            }
          } catch (fetchErr) {
            console.warn('Lỗi get trực tiếp cauHinh/materialItems:', fetchErr);
          }
        }
      }

      // 2. Historical Prices from materialPrices
      let rtdbPrices: any[] = [];
      const cachedPrices = materialCache.getMaterialPrices(activeLoai);
      if (cachedPrices && cachedPrices.length > 0) {
        rtdbPrices = cachedPrices;
      } else {
        const fromRepo = await materialPricesRTRepository.getMaterialPrices(activeLoai);
        if (Array.isArray(fromRepo)) {
          rtdbPrices = fromRepo;
        } else if (fromRepo && fromRepo.vatTu) {
          rtdbPrices = fromRepo.vatTu;
        } else if (fromRepo && typeof fromRepo === 'object') {
          rtdbPrices = Object.values(fromRepo);
        }
      }

      // 3. Build unified list with masterItems taking precedence for standard name, unit, and price
      const unifiedList: any[] = [];
      const seenCleanNames = new Set<string>();

      masterItems.forEach((mItem: any) => {
        const rawName = (mItem.name || mItem.tenVatTu || '').trim();
        if (!rawName) return;
        const clean = rawName.toLowerCase().replace(/\s+/g, ' ');
        seenCleanNames.add(clean);

        // Find matching item in rtdbPrices if any
        const matchedPrice = rtdbPrices.find((p: any) => {
          const pName = (p.tenVatTu || p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          return pName === clean || (p.id && p.id === mItem.id);
        });

        const giaObj: Record<string, number> = matchedPrice?.gia && typeof matchedPrice.gia === 'object'
          ? { ...matchedPrice.gia }
          : {};

        const directPrice = Number(mItem.unitPrice || 0);
        if (directPrice > 0) {
          giaObj.giaGoc = directPrice;
        } else if (matchedPrice) {
          const pr = extractPrice(matchedPrice);
          if (pr > 0 && !giaObj.giaGoc) giaObj.giaGoc = pr;
        }

        const effectivePrice = directPrice > 0 ? directPrice : (matchedPrice ? extractPrice(matchedPrice) : 0);

        unifiedList.push({
          id: mItem.id,
          maVatTu: mItem.maVatTu || mItem.id,
          tenVatTu: rawName,
          name: rawName,
          donVi: mItem.unit || mItem.donVi || 'm3',
          unit: mItem.unit || mItem.donVi || 'm3',
          quyCach: mItem.specification || mItem.quyCach || '',
          specification: mItem.specification || mItem.quyCach || '',
          unitPrice: effectivePrice,
          gia: giaObj,
          nhomVatTu: activeLoai,
          loaiVatTu: activeLoai
        });
      });

      // Add remaining items from rtdbPrices that were not in cauHinh/materialItems
      rtdbPrices.forEach((pItem: any) => {
        const rawName = (pItem.tenVatTu || pItem.name || '').trim();
        if (!rawName) return;
        const clean = rawName.toLowerCase().replace(/\s+/g, ' ');
        if (!seenCleanNames.has(clean)) {
          seenCleanNames.add(clean);
          const prc = extractPrice(pItem);
          const giaObj = pItem.gia && typeof pItem.gia === 'object' ? { ...pItem.gia } : {};
          if (prc > 0 && !giaObj.giaGoc) giaObj.giaGoc = prc;

          unifiedList.push({
            id: pItem.id || `vt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            maVatTu: pItem.maVatTu || pItem.id || '',
            tenVatTu: rawName,
            name: rawName,
            donVi: pItem.donVi || pItem.unit || 'm3',
            unit: pItem.donVi || pItem.unit || 'm3',
            quyCach: pItem.quyCach || pItem.specification || '',
            specification: pItem.quyCach || pItem.specification || '',
            unitPrice: prc,
            gia: giaObj,
            nhomVatTu: pItem.nhomVatTu || activeLoai,
            loaiVatTu: activeLoai
          });
        }
      });

      return unifiedList;
    } catch (e) {
      console.error('MaterialService.getDanhSachVatTu failed:', e);
      return [];
    }
  }

  /**
   * Directly add or update a material into Master Catalog from BM02.
   * Writes to:
   * 1. cauHinh/materialItems/${loaiVatTu}/${itemId}
   * 2. materialCatalog/${itemId}
   * 3. materialPrices/${loaiVatTu}
   * 4. Updates in-memory MaterialCache immediately
   */
  static async addOrUpdateMaterialInCatalog(
    loaiVatTu: string,
    material: {
      id?: string;
      name: string;
      unit: string;
      unitPrice: number;
      specification?: string;
    }
  ): Promise<{ success: boolean; item: any }> {
    try {
      const activeLoai = loaiVatTu || 'BeTong';
      const nameTrim = (material.name || '').trim();
      const unitTrim = (material.unit || 'm3').trim();
      const priceNum = Number(material.unitPrice) || 0;
      const specTrim = (material.specification || '').trim();
      const cleanName = nameTrim.toLowerCase().replace(/\s+/g, ' ');

      if (!nameTrim) throw new Error('Tên vật tư không được để trống');

      const db = getDB();
      await materialCache.ensureLoaded();

      // Check if item already exists in master items
      const existingMaster = materialCache.getMasterItems(activeLoai) || [];
      const found = existingMaster.find(it => 
        (material.id && it.id === material.id) ||
        (it.name && it.name.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName)
      );

      const targetId = found?.id || material.id || `mat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const now = Date.now();

      const itemData = {
        id: targetId,
        name: nameTrim,
        unit: unitTrim,
        specification: specTrim,
        unitPrice: priceNum,
        updatedAt: now
      };

      if (db) {
        // 1. Update cauHinh/materialItems/${activeLoai}/${targetId}
        const itemRef = ref(db, `cauHinh/materialItems/${activeLoai}/${targetId}`);
        await set(itemRef, itemData);

        // 2. Update materialCatalog/${targetId}
        const catRef = ref(db, `materialCatalog/${targetId}`);
        await set(catRef, {
          materialId: targetId,
          materialTypeId: activeLoai,
          name: nameTrim,
          unit: unitTrim,
          specification: specTrim,
          unitPrice: priceNum,
          updatedAt: now
        });

        // 3. Update materialPrices/${activeLoai}
        try {
          const pricesSnap = await get(ref(db, `materialPrices/${activeLoai}`));
          let pricesList: any[] = [];
          if (pricesSnap.exists()) {
            const raw = pricesSnap.val();
            if (Array.isArray(raw)) pricesList = raw;
            else if (raw && raw.vatTu) pricesList = raw.vatTu;
            else if (raw && typeof raw === 'object') pricesList = Object.values(raw);
          }

          const priceIdx = pricesList.findIndex((p: any) => 
            (p.id && p.id === targetId) ||
            ((p.tenVatTu || p.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === cleanName)
          );

          const todayStr = new Date().toISOString().split('T')[0];
          if (priceIdx >= 0) {
            const cur = { ...pricesList[priceIdx] };
            cur.tenVatTu = nameTrim;
            cur.name = nameTrim;
            cur.donVi = unitTrim;
            cur.unit = unitTrim;
            cur.unitPrice = priceNum;
            if (!cur.gia || typeof cur.gia !== 'object') cur.gia = {};
            cur.gia.giaGoc = priceNum;
            cur.gia[todayStr] = priceNum;
            pricesList[priceIdx] = cur;
          } else {
            pricesList.push({
              id: targetId,
              maVatTu: targetId,
              tenVatTu: nameTrim,
              name: nameTrim,
              donVi: unitTrim,
              unit: unitTrim,
              quyCach: specTrim,
              unitPrice: priceNum,
              gia: { giaGoc: priceNum, [todayStr]: priceNum },
              nhomVatTu: activeLoai
            });
          }

          await set(ref(db, `materialPrices/${activeLoai}`), pricesList);
        } catch (priceErr) {
          console.warn('Lỗi cập nhật node materialPrices:', priceErr);
        }
      }

      // 4. Update in-memory MaterialCache
      materialCache.addOrUpdateMasterItem(activeLoai, itemData);
      materialCache.updateLocalMasterPrice(activeLoai, targetId, priceNum);

      return {
        success: true,
        item: {
          ...itemData,
          tenVatTu: nameTrim,
          donVi: unitTrim,
          quyCach: specTrim,
          gia: { giaGoc: priceNum },
          nhomVatTu: activeLoai,
          loaiVatTu: activeLoai
        }
      };
    } catch (err: any) {
      console.error('MaterialService.addOrUpdateMaterialInCatalog failed:', err);
      return { success: false, item: null };
    }
  }

  static async getDanhSachNgay(loaiVatTu: string = 'BeTong'): Promise<any> {
    try {
      return await priceDateOptionsRTRepository.getPriceDateOptions(loaiVatTu);
    } catch (e) {
      console.error('MaterialService.getDanhSachNgay failed:', e);
      return null;
    }
  }

  static async savePriceData(loaiVatTu: string, data: { vatTu?: any[]; cotNgay?: any[] }): Promise<boolean> {
    try {
      if (data.vatTu) {
        await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, data.vatTu);
      }
      if (data.cotNgay) {
        await priceDateOptionsRTRepository.savePriceDateOptions(loaiVatTu, data.cotNgay);
      }
      return true;
    } catch (e) {
      console.error('MaterialService.savePriceData failed:', e);
      return false;
    }
  }

  static async importGiaGoc(loaiVatTu: string, data: { danhSach: any[]; ngay: string }): Promise<boolean> {
    try {
      const existing = await materialPricesRTRepository.getMaterialPrices(loaiVatTu) || [];
      const newPrices = data.danhSach.map((item: any) => ({
        id: Math.random().toString(36).substring(2, 11),
        tenVatTu: item.tenVatTu,
        donVi: item.donVi,
        gia: { [data.ngay]: item.giaGoc }
      }));
      await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, [...existing, ...newPrices]);

      const existingDates = await priceDateOptionsRTRepository.getPriceDateOptions(loaiVatTu) || [];
      if (!existingDates.some((d: any) => d.value === data.ngay)) {
        await priceDateOptionsRTRepository.savePriceDateOptions(loaiVatTu, [...existingDates, { value: data.ngay, label: data.ngay }]);
      }
      return true;
    } catch (e) {
      console.error('MaterialService.importGiaGoc failed:', e);
      return false;
    }
  }

  static async capNhatGia(loaiVatTu: string, data: { ngay: string; danhSachGia: any[]; tenFile?: string }): Promise<{ success: boolean; updatedCount: number } | null> {
    try {
      const allVatTu = await materialPricesRTRepository.getMaterialPrices(loaiVatTu) || [];
      data.danhSachGia.forEach((update: any) => {
        const item = allVatTu.find((v: any) => v.tenVatTu === update.tenVatTu);
        if (item) {
          item.gia = { ...item.gia, [data.ngay]: update.giaMoi };
        }
      });
      await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, allVatTu);

      const dates = await priceDateOptionsRTRepository.getPriceDateOptions(loaiVatTu) || [];
      if (!dates.some((d: any) => d.value === data.ngay)) {
        await priceDateOptionsRTRepository.savePriceDateOptions(loaiVatTu, [...dates, { value: data.ngay, label: data.ngay }]);
      }
      return { success: true, updatedCount: data.danhSachGia.length };
    } catch (e) {
      console.error('MaterialService.capNhatGia failed:', e);
      return null;
    }
  }

  static async updateVatTuPrice(loaiVatTu: string, data: { id: string; cotGia: string; giaMoi: number }): Promise<boolean> {
    try {
      const list = await materialPricesRTRepository.getMaterialPrices(loaiVatTu) || [];
      const vt = list.find((v: any) => v.id === data.id);
      if (vt) {
        vt.gia = { ...vt.gia, [data.cotGia]: data.giaMoi };
        await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, list);
      }
      return true;
    } catch (e) {
      console.error('MaterialService.updateVatTuPrice failed:', e);
      return false;
    }
  }

  static async deleteVatTu(loaiVatTu: string, id: string): Promise<boolean> {
    try {
      const listDel = await materialPricesRTRepository.getMaterialPrices(loaiVatTu) || [];
      const filtered = listDel.filter((v: any) => v.id !== id);
      await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, filtered);
      return true;
    } catch (e) {
      console.error('MaterialService.deleteVatTu failed:', e);
      return false;
    }
  }

  static async deleteNgayGia(loaiVatTu: string, ngay: string): Promise<boolean> {
    try {
      const allVatTuForDel = await materialPricesRTRepository.getMaterialPrices(loaiVatTu) || [];
      allVatTuForDel.forEach((item: any) => {
        if (item.gia && item.gia[ngay] !== undefined) {
          delete item.gia[ngay];
        }
      });
      await materialPricesRTRepository.saveMaterialPrices(loaiVatTu, allVatTuForDel);

      const existingDateOpts = await priceDateOptionsRTRepository.getPriceDateOptions(loaiVatTu) || [];
      const newDateOpts = existingDateOpts.filter((d: any) => d.value !== ngay);
      await priceDateOptionsRTRepository.savePriceDateOptions(loaiVatTu, newDateOpts);
      return true;
    } catch (e) {
      console.error('MaterialService.deleteNgayGia failed:', e);
      return false;
    }
  }
}
