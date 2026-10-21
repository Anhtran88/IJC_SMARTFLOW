import { RTBaseRepository } from './RTBaseRepository';

export class LogsRepository extends RTBaseRepository<any> {
  constructor() {
    super('logs');
  }
}

export const logsRepository = new LogsRepository();
