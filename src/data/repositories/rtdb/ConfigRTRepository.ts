import { RTBaseRepository } from './RTBaseRepository';
import { removeUndefined } from '../../../lib/firebaseService';

export class ConfigRTRepository extends RTBaseRepository<any> {
  constructor() {
    super('cauHinh');
  }

  async getCauHinh(loaiVatTu: string): Promise<any> {
    return this.get(loaiVatTu);
  }

  async saveCauHinh(loaiVatTu: string, data: any): Promise<void> {
    await this.set(removeUndefined(data), loaiVatTu);
  }
}

export const configRTRepository = new ConfigRTRepository();
