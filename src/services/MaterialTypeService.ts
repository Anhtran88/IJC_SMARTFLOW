import { firebaseAPI, getMaterialTypeConfig, saveMaterialTypeConfig } from '../lib/firebaseService';
import { MaterialType, LOAI_VAT_TU_MAC_DINH } from '../../types';
import { GET_FALLBACK_MATERIAL_CONFIG } from '../components/MaterialContentConfigModal';

export class MaterialTypeService {
  static async getMaterialTypes(): Promise<MaterialType[]> {
    try {
      const data = await firebaseAPI.getCauHinh('materialTypes');
      let list: MaterialType[] = [];
      if (Array.isArray(data)) {
        list = data.filter(Boolean);
      } else if (data && typeof data === 'object') {
        list = Object.values(data);
      }
      
      if (list && list.length > 0) {
        // Sắp xếp danh sách theo sortOrder tăng dần (nếu chưa có sortOrder thì xếp theo vị trí tự nhiên)
        return list.sort((a, b) => {
          const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
          const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
          if (orderA !== orderB) return orderA - orderB;
          return 0;
        });
      }
      return LOAI_VAT_TU_MAC_DINH;
    } catch (e) {
      console.error('MaterialTypeService.getMaterialTypes failed:', e);
      return LOAI_VAT_TU_MAC_DINH;
    }
  }

  static async saveMaterialTypes(list: MaterialType[]): Promise<boolean> {
    try {
      // Chuẩn hóa và gán sortOrder theo đúng thứ tự mảng hiện tại
      const normalizedList = list.map((item, index) => ({
        ...item,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index
      }));
      await firebaseAPI.saveCauHinh('materialTypes', normalizedList);
      return true;
    } catch (e) {
      console.error('MaterialTypeService.saveMaterialTypes failed:', e);
      return false;
    }
  }

  static async getMaterialTypeConfig(id: string): Promise<any> {
    try {
      return await getMaterialTypeConfig(id);
    } catch (e) {
      console.error('MaterialTypeService.getMaterialTypeConfig failed:', e);
      return null;
    }
  }

  static async saveMaterialTypeConfig(id: string, config: any): Promise<boolean> {
    try {
      await saveMaterialTypeConfig(id, config);
      return true;
    } catch (e) {
      console.error('MaterialTypeService.saveMaterialTypeConfig failed:', e);
      return false;
    }
  }

  static async damBaoCauHinhVatTuFirebase(list: MaterialType[]): Promise<void> {
    try {
      for (const vatTu of list) {
        const existing = await getMaterialTypeConfig(vatTu.id);
        if (!existing) {
          const fallback = GET_FALLBACK_MATERIAL_CONFIG(vatTu.id, vatTu.ten);
          await saveMaterialTypeConfig(vatTu.id, fallback);
        }
      }
    } catch (e) {
      console.error('MaterialTypeService.damBaoCauHinhVatTuFirebase failed:', e);
    }
  }
}
