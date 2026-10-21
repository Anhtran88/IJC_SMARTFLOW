import { configRTRepository } from '../data/repositories/rtdb/ConfigRTRepository';
import { firebaseAPI } from '../lib/firebaseService';

export class ConfigService {
  static async getCauHinh(loaiVatTu: string = 'BeTong'): Promise<any> {
    try {
      return await configRTRepository.getCauHinh(loaiVatTu);
    } catch (e) {
      console.error('ConfigService.getCauHinh failed:', e);
      return null;
    }
  }

  static async saveCauHinh(loaiVatTu: string, data: any): Promise<boolean> {
    try {
      await configRTRepository.saveCauHinh(loaiVatTu, data);
      return true;
    } catch (e) {
      console.error('ConfigService.saveCauHinh failed:', e);
      return false;
    }
  }

  static async getBrandConfig(): Promise<any> {
    try {
      return await firebaseAPI.getCauHinh('brandConfig');
    } catch (e) {
      console.error('ConfigService.getBrandConfig failed:', e);
      return null;
    }
  }
}
