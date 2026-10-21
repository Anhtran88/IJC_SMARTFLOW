import { RTBaseRepository } from './RTBaseRepository';

export class MaterialsRepository extends RTBaseRepository<any> {
  constructor() {
    super('materials');
  }
}

export const materialsRepository = new MaterialsRepository();
