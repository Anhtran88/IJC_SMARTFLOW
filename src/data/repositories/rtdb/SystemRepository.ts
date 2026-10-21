import { RTBaseRepository } from './RTBaseRepository';

export class SystemRepository extends RTBaseRepository<any> {
  constructor() {
    super('system');
  }
}

export const systemRepository = new SystemRepository();
