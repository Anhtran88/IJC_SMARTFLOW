import { RTBaseRepository } from './RTBaseRepository';
import { removeUndefined } from '../../../lib/firebaseService';
import { extractMaPhieu } from '../../../utils/extractMaPhieu';

export class HistoryRTRepository extends RTBaseRepository<any> {
  constructor() {
    super('lichSu');
  }

  async fetchLichSu(loaiVatTu: string): Promise<any[]> {
    const data = await this.get(loaiVatTu);
    if (!data) return [];
    return Object.keys(data).map(key => ({
      ...data[key],
      id: key
    })).sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async fetchAllLichSu(): Promise<any[]> {
    const data = await this.get();
    if (!data) return [];
    const results: any[] = [];
    Object.keys(data).forEach(catKey => {
      const catData = data[catKey];
      if (catData && typeof catData === 'object') {
        Object.keys(catData).forEach(itemKey => {
          if (catData[itemKey] && typeof catData[itemKey] === 'object') {
            results.push({
              ...catData[itemKey],
              id: itemKey,
              loaiVatTu: catData[itemKey].loaiVatTu || catKey
            });
          }
        });
      }
    });
    return results.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async saveDonHang(loaiVatTu: string, data: any): Promise<any> {
    const id = data.id || Date.now().toString();
    const record = removeUndefined({
      ...data,
      id,
      updatedAt: Date.now()
    });
    await this.set(record, `${loaiVatTu}/${id}`);
    return record;
  }

  async deleteDonHang(loaiVatTu: string, id: string): Promise<boolean> {
    if (!id) return true;
    const cleanId = String(id).trim();
    const rawId = cleanId.replace(/^(BM02|BM06|BM03\.2)-/i, '');
    const idsToRemove = Array.from(new Set([cleanId, rawId, `BM02-${rawId}`, `BM06-${rawId}`, `BM03.2-${rawId}`]));

    for (const targetId of idsToRemove) {
      if (targetId) {
        await this.remove(`${loaiVatTu}/${targetId}`);
      }
    }

    try {
      const allData = await this.get();
      if (allData && typeof allData === 'object') {
        for (const catKey of Object.keys(allData)) {
          if (allData[catKey] && typeof allData[catKey] === 'object') {
            for (const itemKey of Object.keys(allData[catKey])) {
              const item = allData[catKey][itemKey];
              if (!item) continue;
              const itemCode = extractMaPhieu(item);
              const itemRawId = String(itemKey).replace(/^(BM02|BM06|BM03\.2)-/i, '');

              const matches = idsToRemove.some(tid => {
                if (!tid) return false;
                const lowerTid = tid.toLowerCase();
                return itemKey.toLowerCase() === lowerTid ||
                  itemRawId.toLowerCase() === lowerTid ||
                  (itemCode && itemCode.toLowerCase() === lowerTid) ||
                  (item.id && String(item.id).toLowerCase() === lowerTid) ||
                  (item.snapshotId && String(item.snapshotId).toLowerCase() === lowerTid) ||
                  (item.maPhieu && String(item.maPhieu).toLowerCase() === lowerTid);
              });

              if (matches) {
                await this.remove(`${catKey}/${itemKey}`);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi dọn dẹp thêm trong deleteDonHang:", e);
    }
    return true;
  }
}

export const historyRTRepository = new HistoryRTRepository();
