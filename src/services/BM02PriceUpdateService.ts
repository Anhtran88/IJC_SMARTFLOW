import { push } from 'firebase/database';
import { getDB, safeRef, safeUpdate, safeSet, get, logActivity } from '../lib/firebaseService';
import { LineItem, FormData } from '../../types';
import { numberToVietnameseWords } from '../utils/numberToWords';
import { materialCache } from './MaterialCache';
import { MaterialService } from './MaterialService';

export interface BM02ItemPriceChange {
  typeId: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  oldPrice: number;
  newPrice: number;
  unit?: string;
  rowId?: string;
}

export interface PriceChangeContext {
  currentUser?: { username?: string; role?: string; email?: string; [key: string]: any } | null;
  projectId?: string;
  projectName?: string;
  unitId?: string;
  docId?: string;
  loaiVatTu?: string;
}

export interface PriceChangeLogEntry {
  id?: string;
  thoiGian: number;
  user: string;
  duAn: string;
  can: string;
  maPhieu: string;
  tenVatTu: string;
  maVatTu: string;
  giaCu: number;
  giaMoi: number;
  hanhDong: string;
  nguon: string;
}

export function extractPriceFromMaterial(m: any): number {
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
  const directNum = Number(m.unitPrice || m.giaGoc || m.gia);
  return (!isNaN(directNum) && directNum > 0) ? directNum : 0;
}

export class BM02PriceUpdateService {
  /**
   * Detects if any items in the provided list have unit prices defined.
   */
  static detectPriceChanged(items: LineItem[]): boolean {
    if (!items || items.length === 0) return false;
    return items.some(it => (Number(it.unitPrice) || 0) > 0);
  }

  /**
   * Recalculates line totals, subTotal, VAT, and grand totals for a BM02 form data object.
   * Ensures instant, consistent real-time mathematical calculations upon price edit.
   */
  static recalculateBM02Totals(bm02Data: FormData | any): FormData | any {
    const items = bm02Data.items || [];
    const processedItems = items.map((it: any, idx: number) => {
      const uPrice = Number(it.unitPrice) || 0;
      const qty = Number(it.quantity) || 0;
      const lTotal = Math.round(qty * uPrice * 100) / 100;
      return {
        ...it,
        stt: idx + 1,
        quantity: qty,
        unitPrice: uPrice,
        lineTotal: lTotal,
        total: lTotal
      };
    });

    const rawTotalAmount = processedItems.reduce((acc: number, it: any) => acc + (it.lineTotal || 0), 0);
    const calculatedTotalAmount = Math.round(rawTotalAmount);
    const taxRateValue = bm02Data.taxRate !== undefined ? Number(bm02Data.taxRate) : 10;
    const showVatValue = bm02Data.showVat ?? bm02Data.showVAT ?? bm02Data.vatSnapshot?.showVAT ?? false;

    let subTotalValue = calculatedTotalAmount;
    let vatAmountValue = showVatValue ? Math.round((subTotalValue * taxRateValue) / 100) : 0;
    let totalAmountWithVatValue = showVatValue ? (subTotalValue + vatAmountValue) : calculatedTotalAmount;

    const vatSnapshot = {
      showVAT: showVatValue,
      showVat: showVatValue,
      vatPercent: taxRateValue,
      priceMode: "beforeTax" as const,
      subTotal: subTotalValue,
      vatAmount: vatAmountValue,
      grandTotal: totalAmountWithVatValue
    };

    return {
      ...bm02Data,
      items: processedItems,
      totalAmount: subTotalValue,
      taxRate: taxRateValue,
      taxAmount: vatAmountValue,
      totalWithTax: totalAmountWithVatValue,
      totalAmountWithVat: totalAmountWithVatValue,
      showVat: showVatValue,
      showVAT: showVatValue,
      isPostTax: false,
      soTienBangChu: bm02Data.isCustomSoTienBangChu ? bm02Data.soTienBangChu : numberToVietnameseWords(totalAmountWithVatValue),
      vatSnapshot
    };
  }

  /**
   * Compares prices in the BM02 list with Master Material Catalog.
   * Checks both `cauHinh/materialItems` and `materialPrices` nodes.
   * Returns a list of price changes where BM02 price differs from Master price.
   */
  static async compareWithMasterPrice(items: LineItem[], inMemoryPrices?: any): Promise<BM02ItemPriceChange[]> {
    try {
      const changedList: BM02ItemPriceChange[] = [];

      await materialCache.ensureLoaded();
      const masterData = materialCache.getAllMasterItemsCache();
      const pricesData = inMemoryPrices && Object.keys(inMemoryPrices).length > 0
        ? inMemoryPrices
        : materialCache.getAllPricesCache();

      const findInMaster = (data: any, cleanName: string): { price: number; typeId: string; itemId: string; itemCode: string } | null => {
        if (!data || !cleanName) return null;

        if (Array.isArray(data)) {
          for (let i = 0; i < data.length; i++) {
            const m = data[i];
            if (m && (m.tenVatTu || m.name)) {
              const mName = (m.tenVatTu || m.name).trim().toLowerCase().replace(/\s+/g, ' ');
              if (mName === cleanName) {
                const prc = extractPriceFromMaterial(m);
                return {
                  price: prc,
                  typeId: 'default',
                  itemId: m.id || m.maVatTu || `item_${i}`,
                  itemCode: m.id || m.maVatTu || ''
                };
              }
            } else if (m && typeof m === 'object') {
              const res = findInMaster(m, cleanName);
              if (res) return res;
            }
          }
        } else if (typeof data === 'object') {
          for (const key of Object.keys(data)) {
            const val = data[key];
            if (val && (val.tenVatTu || val.name)) {
              const mName = (val.tenVatTu || val.name).trim().toLowerCase().replace(/\s+/g, ' ');
              if (mName === cleanName) {
                const prc = extractPriceFromMaterial(val);
                return {
                  price: prc,
                  typeId: key,
                  itemId: val.id || val.maVatTu || key,
                  itemCode: val.id || val.maVatTu || key
                };
              }
            } else if (val && typeof val === 'object') {
              const res = findInMaster(val, cleanName);
              if (res) {
                if (res.typeId === 'default') res.typeId = key;
                return res;
              }
            }
          }
        }
        return null;
      };

      (items || []).forEach((rowItem) => {
        const cleanName = (rowItem.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const currentBm02Price = Number(rowItem.unitPrice) || 0;
        if (!cleanName || currentBm02Price <= 0) return;

        let matchedMasterPrice = 0;
        let matchedTypeId = '';
        let matchedItemId = '';
        let matchedItemCode = '';

        // Check cauHinh/materialItems first
        if (masterData && typeof masterData === 'object') {
          for (const typeId of Object.keys(masterData)) {
            const typeItems = masterData[typeId];
            if (typeItems && typeof typeItems === 'object') {
              for (const itemId of Object.keys(typeItems)) {
                const item = typeItems[itemId];
                if (item && item.name && item.name.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName) {
                  matchedMasterPrice = Number(item.unitPrice) || 0;
                  matchedTypeId = typeId;
                  matchedItemId = itemId;
                  matchedItemCode = itemId;
                  break;
                }
              }
            }
            if (matchedMasterPrice > 0) break;
          }
        }

        // Check materialPrices if not matched yet
        if (matchedMasterPrice === 0 && pricesData) {
          const found = findInMaster(pricesData, cleanName);
          if (found) {
            matchedMasterPrice = found.price;
            matchedTypeId = found.typeId;
            matchedItemId = found.itemId;
            matchedItemCode = found.itemCode;
          }
        }

        if (matchedMasterPrice > 0 && matchedMasterPrice !== currentBm02Price) {
          if (!changedList.some(c => c.itemName.trim().toLowerCase().replace(/\s+/g, ' ') === cleanName)) {
            changedList.push({
              typeId: matchedTypeId || 'default',
              itemId: matchedItemId || 'itm',
              itemName: rowItem.name,
              itemCode: matchedItemCode,
              oldPrice: matchedMasterPrice,
              newPrice: currentBm02Price,
              unit: rowItem.unit,
              rowId: rowItem.id
            });
          }
        }
      });

      return changedList;
    } catch (err) {
      console.error('Lỗi khi so sánh đơn giá với danh mục chính:', err);
      return [];
    }
  }

  /**
   * Updates Master Material Catalog in Firebase for each item in priceChanges list.
   * Updates both `cauHinh/materialItems` and `materialPrices` nodes.
   */
  static async updateMaterialMaster(priceChanges: BM02ItemPriceChange[]): Promise<boolean> {
    if (!priceChanges || priceChanges.length === 0) return false;

    try {
      const activeDefaultLoai = (window as any)._loaiVatTuHienTai || 'BeTong';

      for (const item of priceChanges) {
        const typeToUse = (item.typeId && item.typeId !== 'default') ? item.typeId : activeDefaultLoai;
        await MaterialService.addOrUpdateMaterialInCatalog(typeToUse, {
          id: item.itemId,
          name: item.itemName,
          unit: item.unit || 'm3',
          unitPrice: item.newPrice
        });
      }
      return true;
    } catch (err) {
      console.error('Lỗi cập nhật danh mục vật tư chính:', err);
      return false;
    }
  }

  /**
   * Refreshes material price state and cache across the application.
   */
  static async refreshMaterialCache(refreshCallbacks?: {
    loadMaterialPrices?: () => Promise<any>;
    reloadCatalog?: () => Promise<any>;
  }): Promise<void> {
    try {
      if (refreshCallbacks?.loadMaterialPrices) {
        await refreshCallbacks.loadMaterialPrices();
      }
      if (refreshCallbacks?.reloadCatalog) {
        await refreshCallbacks.reloadCatalog();
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialPricesUpdated'));
      }
    } catch (err) {
      console.error('Lỗi refresh material cache:', err);
    }
  }

  /**
   * Writes dedicated logs for unit price changes to Firebase under `logs/priceChangeLogs`.
   */
  static async writePriceChangeLog(
    priceChanges: BM02ItemPriceChange[],
    context: PriceChangeContext
  ): Promise<void> {
    const db = getDB();
    if (!db || !priceChanges || priceChanges.length === 0) return;

    const timestamp = Date.now();
    const userStr = context.currentUser?.username || context.currentUser?.email || 'khách';
    const projectStr = context.projectName || context.projectId || 'Dự án CHƯA TÊN';
    const unitStr = context.unitId || 'Căn';
    const docIdStr = context.docId || 'BM02';

    for (const item of priceChanges) {
      const logEntry: PriceChangeLogEntry = {
        thoiGian: timestamp,
        user: userStr,
        duAn: projectStr,
        can: unitStr,
        maPhieu: docIdStr,
        tenVatTu: item.itemName,
        maVatTu: item.itemId || item.itemCode || '',
        giaCu: item.oldPrice,
        giaMoi: item.newPrice,
        hanhDong: 'CAP_NHAT_GIA_TU_BM02',
        nguon: 'BM02'
      };

      try {
        const logsRef = safeRef(db, 'logs/priceChangeLogs');
        await push(logsRef, logEntry);
      } catch (err) {
        console.error('Lỗi lưu log thay đổi đơn giá:', err);
      }

      try {
        await logActivity(
          userStr,
          context.currentUser?.role || 'viewer',
          'UPDATE',
          'BM02',
          `Cập nhật đơn giá vật tư "${item.itemName}" từ BM02 (${docIdStr}): ${item.oldPrice.toLocaleString('vi-VN')} -> ${item.newPrice.toLocaleString('vi-VN')} đ`,
          item.itemId,
          null,
          {
            project: projectStr,
            unit: unitStr,
            docId: docIdStr,
            name: item.itemName,
            code: item.itemId,
            oldPrice: item.oldPrice,
            newPrice: item.newPrice,
            source: 'BM02'
          }
        );
      } catch (e) {
        // Ignore secondary audit log error
      }
    }
  }

  /**
   * Helper method for bulk price updates (Excel Quote import, Supplier Sync, AI update).
   */
  static async bulkUpdateMaterialPrices(
    updates: Array<{ typeId: string; itemId: string; newPrice: number; name?: string; oldPrice?: number }>,
    context: PriceChangeContext
  ): Promise<boolean> {
    const changes: BM02ItemPriceChange[] = updates.map(u => ({
      typeId: u.typeId,
      itemId: u.itemId,
      itemName: u.name || u.itemId,
      oldPrice: u.oldPrice || 0,
      newPrice: u.newPrice
    }));

    const success = await this.updateMaterialMaster(changes);
    if (success) {
      await this.writePriceChangeLog(changes, context);
    }
    return success;
  }
}
