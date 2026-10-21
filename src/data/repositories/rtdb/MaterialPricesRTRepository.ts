import { RTBaseRepository } from './RTBaseRepository';
import { removeUndefined } from '../../../lib/firebaseService';

export class MaterialPricesRTRepository extends RTBaseRepository<any> {
  constructor() {
    super('materialPrices');
  }

  async getMaterialPrices(loaiVatTu: string): Promise<any> {
    return this.get(loaiVatTu);
  }

  async saveMaterialPrices(loaiVatTu: string, prices: any): Promise<void> {
    await this.set(removeUndefined(prices), loaiVatTu);
  }
}

export const materialPricesRTRepository = new MaterialPricesRTRepository();
