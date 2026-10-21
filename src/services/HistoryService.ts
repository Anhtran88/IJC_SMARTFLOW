import { historyRTRepository } from '../data/repositories/rtdb/HistoryRTRepository';

export class HistoryService {
  static async fetchLichSu(loaiVatTu: string = 'BeTong'): Promise<any[]> {
    try {
      return await historyRTRepository.fetchLichSu(loaiVatTu);
    } catch (e) {
      console.error('HistoryService.fetchLichSu failed:', e);
      return [];
    }
  }

  static async fetchAllLichSu(): Promise<any[]> {
    try {
      return await historyRTRepository.fetchAllLichSu();
    } catch (e) {
      console.error('HistoryService.fetchAllLichSu failed:', e);
      return [];
    }
  }

  static async saveDonHang(loaiVatTu: string, data: any): Promise<any> {
    try {
      return await historyRTRepository.saveDonHang(loaiVatTu, data);
    } catch (e) {
      console.error('HistoryService.saveDonHang failed:', e);
      return null;
    }
  }

  static async deleteDonHang(loaiVatTu: string, id: string): Promise<boolean> {
    try {
      return await historyRTRepository.deleteDonHang(loaiVatTu, id);
    } catch (e) {
      console.error('HistoryService.deleteDonHang failed:', e);
      return false;
    }
  }
}
