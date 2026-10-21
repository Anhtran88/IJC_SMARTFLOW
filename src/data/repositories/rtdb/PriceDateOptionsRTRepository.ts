import { RTBaseRepository } from './RTBaseRepository';
import { removeUndefined } from '../../../lib/firebaseService';

export class PriceDateOptionsRTRepository extends RTBaseRepository<any> {
  constructor() {
    super('priceDateOptions');
  }

  async getPriceDateOptions(loaiVatTu: string): Promise<any> {
    return this.get(loaiVatTu);
  }

  async savePriceDateOptions(loaiVatTu: string, options: any): Promise<void> {
    await this.set(removeUndefined(options), loaiVatTu);
  }
}

export const priceDateOptionsRTRepository = new PriceDateOptionsRTRepository();
