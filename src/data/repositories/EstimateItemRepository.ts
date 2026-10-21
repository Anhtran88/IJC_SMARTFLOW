import { BaseRepository } from './BaseRepository';
import { EstimateItem } from '../../../types'; // Re-use existing type if available

export class EstimateItemRepository extends BaseRepository<EstimateItem> {
  constructor() {
    super('estimateItems');
  }
}

export const estimateItemRepository = new EstimateItemRepository();
