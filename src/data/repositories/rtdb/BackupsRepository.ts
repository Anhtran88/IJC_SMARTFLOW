import { RTBaseRepository } from './RTBaseRepository';

export class BackupsRepository extends RTBaseRepository<any> {
  constructor() {
    super('backups');
  }
}

export const backupsRepository = new BackupsRepository();
