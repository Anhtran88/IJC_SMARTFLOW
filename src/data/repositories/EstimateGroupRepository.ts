import { BaseRepository } from './BaseRepository';
import { EstimateGroup } from '../../../types'; // Re-use existing type if available

export class EstimateGroupRepository extends BaseRepository<EstimateGroup> {
  constructor() {
    super('estimateGroups');
  }
}

export const estimateGroupRepository = new EstimateGroupRepository();
